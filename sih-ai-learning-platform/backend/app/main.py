from fastapi import FastAPI, HTTPException

from .schemas import (
    AssessmentResult,
    GenerateAssessmentRequest,
    GeneratedAssessment,
    HealthResponse,
    RoleSummary,
    SubmitAssessmentRequest,
)
from .services import (
    create_assessment,
    get_assessment,
    get_role,
    list_roles,
    llm_live_configured,
    score_assessment,
)

app = FastAPI(
    title="GyanSetu Competency & Assessment Engine",
    version="0.1.0",
    description=(
        "Independent FastAPI module for role-based competency retrieval, diagnostic assessment generation, "
        "question routing, grading, normalized scoring, and competency-gap calculation."
    ),
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service="gyansetu-competency-assessment-engine",
        llm_live_configured=llm_live_configured(),
        details={
            "generation_modes": ["mock", "live (provider auth pending)"],
            "grading_modes": ["mock", "live (provider auth pending)"],
            "auth_integration": "not touched",
        },
    )


@app.get("/roles", response_model=list[RoleSummary])
def roles() -> list[RoleSummary]:
    return [RoleSummary(**role) for role in list_roles()]


@app.get("/roles/{role_id}/competencies")
def role_competencies(role_id: str) -> dict:
    try:
        return get_role(role_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Unknown role_id")


@app.post("/assessments/generate", response_model=GeneratedAssessment)
def generate_assessment(payload: GenerateAssessmentRequest) -> GeneratedAssessment:
    try:
        return create_assessment(
            user_id=payload.user_id,
            role_id=payload.role_id,
            assessment_type=payload.assessment_type,
            question_count=payload.question_count,
            generation_mode=payload.generation_mode,
        )
    except KeyError:
        raise HTTPException(status_code=404, detail="Unknown role_id")
    except RuntimeError as exc:
        if str(exc) == "live_ai_auth_required":
            raise HTTPException(
                status_code=503,
                detail=(
                    "Live AI generation is intentionally not connected yet because provider authentication "
                    "has not been approved/configured. Use generation_mode='mock' for local testing."
                ),
            )
        raise


@app.post("/assessments/{assessment_id}/submit", response_model=AssessmentResult)
def submit_assessment(assessment_id: str, payload: SubmitAssessmentRequest) -> AssessmentResult:
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
        if str(exc) == "live_ai_auth_required":
            raise HTTPException(
                status_code=503,
                detail=(
                    "Live short/long-answer grading is intentionally not connected yet because provider "
                    "authentication has not been approved/configured. Use grading_mode='mock' for local testing."
                ),
            )
        raise
