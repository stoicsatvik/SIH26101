from __future__ import annotations

import json
import os
import re
from functools import lru_cache
from pathlib import Path
from statistics import mean
from uuid import uuid4

import httpx
from pydantic import ValidationError

from .schemas import (
    AssessmentResult,
    CompetencyScore,
    CourseRecommendation,
    Difficulty,
    EvaluationCriteria,
    GeneratedAssessment,
    GradeResult,
    GradesEnvelope,
    PublicQuestion,
    Question,
    QuestionsEnvelope,
    QuestionType,
    SubCompetencyScore,
    UserResponse,
)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
FRAMEWORK_PATH = PROJECT_ROOT / "mock-db" / "competency-mockdb-userrole.json"
COURSE_CATALOG_PATH = PROJECT_ROOT / "mock-db" / "course-catalog.json"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
LEVEL_MINIMUM_SCORES = {1: 25.0, 2: 50.0, 3: 75.0, 4: 90.0}
ASSESSMENTS: dict[str, dict] = {}


@lru_cache(maxsize=1)
def load_framework() -> dict:
    with FRAMEWORK_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


@lru_cache(maxsize=1)
def load_course_catalog() -> dict:
    if not COURSE_CATALOG_PATH.exists():
        return {"courses": []}
    with COURSE_CATALOG_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def list_roles() -> list[dict]:
    return [
        {
            "role_id": role["role_id"],
            "role_name": role["role_name"],
            "domain": role.get("domain", ""),
            "description": role.get("description", ""),
        }
        for role in load_framework()["roles"]
    ]


def get_role(role_id: str) -> dict:
    for role in load_framework()["roles"]:
        if role["role_id"] == role_id:
            return role
    raise KeyError(role_id)


def required_score_for_level(level: int) -> float:
    try:
        return LEVEL_MINIMUM_SCORES[int(level)]
    except (KeyError, ValueError) as exc:
        raise ValueError(f"Unsupported proficiency level: {level}") from exc


def llm_live_configured() -> bool:
    return bool(os.getenv("LLM_API_KEY") and os.getenv("LLM_MODEL"))


def _openrouter_headers() -> dict[str, str]:
    key = os.getenv("LLM_API_KEY", "").strip()
    if not key:
        raise RuntimeError("live_ai_auth_required")
    return {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "HTTP-Referer": os.getenv("OPENROUTER_SITE_URL", "https://gyansetu.local"),
        "X-Title": os.getenv("OPENROUTER_APP_NAME", "GyanSetu SIH26101"),
    }


def _extract_json_content(content: object) -> dict:
    if isinstance(content, dict):
        return content
    if not isinstance(content, str):
        raise RuntimeError("llm_invalid_response")
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        value = json.loads(text)
    except json.JSONDecodeError as exc:
        raise RuntimeError("llm_invalid_json") from exc
    if not isinstance(value, dict):
        raise RuntimeError("llm_invalid_json")
    return value


def _call_openrouter_json(*, system_prompt: str, user_prompt: str, schema_name: str, schema: dict) -> dict:
    if not llm_live_configured():
        raise RuntimeError("live_ai_auth_required")

    model = os.getenv("LLM_MODEL", "").strip()
    base_payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.15,
        "max_tokens": 10000,
    }
    attempts = [
        {
            **base_payload,
            "provider": {"require_parameters": True},
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": schema_name, "strict": True, "schema": schema},
            },
        },
        {**base_payload, "response_format": {"type": "json_object"}},
        base_payload,
    ]

    last_error: str | None = None
    with httpx.Client(timeout=httpx.Timeout(90.0, connect=15.0)) as client:
        for payload in attempts:
            try:
                response = client.post(OPENROUTER_URL, headers=_openrouter_headers(), json=payload)
            except httpx.HTTPError as exc:
                last_error = str(exc)
                continue
            if response.status_code >= 400:
                last_error = f"OpenRouter {response.status_code}: {response.text[:500]}"
                continue
            data = response.json()
            try:
                content = data["choices"][0]["message"]["content"]
            except (KeyError, IndexError, TypeError) as exc:
                raise RuntimeError("llm_invalid_response") from exc
            return _extract_json_content(content)
    raise RuntimeError(f"llm_request_failed:{last_error or 'unknown error'}")


