# GyanSetu Backend — Competency & Assessment Engine

This folder contains an **independent FastAPI module** for the GyanSetu role/competency assessment flow.

It does **not** modify or depend on the existing Cloudflare Worker authentication implementation. Authentication integration is intentionally left outside this branch until explicitly approved.

## Implemented flow

```text
competency_framework.json
        ↓
User role
        ↓
Relevant competencies + sub-competencies
        ↓
Assessment generator
        ↓
Tagged MCQ / short-answer / long-answer questions
        ↓
Question router
   ┌────┴─────┐
   ↓          ↓
  MCQ     Short / Long
   ↓          ↓
Exact match  Grader
   └────┬─────┘
        ↓
Normalized scores
        ↓
Sub-competency scores
        ↓
Competency scores
        ↓
Required vs current gap
```

## Important prototype behavior

- `mock` generation and grading modes work locally without any external API credentials.
- MCQs are always graded deterministically by exact answer match.
- Short/long answers use a local key-concept rubric simulator **only in mock mode**.
- `live` AI generation/grading deliberately returns HTTP `503` until an AI provider and authentication method are approved.
- Full questions/reference answers are kept server-side in an in-memory assessment store. The frontend receives only the public question fields.
- The in-memory store is for prototype testing. Database persistence should replace it before horizontal scaling/production use.

## Run locally

From `sih-ai-learning-platform/backend`:

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Swagger UI:

```text
http://127.0.0.1:8000/docs
```

Health check:

```text
GET http://127.0.0.1:8000/health
```

## API endpoints

### List roles

```http
GET /roles
```

### Get role competencies

```http
GET /roles/{role_id}/competencies
```

### Generate assessment

```http
POST /assessments/generate
Content-Type: application/json

{
  "user_id": "EMP001",
  "role_id": "backend_developer",
  "assessment_type": "baseline",
  "question_count": 8,
  "generation_mode": "mock"
}
```

### Submit assessment

```http
POST /assessments/{assessment_id}/submit
Content-Type: application/json

{
  "user_id": "EMP001",
  "grading_mode": "mock",
  "responses": [
    {"question_id": "Q001", "response": "..."},
    {"question_id": "Q002", "response": "..."}
  ]
}
```

## Question schema used internally

```json
{
  "question_id": "Q102",
  "competency_id": "COMP_DB_01",
  "sub_competency_id": "SUB_IDX_04",
  "question_type": "short_answer",
  "difficulty": "Medium",
  "question": "Explain how a B-Tree index improves query performance in a relational database.",
  "options": null,
  "correct_answer": "Reference answer used by the grader.",
  "evaluation_criteria": {
    "key_concepts": ["disk I/O reduction", "balanced tree structure", "O(log N) time complexity"],
    "max_score": 5,
    "rubric": "Award full credit when all required reasoning is demonstrated; award proportional partial credit for correct but incomplete reasoning."
  }
}
```

## Expected live descriptive-grader output

```json
{
  "question_id": "Q102",
  "score_awarded": 4,
  "max_score": 5,
  "key_concepts_identified": ["disk I/O reduction", "balanced tree structure"],
  "missing_concepts": ["O(log N) time complexity"],
  "feedback": "Good explanation of disk I/O, but the response did not state the algorithmic time complexity."
}
```

## Tests

```bash
pytest -q
```

The tests cover role lookup, framework loading, mock assessment generation, MCQ/descriptive routing, normalized competency scoring, and the deliberate live-AI authentication boundary.
