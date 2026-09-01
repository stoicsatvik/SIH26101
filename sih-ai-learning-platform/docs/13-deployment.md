# Deployment

Last updated: 2026-09-02

## Deployment architecture

GyanSetu currently uses a split deployment model:

```text
Browser
  ↓
Cloudflare Worker + static frontend
  ├─ authentication/session handling
  ├─ Neon persistence
  └─ proxy to competency service
          ↓
      FastAPI on Vercel
          ↓
      OpenRouter LLM
```

## Cloudflare application

Worker name: `sih26101`

Root entry points:
- `wrangler.jsonc`
- `package.json`
- `src/worker.js`

`wrangler.jsonc` binds `sih-ai-learning-platform/frontend/` as static `ASSETS`.

The Worker routes:
- `/api/*` to authenticated backend handlers,
- everything else to frontend assets.

Required Worker configuration:

```text
DATABASE_URL=<Neon connection string>
ASSESSMENT_API_URL=<FastAPI Vercel base URL>
ASSESSMENT_MODE=live
```

Optional service authentication:

```text
ASSESSMENT_SERVICE_KEY=<same shared secret used by FastAPI SERVICE_API_KEY>
```

## FastAPI competency service

Vercel project configuration:

```text
Root Directory: sih-ai-learning-platform/backend
Branch during testing: feature/competency-assessment-engine
```

The service uses `pyproject.toml` to expose `app.main:app` as the Vercel FastAPI entrypoint and `vercel.json` for function configuration.

Required Vercel secrets:

```text
LLM_API_KEY=<OpenRouter API key>
LLM_MODEL=openrouter/free
```

Optional:

```text
OPENROUTER_SITE_URL=<public GyanSetu URL>
OPENROUTER_APP_NAME=GyanSetu SIH26101
SERVICE_API_KEY=<shared Worker-to-FastAPI secret>
```

Verify the service using:

```text
GET /health
```

## GitHub Actions

The competency engine workflow runs deterministic FastAPI tests on branch changes and pull requests.

A live OpenRouter smoke test exists as a **manual workflow dispatch** so the free OpenRouter quota is not consumed on every commit.

GitHub Actions secrets:

```text
LLM_API_KEY
LLM_MODEL
```

These CI secrets do not automatically become Vercel runtime environment variables.

## Database

Neon project: `stoicdb`

Migration order:

```text
migrations/001_auth_profile_schema.sql
migrations/002_competency_assessment_schema.sql
```

Migration 002 is committed in the repository but has **not been confirmed as applied to the main Neon branch from this integration session**. The connected Neon migration tool currently rejects its own advertised parameter names, so production schema changes must not be assumed complete.

After applying migration 002, verify that the assessment/session, competency-result, sub-competency-result, and learning-activity tables are present before enabling `ASSESSMENT_MODE=live` for the full web application.

## End-to-end deployment order

1. Apply database migrations.
2. Deploy FastAPI service on Vercel.
3. Add OpenRouter runtime secrets to Vercel.
4. Verify FastAPI `/health`.
5. Configure Cloudflare `ASSESSMENT_API_URL`.
6. Keep `ASSESSMENT_MODE=mock` for first integration test.
7. Test registration → onboarding → baseline → dashboard.
8. Change `ASSESSMENT_MODE=live`.
9. Test OpenRouter quiz generation and descriptive grading.
10. Test recommendation → course completion → reassessment.
11. Merge the feature branch only after the full flow passes.

## Local development

Cloudflare application:

```bash
npm install
npm run dev
```

FastAPI service:

```bash
cd sih-ai-learning-platform/backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000 --env-file .env
```

## Production caution

The iGOT integration in the prototype is an adapter/mock catalogue. Official iGOT authentication, enrolment/completion APIs, and credential synchronization must use interfaces supplied by the authorized government platform when available.