def build_quiz_generation_prompt(role: dict, question_count: int, assessment_type: str) -> str:
    return f"""Generate exactly {question_count} questions for a GyanSetu {assessment_type} diagnostic assessment.

Use ONLY the supplied role competency framework. Never invent competency IDs or sub-competency IDs.
Every question must map to exactly one competency_id and one sub_competency_id that actually belong together in the framework.
Maximize coverage across competencies and sub-competencies before repeating an area.
Use a useful mix of mcq, short_answer, and long_answer questions. Prefer roughly 50% MCQ, 30% short answer, and 20% long answer when the requested count allows it.
Use Easy, Medium, or Hard for difficulty and align difficulty with the required proficiency level.

Question rules:
1. MCQ: options must contain exactly four plausible options; correct_answer must exactly equal one option; evaluation_criteria.max_score must be 1.
2. short_answer/long_answer: options must be null. Create a reference correct_answer and an evaluation_criteria object.
3. For descriptive answers, YOU decide the verification structure by creating precise key_concepts, max_score, and a partial-credit rubric based on the competency definition and required level.
4. Questions must assess demonstrated technical understanding, not opinions or trivia.
5. Avoid duplicates and avoid content outside the supplied framework.
6. Return only data matching the required JSON schema.

ROLE COMPETENCY FRAMEWORK:
{json.dumps(role, ensure_ascii=False, indent=2)}
"""


def _validate_generated_questions(role: dict, questions: list[Question], question_count: int) -> list[Question]:
    competency_map = {item["competency_id"]: item for item in role["competencies"]}
    valid_pairs = {
        (competency["competency_id"], sub["sub_competency_id"])
        for competency in role["competencies"]
        for sub in competency["sub_competencies"]
    }
    if len(questions) != question_count:
        raise RuntimeError("llm_question_count_mismatch")
    seen_text: set[str] = set()
    validated: list[Question] = []
    for index, question in enumerate(questions, start=1):
        if question.competency_id not in competency_map:
            raise RuntimeError("llm_invalid_competency_mapping")
        if (question.competency_id, question.sub_competency_id) not in valid_pairs:
            raise RuntimeError("llm_invalid_sub_competency_mapping")
        normalized_text = " ".join(question.question.casefold().split())
        if normalized_text in seen_text:
            raise RuntimeError("llm_duplicate_question")
        seen_text.add(normalized_text)
        payload = question.model_dump()
        payload["question_id"] = f"Q{index:03d}"
        if question.question_type == QuestionType.mcq:
            payload["evaluation_criteria"]["max_score"] = 1
        validated.append(Question(**payload))
    return validated


def generate_live_questions(role: dict, question_count: int, assessment_type: str) -> list[Question]:
    prompt = build_quiz_generation_prompt(role, question_count, assessment_type)
    raw = _call_openrouter_json(
        system_prompt=(
            "You are GyanSetu's diagnostic assessment generator. Produce fair, role-linked questions and "
            "machine-valid JSON only. The supplied competency framework is the source of truth."
        ),
        user_prompt=prompt,
        schema_name="gyansetu_questions",
        schema=QuestionsEnvelope.model_json_schema(),
    )
    try:
        envelope = QuestionsEnvelope.model_validate(raw)
    except ValidationError as exc:
        raise RuntimeError(f"llm_schema_validation_failed:{exc}") from exc
    return _validate_generated_questions(role, envelope.questions, question_count)


def _flatten_sub_competencies(role: dict) -> list[tuple[dict, dict]]:
    return [(competency, sub) for competency in role["competencies"] for sub in competency["sub_competencies"]]


def _mock_key_concepts(sub: dict) -> list[str]:
    concepts = sub.get("key_concepts")
    return list(concepts) if concepts else [sub["name"], "practical application"]


def generate_mock_questions(role: dict, question_count: int) -> list[Question]:
    flattened = _flatten_sub_competencies(role)
    if not flattened:
        return []
    questions: list[Question] = []
    for i in range(question_count):
        competency, sub = flattened[i % len(flattened)]
        qid = f"Q{i + 1:03d}"
        concepts = _mock_key_concepts(sub)
        mode = i % 3
        if mode == 0:
            correct = sub["definition"]
            questions.append(Question(
                question_id=qid, competency_id=competency["competency_id"], sub_competency_id=sub["sub_competency_id"],
                question_type=QuestionType.mcq, difficulty=Difficulty.medium, question=f"Which description best matches {sub['name']}?",
                options=[correct, "A visual styling technique unrelated to this competency.", "An administrative workflow that replaces technical validation.", "A method that always removes the need for testing or review."],
                correct_answer=correct, evaluation_criteria=EvaluationCriteria(key_concepts=concepts, max_score=1),
            ))
        else:
            qtype = QuestionType.short_answer if mode == 1 else QuestionType.long_answer
            max_score = 5 if qtype == QuestionType.short_answer else 10
            questions.append(Question(
                question_id=qid, competency_id=competency["competency_id"], sub_competency_id=sub["sub_competency_id"], question_type=qtype,
                difficulty=Difficulty.medium if qtype == QuestionType.short_answer else Difficulty.hard,
                question=f"Explain {sub['name']} in the context of {competency['name']} and describe why it matters.", options=None, correct_answer=sub["definition"],
                evaluation_criteria=EvaluationCriteria(key_concepts=concepts, max_score=max_score, rubric="Award full credit for an accurate explanation that covers all key concepts and relates the concept to practical role performance. Award proportional partial credit for correct but incomplete reasoning."),
            ))
    return questions


