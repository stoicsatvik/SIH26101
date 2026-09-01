# GyanSetu Competency & Assessment Engine

Independent FastAPI service for the role → assessment → competency-gap → recommendation loop.

## Flow

`competency-mockdb-userrole.json → selected role → OpenRouter quiz generator → MCQ exact match / short+long LLM rubric grading → normalized sub-competency scores → competency gaps → mock iGOT recommendations`.

The AI creates descriptive-question verification criteria (`key_concepts`, `max_score`, `rubric`). Course completion never changes competency; reassessment does.

## FastAPI environment

Configure as server-side secrets:
- `LLM_API_KEY` — OpenRouter API key.
- `LLM_MODEL` — e.g. `openrouter/free`.
- `SERVICE_API_KEY` — optional shared secret for Worker → FastAPI calls.

GitHub Actions repository secrets are used by CI/manual smoke tests. They are not automatically runtime secrets on an arbitrary FastAPI host.

## Local run

```bash
cd sih-ai-learning-platform/backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000 --env-file .env
```

Swagger: `http://127.0.0.1:8000/docs`

## Worker configuration

The existing Cloudflare Worker remains the employee authentication gateway. Configure:
- `DATABASE_URL` — existing Neon connection secret.
- `ASSESSMENT_API_URL` — deployed FastAPI base URL.
- `ASSESSMENT_SERVICE_KEY` — same value as FastAPI `SERVICE_API_KEY` when enabled.
- `ASSESSMENT_MODE` — `live` for OpenRouter or `mock` for deterministic testing.

The Worker authenticates the user, resolves the saved role, stores private grading questions/results in Neon, and only sends public question fields to the browser.
