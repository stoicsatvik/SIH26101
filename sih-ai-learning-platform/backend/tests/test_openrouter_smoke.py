import os
import pytest
from fastapi.testclient import TestClient
from app.main import app

@pytest.mark.skipif(os.getenv("RUN_LIVE_AI_TEST") != "1", reason="manual OpenRouter smoke test")
def test_openrouter_can_generate_structured_assessment():
    assert os.getenv("LLM_API_KEY"), "LLM_API_KEY secret is missing"
    assert os.getenv("LLM_MODEL"), "LLM_MODEL secret is missing"
    response = TestClient(app).post("/assessments/generate", json={"user_id":"CI-SMOKE","role_id":"backend_developer","assessment_type":"baseline","question_count":3,"generation_mode":"live"})
    assert response.status_code == 200, response.text
    payload = response.json()
    assert len(payload["questions"]) == 3
    assert all(q["competency_id"] and q["sub_competency_id"] for q in payload["questions"])