def create_assessment(user_id: str, role_id: str, assessment_type: str, question_count: int, generation_mode: str) -> GeneratedAssessment:
    role = get_role(role_id)
    questions = generate_live_questions(role, question_count, assessment_type) if generation_mode == "live" else generate_mock_questions(role, question_count)
    assessment_id = f"ASM-{uuid4().hex[:12].upper()}"
    ASSESSMENTS[assessment_id] = {"assessment_id": assessment_id, "user_id": user_id, "role_id": role_id, "assessment_type": assessment_type, "questions": questions}
    return GeneratedAssessment(
        assessment_id=assessment_id, user_id=user_id, role_id=role_id, assessment_type=assessment_type, generation_mode=generation_mode,
        questions=[PublicQuestion(**q.model_dump(exclude={"correct_answer", "evaluation_criteria"})) for q in questions], grading_questions=questions,
    )


def grade_mcq(question: Question, response: str) -> GradeResult:
    max_score = question.evaluation_criteria.max_score
    correct = response.strip() == question.correct_answer.strip()
    return GradeResult(question_id=question.question_id, score_awarded=max_score if correct else 0, max_score=max_score,
        key_concepts_identified=question.evaluation_criteria.key_concepts if correct else [], missing_concepts=[] if correct else question.evaluation_criteria.key_concepts,
        feedback="Correct answer." if correct else "The selected answer does not match the expected answer.")


def grade_descriptive_mock(question: Question, response: str) -> GradeResult:
    concepts = question.evaluation_criteria.key_concepts
    response_lower = response.casefold()
    identified = [concept for concept in concepts if concept.casefold() in response_lower]
    missing = [concept for concept in concepts if concept not in identified]
    max_score = question.evaluation_criteria.max_score
    ratio = (len(identified) / len(concepts)) if concepts else (1.0 if response.strip() else 0.0)
    score = round(max_score * ratio, 2)
    feedback = "The response covers all configured key concepts." if score == max_score else "The response did not clearly demonstrate the configured key concepts." if score == 0 else "The response demonstrates some required concepts but is incomplete."
    return GradeResult(question_id=question.question_id, score_awarded=score, max_score=max_score, key_concepts_identified=identified, missing_concepts=missing, feedback=feedback)


def grade_descriptive_live(items: list[tuple[Question, str]]) -> dict[str, GradeResult]:
    if not items:
        return {}
    grading_items = [{"question_id": q.question_id, "question": q.question, "student_response": response, "reference_answer": q.correct_answer, "evaluation_criteria": q.evaluation_criteria.model_dump()} for q, response in items]
    prompt = f"""Grade the following GyanSetu short/long-answer responses.

For every item, use ONLY the supplied question, student response, reference answer, key concepts, max score, and rubric.
Do not reward information that does not answer the question. Do not punish wording differences when the same concept is correctly expressed.
The score must be between 0 and max_score. key_concepts_identified and missing_concepts must use the supplied key-concept labels.
Return one grade for every question_id and no extras.

INPUTS:
{json.dumps(grading_items, ensure_ascii=False, indent=2)}
"""
    raw = _call_openrouter_json(
        system_prompt="You are GyanSetu's rubric-grounded assessment grader. Grade consistently and return structured JSON only. Never infer a learner's score from prior history, identity, or course completion.",
        user_prompt=prompt, schema_name="gyansetu_grades", schema=GradesEnvelope.model_json_schema(),
    )
    try:
        envelope = GradesEnvelope.model_validate(raw)
    except ValidationError as exc:
        raise RuntimeError(f"llm_grading_schema_validation_failed:{exc}") from exc
    expected = {question.question_id: question for question, _ in items}
    received = {grade.question_id: grade for grade in envelope.grades}
    if set(received) != set(expected):
        raise RuntimeError("llm_grading_question_mismatch")
    normalized: dict[str, GradeResult] = {}
    for question_id, grade in received.items():
        question = expected[question_id]
        max_score = question.evaluation_criteria.max_score
        allowed = question.evaluation_criteria.key_concepts
        identified = [c for c in allowed if c in grade.key_concepts_identified]
        missing = [c for c in allowed if c not in identified]
        normalized[question_id] = GradeResult(question_id=question_id, score_awarded=min(max(grade.score_awarded, 0), max_score), max_score=max_score,
            key_concepts_identified=identified, missing_concepts=missing, feedback=grade.feedback.strip() or "Response graded against the supplied rubric.")
    return normalized


