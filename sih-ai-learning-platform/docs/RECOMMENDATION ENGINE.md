# Recommendation Engine

## Purpose

The recommendation engine converts measured competency gaps into targeted learning recommendations.

It does **not** decide the employee's competency. It consumes the output of the competency engine.

```text
Assessment
   ↓
Competency / sub-competency gaps
   ↓
Recommendation Engine
   ↓
Relevant course
```

## Prototype course source

`sih-ai-learning-platform/mock-db/course-catalog.json`

The current catalogue is a mock adapter used to demonstrate how GyanSetu will connect competency gaps to iGOT learning opportunities.

## Ranking logic

The current prototype:
1. sorts measured sub-competency gaps from largest to smallest,
2. filters courses applicable to the selected role,
3. attempts to match competency/sub-competency names against course tags,
4. avoids recommending the same course twice,
5. returns up to three recommendations.

Priority bands:
- High: gap ≥ 25 points,
- Medium: gap ≥ 10 points,
- Low: smaller positive gap.

## Recommendation output

Each recommendation includes:
- course ID,
- course title,
- provider,
- external destination,
- competency ID/name,
- sub-competency ID/name,
- measured gap,
- priority,
- explanation for the recommendation.

## Learning completion

The learning page lets the prototype record that a recommended course was completed.

That event is stored in `learning_activity` but does not change any competency score.

After completion the user is routed to:

`/assessment.html?type=reassessment`

## Continuous loop

```text
Baseline assessment
      ↓
Gap profile
      ↓
Learning recommendation
      ↓
Course / learning activity
      ↓
Reassessment
      ↓
New competency profile
      ↓
New recommendations if gaps remain
```

## iGOT integration boundary

The prototype uses mock course metadata and external iGOT destination links.

A production implementation should replace the mock adapter with authorized iGOT interfaces for whichever capabilities are officially exposed, such as catalogue discovery, enrolment/completion state, or credential synchronization.

GyanSetu should not claim official completion/certificate synchronization until those interfaces and permissions are actually available.
