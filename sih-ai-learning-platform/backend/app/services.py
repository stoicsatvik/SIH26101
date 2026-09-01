from __future__ import annotations

import json
import os
from collections import defaultdict
from functools import lru_cache
from pathlib import Path
from statistics import mean
from uuid import uuid4

from .schemas import (
    AssessmentResult,
    CompetencyScore,
    Difficulty,
    EvaluationCriteria,
    GeneratedAssessment,
    GradeResult,
    PublicQuestion,
    Question,
    QuestionType,
    SubCompetencyScore,
    UserResponse,
)

FRAMEWORK_PATH = Path(__file__).parent / "data" / "competency_framework.json"
ASSESSMENTS: dict[str, dict] = {}


@lru_cache(maxsize=1)
def load_framework() -> dict:
    with FRAMEWORK_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def list_roles() -> list[dict]:
    framework = load_framework()
    return [
        {
            "role_id": role["role_id"],
            "role_name": role["role_name"],
            "domain": role["domain"],
            "description": role["description"],
        }
        for role in framework["roles"]
    ]


def get_role(role_id: str) -> dict:
    for role in load_framework()["roles"]:
        if role["role_id"] == role_id:
            return role
    raise KeyError(role_id)


def required_score_for_level(level: int) -> float:
    levels = load_framework()["proficiency_levels"]
    return float(levels[str(level)]["minimum_score"])


def llm_live_configured() -> bool:
    # Deliberately does not connect to any provider yet. Live provider auth is
    # added only after the project owner chooses the provider/credential flow.
    return bool(os.getenv("LLM_API_KEY") and os.getenv("LLM_MODEL"))


def build_quiz_generation_prompt(role: dict, question_count: int, assessment_type: str) -> str:
    expected_question = {
        "question_id": "Q102",
        "competency_id": "COMP_DB_01",
        "sub_competency_id": "SUB_IDX_04",
        "question_type": "short_answer",
        "difficulty": "Medium",
        "question": "Explain how a B-Tree index improves query performance in a relational database.",
        "options": None,
        "correct_answer": "Reference answer used by the grader.",
        "evaluation_criteria": {
            "key_concepts": ["concept one", "concept two"],
            "max_score": 5,
            "rubric": "Explain how partial and full credit should be awarded."
        }
    }
    return f"""You are the GyanSetu Diagnostic Quiz Generator.

Generate exactly {question_count} questions for a {assessment_type} competency assessment.
Use ONLY the supplied role competency framework. Do not invent competencies or sub-competencies.
Every question must map to exactly one competency_id and one sub_competency_id from the framework.
Create a useful mix of MCQ, short_answer, and long_answer questions unless the competency is unsuitable.
Use Easy, Medium, or Hard for difficulty.

Question rules:
1. MCQ: options must contain 4 plausible options, correct_answer must exactly equal one option, max_score should normally be 1.
2. short_answer/long_answer: options must be null. Provide a reference answer plus evaluation_criteria.
3. For descriptive answers, evaluation_criteria must include key_concepts, max_score, and a concrete rubric for partial credit.
4. Questions must test demonstrated understanding, not personal opinions.
5. Avoid duplicate questions and avoid material outside the supplied framework.
6. Return JSON only as an object with a single `questions` array.

Required question object shape:
{json.dumps(expected_question, indent=2)}

ROLE COMPETENCY FRAMEWORK:
{json.dumps(role, indent=2)}
"""


def _flatten_sub_competencies(role: dict) -> list[tuple[dict, dict]]:
    flattened: list[tuple[dict, dict]] = []
    for competency in role["competencies"]:
        for sub in competency["sub_competencies"]:
            flattened.append((competency, sub))
    return flattened


