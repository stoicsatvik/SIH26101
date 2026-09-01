# Quizzes / Assessment Engine

## Assessment types

GyanSetu uses the same engine for:
- `baseline` — establishes the employee's initial competency profile,
- `reassessment` — measures competency after learning.

## Generation workflow

```text
competency framework
      ↓
selected role
      ↓
competencies + sub-competencies + definitions + required levels
      ↓
AI diagnostic quiz generator
      ↓
validated tagged questions
```

The model must use only competency IDs supplied by the selected role framework.

## Question structure

```json
{
  "question_id": "Q102",
  "competency_id": "COMP_DB_01",
  "sub_competency_id": "SUB_IDX_04",
  "question_type": "short_answer",
  "difficulty": "Medium",
  "question": "Explain how a B-Tree index improves query performance in a relational database.",
  "options": null,
  "correct_answer": "Reference answer used only by the grader.",
  "evaluation_criteria": {
    "key_concepts": ["concept A", "concept B"],
    "max_score": 5,
    "rubric": "Scoring instructions for full and partial credit."
  }
}
```

For MCQs, `options` contains exactly four values and `correct_answer` must exactly match one option.

For descriptive questions, `options` is `null` and the AI creates the verification criteria.

## Browser privacy

The FastAPI service initially returns both public questions and the server grading payload to the trusted Cloudflare Worker.

The Worker stores the grading payload in Neon and removes it before returning the assessment to the browser.

The learner therefore sees the question and options, but not the answer key or rubric.

## Question router

```text
User submission
      ↓
Question Router
 ┌───────────────┬────────────────────┐
 │ MCQ           │ short / long       │
 ↓               ↓
Exact Match      LLM Grader
 │               │
 └───────┬───────┘
         ↓
Normalized Score
         ↓
Competency Engine
```

## LLM descriptive grading contract

Input:
1. question,
2. student response,
3. reference answer,
4. key concepts,
5. rubric,
6. maximum score.

Required output:

```json
{
  "question_id": "Q102",
  "score_awarded": 4,
  "max_score": 5,
  "key_concepts_identified": ["concept A"],
  "missing_concepts": ["concept B"],
  "feedback": "Concise learner-facing feedback."
}
```

The backend clamps and validates model scores and validates concept labels against the supplied rubric.

## API routes

FastAPI:
- `POST /assessments/generate`
- `POST /assessments/grade`
- `POST /assessments/{assessment_id}/submit` for local/testing convenience

Cloudflare user-facing proxy:
- `POST /api/assessment/generate`
- `POST /api/assessment/{assessment_id}/submit`

## Failure handling

- invalid question schema → reject,
- invalid competency mapping → reject,
- duplicate generated question → reject,
- malformed OpenRouter response → retry alternate structured/plain JSON request mode,
- provider unavailable → return controlled service error,
- mock mode → deterministic fallback for development and demonstrations.
