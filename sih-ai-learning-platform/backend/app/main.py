from __future__ import annotations

import hmac
import os

from fastapi import Depends, FastAPI, Header, HTTPException

from .schemas import AssessmentResult, GenerateAssessmentRequest, GeneratedAssessment, GradeAssessmentRequest, HealthResponse, RoleSummary, SubmitAssessmentRequest
from .services import create_assessment, get_assessment, get_role, list_roles, llm_live_configured, score_assessment, score_assessment_payload

app = FastAPI(
    title="GyanSetu Competency & Assessment Engine",
    version="0.2.0",
    description="Independent FastAPI module for role-based competency retrieval, OpenRouter diagnostic generation, MCQ/LLM grading, normalized scoring, competency gaps, and learning recommendations.",
)


def require_service_auth(x_gyansetu_service_key: str | None = Header(default=None)) -> None:
    expected = os.getenv("SERVICE_API_KEY", "").strip()
    if not expected:
        return
    supplied = (x_gyansetu_service_key or "").strip()
    if not supplied or not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Invalid GyanSetu service credential")


def _runtime_error(exc: RuntimeError) -> HTTPException:
    message = str(exc)
    if message == "live_ai_auth_required":
        return HTTPException(status_code=503, detail="Live AI mode requires LLM_API_KEY and LLM_MODEL in the FastAPI server environment.")
    if message.startswith("llm_request_failed:"):
        return HTTPException(status_code=502, detail=message.replace("llm_request_failed:", "AI provider error: ", 1))
    if message.startswith("llm_"):
        return HTTPException(status_code=502, detail=f"AI output validation failed: {message}")
    return HTTPException(status_code=500, detail="Assessment service error")


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service="gyansetu-competency-assessment-engine",
        llm_live_configured=llm_live_configured(),
        service_auth_configured=bool(os.getenv("SERVICE_API_KEY")),
        details={"provider": "OpenRouter", "model": os.getenv("LLM_MODEL", "not configured"), "generation_modes": ["mock", "live"], "grading_modes": ["mock", "live"]},
    )


@app.get("/roles", response_model=list[RoleSummary], dependencies=[Depends(require_service_auth)])
def roles() -> list[RoleSummary]:
    return [RoleSummary(**role) for role in list_roles()]


@app.get("/roles/{role_id}/competencies", dependencies=[Depends(require_service_auth)])
def role_competencies(role_id: str) -> dict:
    try:
        return get_role(role_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Unknown role_id")


@app.post("/assessments/generate", response_model=GeneratedAssessment, dependencies=[Depends(require_service_auth)])
def generate_assessment(payload: GenerateAssessmentRequest) -> GeneratedAssessment:
    try:
        return create_assessment(user_id=payload.user_id, role_id=payload.role_id, assessment_type=payload.assessment_type, question_count=payload.question_count, generation_mode=payload.generation_mode)
    except KeyError:
        raise HTTPException(status_code=404, detail="Unknown role_id")
    except RuntimeError as exc:
        raise _runtime_error(exc)


@app.post("/assessments/grade", response_model=AssessmentResult, dependencies=[Depends(require_service_auth)])
def grade_assessment(payload: GradeAssessmentRequest) -> AssessmentResult:
    try:
        return score_assessment_payload(assessment_id=payload.assessment_id, user_id=payload.user_id, role_id=payload.role_id, assessment_type=payload.assessment_type, questions=payload.questions, responses=payload.responses, grading_mode=payload.grading_mode)
    except KeyError:
        raise HTTPException(status_code=404, detail="Unknown role_id")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except RuntimeError as exc:
        raise _runtime_error(exc)


@app.post("/assessments/{assessment_id}/submit", response_model=AssessmentResult, dependencies=[Depends(require_service_auth)])
def submit_assessment(assessment_id: str, payload: SubmitAssessmentRequest) -> AssessmentResult:
    """Local/testing convenience route; deployed GyanSetu uses /assessments/grade with questions persisted in Neon."""
    try:
        assessment = get_assessment(assessment_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Assessment not found or service was restarted")
    if assessment["user_id"] != payload.user_id:
        raise HTTPException(status_code=400, detail="user_id does not match assessment owner")
    try:
        return score_assessment(assessment, payload.responses, payload.grading_mode)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except RuntimeError as exc:
        raise _runtime_error(exc)
