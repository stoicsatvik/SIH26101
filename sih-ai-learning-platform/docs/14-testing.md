# Testing Strategy

Last updated: 2026-09-04

## Current automated tests

The repository now uses Node's built-in test runner. No additional test framework is required.

Run:

```bash
npm test
```

Current test coverage includes:

- diagnostic question-count calculation (`ceil(sub_competencies / 10) * 10`),
- deterministic question allocation across sub-competencies,
- rejection of AI questions that invent competency/sub-competency IDs,
- exact coverage validation for generated assessments,
- deterministic sub-competency and competency scoring,
- OpenRouter API-key endpoint request shape,
- OpenRouter structured-output schema generation,
- confirmation that the assessment AI payload excludes user PII.

Test files:

- `tests/assessment-core.test.js`
- `tests/openrouter.test.js`

## Live dependency checks

### Existing platform health

`GET /api/health`

Checks the Worker, Neon database connectivity and core auth/profile schema readiness.

### AI provider health

`GET /api/ai/health`

Requirements:

- user must be logged in with the existing GyanSetu prototype session cookie,
- Cloudflare Worker secret `OPENROUTER_API_KEY` must be configured.

The endpoint validates the configured OpenRouter key through OpenRouter's authenticated key endpoint and returns only boolean readiness information. It does not expose the API key, usage or account details.

Expected success response:

```json
{
  "ok": true,
  "openRouterConfigured": true,
  "openRouterReachable": true
}
```

## Testing rules for AI-generated assessments

AI output must never be stored immediately after generation. The sequence is:

```text
OpenRouter
   -> structured JSON
   -> local validator
   -> PASS: persist
   -> FAIL: reject/regenerate
```

The validator must check at least:

- exact question count,
- unique question IDs,
- duplicate question text,
- exactly four non-empty options,
- valid answer A/B/C/D,
- known competency ID,
- known sub-competency ID,
- correct competency/sub-competency parent relationship,
- allowed difficulty value,
- explanation present,
- exact assessment-plan coverage.

## Database migration testing

`migrations/002_assessment_schema.sql` must be applied to a Neon development/temporary branch before production. Verify table creation and constraints there first. Do not apply untested schema changes directly to the main Neon branch.

## Not yet automated

- full Worker integration tests against a disposable Neon branch,
- browser end-to-end quiz flow,
- OpenRouter live generation tests (kept manual to avoid burning free API quota),
- load/rate-limit tests,
- document ingestion/RAG tests.
