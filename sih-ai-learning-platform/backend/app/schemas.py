from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, model_validator


class QuestionType(str, Enum):
    mcq = "mcq"
    short_answer = "short_answer"
    long_answer = "long_answer"


class Difficulty(str, Enum):
    easy = "Easy"
    medium = "Medium"
    hard = "Hard"


class EvaluationCriteria(BaseModel):
    key_concepts: list[str] = Field(default_factory=list)
    max_score: float = Field(gt=0)
    rubric: str | None = None


class Question(BaseModel):
    question_id: str
    competency_id: str
    sub_competency_id: str
    question_type: QuestionType
    difficulty: Difficulty
    question: str
    options: list[str] | None = None
    correct_answer: str
    evaluation_criteria: EvaluationCriteria

    @model_validator(mode="after")
    def validate_question_shape(self) -> "Question":
        if self.question_type == QuestionType.mcq:
            if not self.options or len(self.options) != 4:
                raise ValueError("MCQ questions require exactly four options")
            if self.correct_answer not in self.options:
                raise ValueError("MCQ correct_answer must exactly match one option")
        else:
            if self.options is not None:
                raise ValueError("Short/long answer questions must use options=null")
            if not self.evaluation_criteria.key_concepts:
                raise ValueError("Descriptive questions require at least one key concept")
            if not self.evaluation_criteria.rubric:
                raise ValueError("Descriptive questions require a scoring rubric")
        return self


class QuestionsEnvelope(BaseModel):
    questions: list[Question]


class PublicQuestion(BaseModel):
    question_id: str
    competency_id: str
    sub_competency_id: str
    question_type: QuestionType
    difficulty: Difficulty
    question: str
    options: list[str] | None = None


class GenerateAssessmentRequest(BaseModel):
    user_id: str
    role_id: str
    assessment_type: str = Field(default="baseline", pattern="^(baseline|reassessment)$")
    question_count: int = Field(default=8, ge=3, le=30)
    generation_mode: str = Field(default="mock", pattern="^(mock|live)$")


class GeneratedAssessment(BaseModel):
    assessment_id: str
    user_id: str
    role_id: str
    assessment_type: str
    generation_mode: str
    questions: list[PublicQuestion]
    grading_questions: list[Question]


class UserResponse(BaseModel):
    question_id: str
    response: str


class SubmitAssessmentRequest(BaseModel):
    user_id: str
    responses: list[UserResponse]
    grading_mode: str = Field(default="mock", pattern="^(mock|live)$")


class GradeAssessmentRequest(BaseModel):
    assessment_id: str
    user_id: str
    role_id: str
    assessment_type: str = Field(pattern="^(baseline|reassessment)$")
    questions: list[Question]
    responses: list[UserResponse]
    grading_mode: str = Field(default="mock", pattern="^(mock|live)$")


class GradeResult(BaseModel):
    question_id: str
    score_awarded: float = Field(ge=0)
    max_score: float = Field(gt=0)
    key_concepts_identified: list[str] = Field(default_factory=list)
    missing_concepts: list[str] = Field(default_factory=list)
    feedback: str

    @model_validator(mode="after")
    def score_cannot_exceed_max(self) -> "GradeResult":
        if self.score_awarded > self.max_score:
            raise ValueError("score_awarded cannot exceed max_score")
        return self


class GradesEnvelope(BaseModel):
    grades: list[GradeResult]


class SubCompetencyScore(BaseModel):
    sub_competency_id: str
    sub_competency_name: str
    current_score: float
    required_level: int
    required_score: float
    gap: float


class CompetencyScore(BaseModel):
    competency_id: str
    competency_name: str
    current_score: float
    required_level: int
    required_score: float
    gap: float
    sub_competencies: list[SubCompetencyScore]


class CourseRecommendation(BaseModel):
    course_id: str
    course_title: str
    provider: str
    external_url: str
    competency_id: str
    competency_name: str
    sub_competency_id: str
    sub_competency_name: str
    gap: float
    priority: str
    reason: str


class AssessmentResult(BaseModel):
    assessment_id: str
    user_id: str
    role_id: str
    assessment_type: str
    overall_score: float
    grades: list[GradeResult]
    competencies: list[CompetencyScore]
    recommendations: list[CourseRecommendation] = Field(default_factory=list)


class RoleSummary(BaseModel):
    role_id: str
    role_name: str
    domain: str
    description: str


class HealthResponse(BaseModel):
    status: str
    service: str
    llm_live_configured: bool
    service_auth_configured: bool
    details: dict[str, Any] = Field(default_factory=dict)
