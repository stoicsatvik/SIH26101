# GyanSetu Competency & Assessment Engine

Independent FastAPI service for the role → diagnostic assessment → competency-gap → recommendation → learning → reassessment loop.

## Flow

`competency-mockdb-userrole.json → selected role → OpenRouter quiz generator → MCQ exact match / short+long LLM rubric grading → normalized sub-competency scores → competency gaps → mock iGOT recommendations`.

The AI creates descriptive-question verification criteria (`key_concepts`, `max_score`, `rubric`). Course completion never changes competency; reassessment does.

## Question contract

Every generated question includes:
- `question_id`
- `competency_id`
- `sub_competency_id`
- `question_type` (`mcq`, `short_answer`, `long_answer`)
- `difficulty`
- `question`
- `options` (`null` for descriptive questions)
- `correct_answer`
- `evaluation_criteria`

Descriptive grading returns:
- `question_id`
- `score_awarded`
- `max_score`
- `key_concepts_identified`
- `missing_concepts`
- `feedback`

## FastAPI environment

Configure as server-side secrets:
- `LLM_API_KEY` — OpenRouter API key.
- `LLM_MODEL` — e.g. `openrouter/free`.
- `OPENROUTER_SITE_URL` — optional public GyanSetu URL sent as OpenRouter metadata.
- `OPENROUTER_APP_NAME` — optional application label.
- `SERVICE_API_KEY` — optional shared secret for Worker → FastAPI calls.

GitHub Actions repository secrets are used by CI/manual smoke tests. They are **not** automatically runtime secrets on Vercel or another FastAPI host.

## Local run

```bash
cd sih-ai-learning-platform/backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000 --env-file .env
```

Swagger: `http://127.0.0.1:8000/docs`

Tests:

```bash
PYTHONPATH=. pytest -q
```

## Vercel deployment

Import the Git repository into Vercel and configure:

- Root Directory: `sih-ai-learning-platform/backend`
- Production/preview branch while testing: `feature/competency-assessment-engine`
- Framework: FastAPI / Python (auto-detected)

The backend includes:
- `pyproject.toml` with `app.main:app` as the Vercel entrypoint.
- `vercel.json` with the FastAPI function duration configuration.

Add Vercel environment variables:

```text
LLM_API_KEY=<OpenRouter key>
LLM_MODEL=openrouter/free
OPENROUTER_APP_NAME=GyanSetu SIH26101
```

Optional service-to-service authentication:

```text
SERVICE_API_KEY=<random shared secret>
```

After deployment verify:

```text
GET /health
```

`llm_live_configured` should be `true` when the OpenRouter variables are present.

## Cloudflare Worker integration

The existing Cloudflare Worker remains the employee authentication and persistence gateway. Configure these Worker variables/secrets:

- `DATABASE_URL` — Neon connection string.
- `ASSESSMENT_API_URL` — deployed FastAPI base URL, without a trailing slash.
- `ASSESSMENT_SERVICE_KEY` — same value as FastAPI `SERVICE_API_KEY` when enabled.
- `ASSESSMENT_MODE` — `live` for OpenRouter or `mock` for deterministic testing.

The Worker:
1. authenticates the employee,
2. saves/selects the employee role,
3. requests a role-specific assessment from FastAPI,
4. stores private grading questions in Neon,
5. sends only public question fields to the browser,
6. submits answers for grading,
7. persists competency/sub-competency results,
8. exposes recommendations and history to the dashboard.

## Database

Apply, in order:

```text
migrations/001_auth_profile_schema.sql
migrations/002_competency_assessment_schema.sql
```

Migration 002 adds assessment sessions, assessment history, competency results, sub-competency results, learning activity, employee role linkage, and baseline-assessment state.

## Security boundaries

- OpenRouter keys stay only on the FastAPI server.
- The browser never receives reference answers or rubrics.
- The Cloudflare Worker owns user sessions and database access.
- FastAPI can optionally require `x-gyansetu-service-key` for Worker calls.
- iGOT course links are currently mock mappings; official API authentication must replace that adapter when credentials become available.
