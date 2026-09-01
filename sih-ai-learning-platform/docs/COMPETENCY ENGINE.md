# Competency Engine

## Purpose

The competency engine answers two questions:

1. What competency level is required for this role?
2. What competency level has the employee demonstrated through assessment evidence?

It then calculates the gap between the two.

## Source framework

Prototype master data:

`sih-ai-learning-platform/mock-db/competency-mockdb-userrole.json`

Hierarchy:

```text
Role
  ↓
Competency
  ↓
Sub-competency
  ↓
Definition + required level
```

The competency framework is reference data. User assessment history is stored separately in Neon.

## Role selection

After registration the employee completes onboarding and selects the role that best represents their work.

The Cloudflare Worker validates that `role_id` against the FastAPI competency service before saving it.

If the role later changes, the user's baseline status is reset so the new role is assessed rather than reusing scores from an unrelated framework.

## Current competency measurement

Current competency comes from assessment performance, not self-rating and not course completion.

Each assessment question is tagged to exactly one competency and one sub-competency. The scoring engine aggregates normalized question scores by those tags.

## Scoring

For a question:

`normalized score = awarded / maximum × 100`

For each sub-competency, the engine combines all questions tagged to it.

For a competency, the current prototype uses the mean of the measured sub-competency scores.

Required proficiency levels are converted to configurable prototype thresholds.

Gap:

`gap = max(required - current, 0)`

## Output

The engine returns:
- current competency score,
- required competency score,
- competency gap,
- current sub-competency scores,
- required sub-competency scores,
- sub-competency gaps.

These results are persisted per assessment, so reassessments create history instead of overwriting the previous measurement.

## Important rule

Learning activity does not directly update competency.

```text
Course completed ≠ competency achieved

Course completed
      ↓
Reassessment
      ↓
New assessment evidence
      ↓
Updated competency profile
```

This is the central GyanSetu product principle: measure demonstrated improvement rather than only course completion.