def generate_mock_questions(role: dict, question_count: int) -> list[Question]:
    """Deterministic local questions for wiring/testing before live AI auth exists."""
    flattened = _flatten_sub_competencies(role)
    if not flattened:
        return []

    questions: list[Question] = []
    for i in range(question_count):
        competency, sub = flattened[i % len(flattened)]
        qid = f"Q{i + 1:03d}"
        key_concepts = sub.get("key_concepts", [sub["name"]])
        mode = i % 3

        if mode == 0:
            correct = sub["definition"]
            questions.append(
                Question(
                    question_id=qid,
                    competency_id=competency["competency_id"],
                    sub_competency_id=sub["sub_competency_id"],
                    question_type=QuestionType.mcq,
                    difficulty=Difficulty.medium,
                    question=f"Which description best matches {sub['name']}?",
                    options=[
                        correct,
                        "A process used only for visual interface styling.",
                        "A non-technical administrative procedure unrelated to the role.",
                        "A method that always replaces testing and validation."
                    ],
                    correct_answer=correct,
                    evaluation_criteria=EvaluationCriteria(max_score=1, key_concepts=key_concepts),
                )
            )
        else:
            qtype = QuestionType.short_answer if mode == 1 else QuestionType.long_answer
            max_score = 5 if qtype == QuestionType.short_answer else 10
            questions.append(
                Question(
                    question_id=qid,
                    competency_id=competency["competency_id"],
                    sub_competency_id=sub["sub_competency_id"],
                    question_type=qtype,
                    difficulty=Difficulty.medium if qtype == QuestionType.short_answer else Difficulty.hard,
                    question=f"Explain {sub['name']} in the context of {competency['name']} and describe why it matters.",
                    options=None,
                    correct_answer=sub["definition"],
                    evaluation_criteria=EvaluationCriteria(
                        key_concepts=key_concepts,
                        max_score=max_score,
                        rubric=(
                            "Award full marks when the response accurately explains the concept and covers all key concepts. "
                            "Award proportional partial credit for correct but incomplete explanations."
                        ),
                    ),
                )
            )
    return questions


def create_assessment(user_id: str, role_id: str, assessment_type: str, question_count: int, generation_mode: str) -> GeneratedAssessment:
    role = get_role(role_id)
    prompt = build_quiz_generation_prompt(role, question_count, assessment_type)

    if generation_mode == "live":
        raise RuntimeError("live_ai_auth_required")

    questions = generate_mock_questions(role, question_count)
    assessment_id = f"ASM-{uuid4().hex[:12].upper()}"
    ASSESSMENTS[assessment_id] = {
        "assessment_id": assessment_id,
        "user_id": user_id,
        "role_id": role_id,
        "assessment_type": assessment_type,
        "questions": questions,
    }

    return GeneratedAssessment(
        assessment_id=assessment_id,
        user_id=user_id,
        role_id=role_id,
        assessment_type=assessment_type,
        generation_mode=generation_mode,
        questions=[PublicQuestion(**q.model_dump(exclude={"correct_answer", "evaluation_criteria"})) for q in questions],
        generator_prompt=prompt,
    )


def grade_mcq(question: Question, response: str) -> GradeResult:
    max_score = question.evaluation_criteria.max_score
    correct = response.strip() == question.correct_answer.strip()
    return GradeResult(
        question_id=question.question_id,
        score_awarded=max_score if correct else 0,
        max_score=max_score,
        key_concepts_identified=question.evaluation_criteria.key_concepts if correct else [],
        missing_concepts=[] if correct else question.evaluation_criteria.key_concepts,
        feedback="Correct answer." if correct else "The selected answer does not match the expected answer.",
    )


def grade_descriptive_mock(question: Question, response: str) -> GradeResult:
    """Local rubric simulator. Replace with the live LLM grader after provider auth is configured."""
    concepts = question.evaluation_criteria.key_concepts
    response_lower = response.casefold()
    identified = [concept for concept in concepts if concept.casefold() in response_lower]
    missing = [concept for concept in concepts if concept not in identified]
    max_score = question.evaluation_criteria.max_score

    if not concepts:
        ratio = 1.0 if response.strip() else 0.0
    else:
        ratio = len(identified) / len(concepts)

    score = round(max_score * ratio, 2)
    if score == max_score:
        feedback = "The response covers all configured key concepts."
    elif score == 0:
        feedback = "The response did not clearly demonstrate the configured key concepts."
    else:
        feedback = "The response demonstrates some required concepts but is incomplete."

    return GradeResult(
        question_id=question.question_id,
        score_awarded=score,
        max_score=max_score,
        key_concepts_identified=identified,
        missing_concepts=missing,
        feedback=feedback,
    )