def _build_recommendations(role: dict, competency_results: list[CompetencyScore]) -> list[CourseRecommendation]:
    courses = load_course_catalog().get("courses", [])
    role_courses = [c for c in courses if role["role_id"] in c.get("role_ids", [])]
    gaps: list[tuple[CompetencyScore, SubCompetencyScore]] = []
    for competency in competency_results:
        for sub in competency.sub_competencies:
            if sub.gap > 0:
                gaps.append((competency, sub))
    gaps.sort(key=lambda pair: pair[1].gap, reverse=True)
    recommendations: list[CourseRecommendation] = []
    used_courses: set[str] = set()
    for competency, sub in gaps:
        search_tokens = {competency.competency_name.casefold(), sub.sub_competency_name.casefold()}
        chosen = None
        for course in role_courses:
            if course["course_id"] in used_courses:
                continue
            tags = {str(tag).casefold() for tag in course.get("tags", [])}
            if any(token in tags or any(token in tag or tag in token for tag in tags) for token in search_tokens):
                chosen = course
                break
        if chosen is None:
            chosen = next((c for c in role_courses if c["course_id"] not in used_courses), None)
        if chosen is None:
            continue
        used_courses.add(chosen["course_id"])
        priority = "High" if sub.gap >= 25 else "Medium" if sub.gap >= 10 else "Low"
        recommendations.append(CourseRecommendation(course_id=chosen["course_id"], course_title=chosen["title"], provider=chosen.get("provider", "iGOT Karmayogi (mock mapping)"), external_url=chosen.get("external_url", "https://igotkarmayogi.gov.in/"), competency_id=competency.competency_id, competency_name=competency.competency_name, sub_competency_id=sub.sub_competency_id, sub_competency_name=sub.sub_competency_name, gap=sub.gap, priority=priority, reason=f"{sub.sub_competency_name} is {sub.gap:.1f} points below the required proficiency threshold for {role['role_name']}."))
        if len(recommendations) >= 3:
            break
    return recommendations


def score_assessment_payload(*, assessment_id: str, user_id: str, role_id: str, assessment_type: str, questions: list[Question], responses: list[UserResponse], grading_mode: str) -> AssessmentResult:
    question_by_id = {q.question_id: q for q in questions}
    response_by_id = {item.question_id: item.response for item in responses}
    missing = [qid for qid in question_by_id if qid not in response_by_id]
    unknown = [qid for qid in response_by_id if qid not in question_by_id]
    if missing:
        raise ValueError(f"Missing responses for: {', '.join(missing)}")
    if unknown:
        raise ValueError(f"Unknown question ids: {', '.join(unknown)}")
    grades: list[GradeResult] = []
    descriptive: list[tuple[Question, str]] = []
    for question in questions:
        response = response_by_id[question.question_id]
        if question.question_type == QuestionType.mcq:
            grades.append(grade_mcq(question, response))
        else:
            descriptive.append((question, response))
    if grading_mode == "live":
        live_grades = grade_descriptive_live(descriptive)
        grades.extend(live_grades[q.question_id] for q, _ in descriptive)
    else:
        grades.extend(grade_descriptive_mock(q, response) for q, response in descriptive)
    grade_by_id = {grade.question_id: grade for grade in grades}
    grades = [grade_by_id[q.question_id] for q in questions]
    role = get_role(role_id)
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
            sub_results.append(SubCompetencyScore(sub_competency_id=sub["sub_competency_id"], sub_competency_name=sub["name"], current_score=current, required_level=sub["required_level"], required_score=required, gap=round(max(required - current, 0), 2)))
        if not sub_results:
            continue
        current_competency = round(mean(item.current_score for item in sub_results), 2)
        required_competency = required_score_for_level(competency["required_level"])
        competency_results.append(CompetencyScore(competency_id=competency["competency_id"], competency_name=competency["name"], current_score=current_competency, required_level=competency["required_level"], required_score=required_competency, gap=round(max(required_competency - current_competency, 0), 2), sub_competencies=sub_results))
    total_awarded = sum(grade.score_awarded for grade in grades)
    total_maximum = sum(grade.max_score for grade in grades)
    overall = round((total_awarded / total_maximum) * 100, 2) if total_maximum else 0.0
    recommendations = _build_recommendations(role, competency_results)
    return AssessmentResult(assessment_id=assessment_id, user_id=user_id, role_id=role_id, assessment_type=assessment_type, overall_score=overall, grades=grades, competencies=competency_results, recommendations=recommendations)


def score_assessment(assessment: dict, responses: list[UserResponse], grading_mode: str) -> AssessmentResult:
    return score_assessment_payload(assessment_id=assessment["assessment_id"], user_id=assessment["user_id"], role_id=assessment["role_id"], assessment_type=assessment["assessment_type"], questions=assessment["questions"], responses=responses, grading_mode=grading_mode)


def get_assessment(assessment_id: str) -> dict:
    try:
        return ASSESSMENTS[assessment_id]
    except KeyError as exc:
        raise KeyError(assessment_id) from exc
