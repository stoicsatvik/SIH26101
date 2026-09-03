# AI / Assessment Intelligence Architecture

Last updated: 2026-09-04

## Purpose

AI supports GyanSetu's competency measurement workflow. It does **not** decide competency scores, proficiency levels or gap status on its own.

```text
Competency framework
      -> deterministic assessment plan
      -> OpenRouter model
      -> structured MCQ JSON
      -> strict validator
      -> PostgreSQL
      -> user answers
      -> deterministic scoring
      -> competency results / gap inputs
```

## Provider boundary

The current provider adapter is `src/openrouter.js`.

Cloudflare stores the provider credential as the encrypted Worker secret:

```text
OPENROUTER_API_KEY
```

The browser must never receive this value or call OpenRouter directly.

The default prototype model is `openrouter/free`. The provider remains replaceable because the rest of the assessment engine consumes normalized question objects rather than provider-specific response objects.

## Assessment planning

`src/assessment-core.js` calculates the assessment before any model call.

Rules currently implemented:

- every sub-competency receives at least one question,
- total question count is `ceil(sub_competencies / 10) * 10`,
- extra questions are distributed deterministically,
- higher required proficiency levels receive extra coverage first,
- the AI receives an explicit coverage plan and may not invent competency IDs.

## AI payload boundary

Only competency information needed to generate questions is sent to the model:

- role ID/name/domain,
- competency ID/name,
- sub-competency ID/name/definition,
- required level,
- required question count.

Do not send employee PII such as:

- email,
- phone number,
- employee/personnel ID,
- password/password hash,
- OTP,
- private profile fields unrelated to assessment generation.

## Structured output

The OpenRouter request uses a JSON Schema response format. Each question must include:

```json
{
  "question_id": "Q001",
  "question": "...",
  "options": ["...", "...", "...", "..."],
  "correct_answer": "B",
  "competency_id": "statistics",
  "sub_competency_id": "statistical_inference",
  "difficulty": "medium",
  "explanation": "..."
}
```

Schema enforcement is only the first boundary. Returned questions are also validated locally before persistence.

## Local validation

`validateGeneratedQuestions()` rejects output when any of these are wrong:

- total question count,
- duplicate IDs,
- duplicate question text,
- option count/content,
- correct-answer format,
- competency ID,
- sub-competency ID,
- parent-child mapping,
- difficulty value,
- explanation,
- expected coverage distribution.

AI output must never be treated as trusted data merely because it is valid JSON.

## Deterministic scoring

Scoring is performed by `scoreAssessment()` in application code.

For each sub-competency:

```text
score = correct_answers / total_questions_for_sub_competency * 100
```

For the current prototype, competency score is the arithmetic mean of its sub-competency scores.

The percentage-to-proficiency-level mapping is still **not finalized**. Therefore the scoring engine does not silently convert percentages to Levels 1-4.

## OpenRouter health check

The modular Worker entrypoint provides:

```text
GET /api/ai/health
```

The caller must already have a valid GyanSetu session. The endpoint checks whether `OPENROUTER_API_KEY` is configured and accepted by OpenRouter, while returning no secret/account details.

## Future document/RAG layer

Uploaded learning material will later follow a separate grounded generation path:

```text
PDF / document
  -> object storage
  -> text extraction
  -> cleaning
  -> semantic chunks
  -> embeddings
  -> retrieval
  -> relevant source chunks
  -> OpenRouter
  -> grounded MCQs
```

Do not add vector/RAG complexity to the diagnostic competency assessment until the basic assessment-generation and scoring loop works end-to-end.