def grade_question(question: Question, response: str, grading_mode: str) -> GradeResult:
    if question.question_type == QuestionType.mcq:
        return grade_mcq(question, response)
    if grading_mode == "live":
        raise RuntimeError("live_ai_auth_required")
    return grade_descriptive_mock(question, response)


def _question_maps(questions: list[Question]) -> tuple[dict[str, Question], dict[str, list[Question]]]:
    by_id = {q.question_id: q for q in questions}
    by_sub: dict[str, list[Question]] = defaultdict(list)
    for q in questions:
        by_sub[q.sub_competency_id].append(q)
    return by_id, by_sub


def score_assessment(assessment: dict, responses: list[UserResponse], grading_mode: str) -> AssessmentResult:
    questions: list[Question] = assessment["questions"]
    question_by_id, _ = _question_maps(questions)
    response_by_id = {item.question_id: item.response for item in responses}

    missing = [qid for qid in question_by_id if qid not in response_by_id]
    unknown = [qid for qid in response_by_id if qid not in question_by_id]
    if missing:
        raise ValueError(f"Missing responses for: {', '.join(missing)}")
    if unknown:
        raise ValueError(f"Unknown question ids: {', '.join(unknown)}")

    grades = [
        grade_question(question, response_by_id[question.question_id], grading_mode)
        for question in questions
    ]
    grade_by_id = {grade.question_id: grade for grade in grades}
    role = get_role(assessment["role_id"])

    competency_results: list[CompetencyScore] = []
    for competency in role["competencies"]:
        sub_results: list[SubCompetencyScore] = []
        for sub in competency["sub_competencies"]:
            sub_questions = [q for q in questions if q.sub_competency_id == sub["sub_competency_id"]]
            if not sub_questions:
                continue
            awarded = sum(grade_by_id[q.question_id].score_awarded for q in sub_questions)
            maximum = sum(grade_by_id[q.question_id].max_score for q in sub_questions)
            current = round((awarded / maximum) * 100, 2) if maximum else 0.0
            required = required_score_for_level(sub["required_level"])
            sub_results.append(
                SubCompetencyScore(
                    sub_competency_id=sub["sub_competency_id"],
                    sub_competency_name=sub["name"],
                    current_score=current,
                    required_level=sub["required_level"],
                    required_score=required,
                    gap=round(max(required - current, 0), 2),
                )
            )

        if not sub_results:
            continue
        current_competency = round(mean(item.current_score for item in sub_results), 2)
        required_competency = required_score_for_level(competency["required_level"])
        competency_results.append(
            CompetencyScore(
                competency_id=competency["competency_id"],
                competency_name=competency["name"],
                current_score=current_competency,
                required_level=competency["required_level"],
                required_score=required_competency,
                gap=round(max(required_competency - current_competency, 0), 2),
                sub_competencies=sub_results,
            )
        )

    total_awarded = sum(grade.score_awarded for grade in grades)
    total_maximum = sum(grade.max_score for grade in grades)
    overall = round((total_awarded / total_maximum) * 100, 2) if total_maximum else 0.0

    return AssessmentResult(
        assessment_id=assessment["assessment_id"],
        user_id=assessment["user_id"],
        role_id=assessment["role_id"],
        assessment_type=assessment["assessment_type"],
        overall_score=overall,
        grades=grades,
        competencies=competency_results,
    )


def get_assessment(assessment_id: str) -> dict:
    try:
        return ASSESSMENTS[assessment_id]
    except KeyError as exc:
        raise KeyError(assessment_id) from exc
