from fastapi.testclient import TestClient

from app.main import app
from app.services import get_assessment

client = TestClient(app)


def test_health_and_roles():
    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    roles = client.get("/roles")
    assert roles.status_code == 200
    role_ids = {item["role_id"] for item in roles.json()}
    assert "backend_developer" in role_ids
    assert "hardware_engineer" in role_ids
    assert "network_engineer" in role_ids


def test_role_competency_lookup():
    response = client.get("/roles/backend_developer/competencies")
    assert response.status_code == 200
    payload = response.json()
    assert payload["role_name"] == "Backend Developer"
    competency_ids = {item["competency_id"] for item in payload["competencies"]}
    assert "database_management" in competency_ids


def test_mock_assessment_end_to_end():
    generated = client.post("/assessments/generate", json={"user_id":"EMP001","role_id":"backend_developer","assessment_type":"baseline","question_count":6,"generation_mode":"mock"})
    assert generated.status_code == 200
    body = generated.json()
    assert len(body["questions"]) == 6
    assert "correct_answer" not in body["questions"][0]
    assert "correct_answer" in body["grading_questions"][0]
    internal = get_assessment(body["assessment_id"])
    responses=[]
    for question in internal["questions"]:
        answer = question.correct_answer if question.question_type.value == "mcq" else " ".join(question.evaluation_criteria.key_concepts)
        responses.append({"question_id":question.question_id,"response":answer})
    result = client.post("/assessments/grade", json={"assessment_id":body["assessment_id"],"user_id":"EMP001","role_id":"backend_developer","assessment_type":"baseline","questions":body["grading_questions"],"responses":responses,"grading_mode":"mock"})
    assert result.status_code == 200
    payload=result.json()
    assert payload["overall_score"] == 100.0
    assert payload["competencies"]


def test_live_mode_requires_key(monkeypatch):
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.setenv("LLM_MODEL", "openrouter/free")
    response = client.post("/assessments/generate", json={"user_id":"EMP001","role_id":"backend_developer","assessment_type":"baseline","question_count":3,"generation_mode":"live"})
    assert response.status_code == 503
    assert "LLM_API_KEY" in response.json()["detail"]
