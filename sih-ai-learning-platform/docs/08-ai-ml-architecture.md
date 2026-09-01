# AI/ML Architecture

## Design principle

GyanSetu uses AI where semantic generation/evaluation is useful and deterministic code where the system must remain explainable.

```text
Role framework
   ↓
AI quiz generation
   ↓
Question router
 ┌─────────────┬──────────────────┐
 │ MCQ         │ Short / Long     │
 │ exact match │ LLM rubric grade │
 └──────┬──────┴─────────┬────────┘
        ↓                ↓
        normalized question scores
                 ↓
        deterministic scoring engine
                 ↓
    sub-competency → competency gaps
                 ↓
       recommendation mapping
```

## Source of truth

The AI does not invent official role requirements. The prototype source of truth is:

`sih-ai-learning-platform/mock-db/competency-mockdb-userrole.json`

Each role defines competencies, sub-competencies, definitions, and required proficiency levels.

The backend filters this framework to the selected `role_id` before sending context to the quiz generator.

## Quiz generation

Provider: OpenRouter.

Runtime variables:
- `LLM_API_KEY`
- `LLM_MODEL`

The generation prompt instructs the model to:
- use only supplied competency/sub-competency IDs,
- maximize framework coverage,
- generate MCQ, short-answer, and long-answer questions,
- create descriptive-answer evaluation criteria,
- return structured machine-readable JSON.

The backend validates the output with Pydantic before it reaches a user.

## Question metadata

Every question is tagged with:
- competency ID,
- sub-competency ID,
- question type,
- difficulty,
- reference answer,
- evaluation criteria.

Only the public fields are returned to the browser. Reference answers and rubrics remain on the server side.

## Grading

### MCQ

Deterministic exact match. No LLM call is used.

### Short/long answer

The LLM receives only:
1. question,
2. learner response,
3. reference answer,
4. key concepts,
5. maximum score,
6. rubric.

It returns:
- awarded score,
- maximum score,
- identified concepts,
- missing concepts,
- learner feedback.

Descriptive questions are batch-graded in one LLM call per assessment to reduce API usage.

## Normalization and competency scoring

Question score:

`normalized = score_awarded / max_score × 100`

Sub-competency score is derived from all assessment evidence tagged to that sub-competency.

Competency score is the mean of assessed sub-competency scores in the current prototype.

Gap:

`gap = max(required_score - current_score, 0)`

The LLM does not calculate the final competency gap.

## Required-level prototype mapping

The current prototype converts framework levels into percentage thresholds:

- Level 1 → 25
- Level 2 → 50
- Level 3 → 75
- Level 4 → 90

These values are configurable prototype thresholds, not claimed as official MoSPI/iGOT standards.

## Learning loop

Course completion is stored as learning activity but does **not** alter competency.

Only a new assessment produces a new competency measurement:

`Assess → Gap → Recommend → Learn → Reassess → New competency profile`

## Reliability controls

- strict question schema,
- role/competency ID validation,
- duplicate-question rejection,
- score bounds,
- MCQ deterministic grading,
- rubric-constrained descriptive grading,
- OpenRouter response fallback parsing,
- mock mode for deterministic demo/testing,
- manual live-AI CI smoke test to preserve free-tier quota.
