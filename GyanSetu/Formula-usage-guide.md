# GyanSetu Formula Module Documentation

> **Documented module name:** `gyansetu_formulas.py`  
> **Purpose:** Centralized mathematical calculation module for the GyanSetu application.

---

## 1. Module Overview

The `gyansetu_formulas.py` module is intended to contain the core mathematical formulas used throughout the GyanSetu competency assessment and recommendation pipeline.

The module is intentionally designed as a **pure calculation layer**.

It should:

- Accept validated numerical inputs.
- Perform mathematical calculations.
- Return calculated results.
- Raise clear exceptions when invalid input is provided.
- Remain independent of the database, API, LLM, frontend, authentication, and course repository.

### Core GyanSetu Flow

```text
Role / Job Requirement
        ↓
Required Competencies
        ↓
Sub-Competencies
        ↓
Diagnostic Question Generation
        ↓
User Answers
        ↓
Sub-Competency Scores
        ↓
Competency Scores
        ↓
Current Proficiency Level
        ↓
Proficiency Gap
        ↓
Learning Priority
        ↓
Course Recommendation
        ↓
Learning
        ↓
Reassessment
        ↓
Learning Improvement
```

---

## 2. Documented File Structure

The guide originally recommends the following GyanSetu backend structure:

```text
GyanSetu/
│
├── backend/
│   │
│   ├── assessment/
│   │   ├── question_generator.py
│   │   └── scoring_engine.py
│   │
│   ├── competency/
│   │   ├── competency_engine.py
│   │   └── gap_analyzer.py
│   │
│   ├── recommendation/
│   │   └── recommendation_engine.py
│   │
│   ├── utils/
│   │   └── gyansetu_formulas.py
│   │
│   └── ...
│
└── ...
```

> This is a **documented/recommended structure**, not a guarantee that every path currently exists in the repository. A repository-path audit is included at the end of this file.

---

## 3. Responsibility of `gyansetu_formulas.py`

The formula module is responsible only for mathematical operations.

### It SHOULD handle

- Question count calculation
- Sub-competency scoring
- Competency scoring
- Overall assessment scoring
- Proficiency gap calculation
- Learning improvement calculation
- Relative learning improvement
- Initial course recommendation priority

### It SHOULD NOT handle

- Database operations
- User authentication
- API requests
- LLM calls
- Question generation
- Course searching
- Course ranking using external data
- Frontend operations
- User sessions
- File handling

These responsibilities belong to other GyanSetu modules.

---

## 4. Function Reference

| Function | Primary Use |
| --- | --- |
| `calculate_diagnostic_question_count()` | Determine assessment question count |
| `calculate_subcompetency_score()` | Calculate individual sub-competency score |
| `calculate_competency_score()` | Aggregate sub-competency scores |
| `calculate_overall_assessment_score()` | Calculate overall assessment score |
| `calculate_proficiency_gap()` | Determine required vs current proficiency gap |
| `calculate_learning_improvement()` | Calculate absolute improvement |
| `calculate_relative_learning_improvement()` | Calculate relative improvement |
| `calculate_course_recommendation_priority()` | Calculate initial learning priority |

---

## 5. `calculate_diagnostic_question_count()`

### Purpose

Determines the number of diagnostic questions that should be generated based on the number of sub-competencies. The number of questions is always rounded up to a multiple of 10.

### Formula

```text
Questions = ceil(Sub-competencies / 10) × 10
```

### Function

```python
calculate_diagnostic_question_count(
    gyansetu_subcompetency_count: int
) -> int
```

### Input

`gyansetu_subcompetency_count`

- **Type:** `int`
- **Meaning:** Number of sub-competencies included in the diagnostic assessment.

Valid examples:

```text
7
10
17
25
31
```

### Output

- **Type:** `int`

Examples:

| Sub-competencies | Questions |
| ---: | ---: |
| 7 | 10 |
| 10 | 10 |
| 17 | 20 |
| 25 | 30 |
| 31 | 40 |

### Exceptions

Raises `ValueError` when:

```text
gyansetu_subcompetency_count < 0
```

Example:

```python
calculate_diagnostic_question_count(-5)
# ValueError
```

### Zero Input

If `gyansetu_subcompetency_count = 0`, the function returns `0`.

---

## 6. `calculate_subcompetency_score()`

### Purpose

Calculates the demonstrated score for an individual sub-competency.

### Formula

```text
Sub-competency Score = (Correct Answers / Total Questions) × 100
```

### Function

```python
calculate_subcompetency_score(
    gyansetu_correct_answers: int,
    gyansetu_total_questions: int
) -> float
```

### Inputs

`gyansetu_correct_answers`

- **Type:** `int`
- Number of correctly answered questions.

`gyansetu_total_questions`

- **Type:** `int`
- Total number of questions associated with the sub-competency.

### Output

- **Type:** `float`
- Represents a percentage.

Example:

```text
3 / 4 × 100 = 75.0
```

### Exceptions

Raises `ValueError` when:

- Total questions are zero or negative.
- Correct answers are negative.
- Correct answers exceed total questions.

Examples:

```python
calculate_subcompetency_score(3, 0)
calculate_subcompetency_score(-1, 4)
calculate_subcompetency_score(5, 4)
```

### Unexpected Input Considerations

The function expects integer answer counts. Inputs such as the following should be rejected by the application validation layer before calling the function:

```python
"3"
None
3.5
```

---

## 7. `calculate_competency_score()`

### Purpose

Calculates a competency-level score from multiple sub-competency scores.

### Formula

```text
Competency Score = Sum of Sub-competency Scores / Number of Sub-competencies
```

### Function

```python
calculate_competency_score(
    gyansetu_subcompetency_scores: list[float]
) -> float
```

### Input

`gyansetu_subcompetency_scores`

- **Type:** `list[float]`
- Contains the scores of all sub-competencies belonging to one competency.

Example:

```python
[80.0, 60.0, 70.0]
```

### Output

- **Type:** `float`

Example:

```text
[80, 60, 70] → 70.0
```

### Exceptions

Raises `ValueError` when:

- The list is empty.
- Any score is outside the valid range `0–100`.

Examples:

```python
calculate_competency_score([])
calculate_competency_score([80, 60, 120])
```

### Unexpected Input Considerations

Invalid examples include:

```python
["80", "60", "70"]
[80, None, 70]
[80, "invalid", 70]
```

The validation/service layer should ensure correct data types before calculation.

---

## 8. `calculate_overall_assessment_score()`

### Purpose

Calculates a single overall score from all competency-level scores.

This is a high-level assessment metric. It should **not** replace individual competency and sub-competency scores for gap analysis.

### Formula

```text
Overall Score = Sum of Competency Scores / Number of Competencies
```

### Function

```python
calculate_overall_assessment_score(
    gyansetu_competency_scores: list[float]
) -> float
```

### Input

- **Type:** `list[float]`

Example:

```python
[70.0, 80.0, 60.0]
```

### Output

- **Type:** `float`

Example result:

```text
70.0
```

### Exceptions

Raises `ValueError` when:

- No competency scores are supplied.
- A score is outside `0–100`.

Examples:

```python
calculate_overall_assessment_score([])
calculate_overall_assessment_score([70, 80, 110])
```

---

## 9. `calculate_proficiency_gap()`

### Purpose

Calculates the difference between the proficiency required by a target role and the user's current proficiency.

### Formula

```text
Gap = Required Level - Current Level
```

### Proficiency Levels

| Level | Meaning |
| ---: | --- |
| 1 | Basic |
| 2 | Developing |
| 3 | Proficient |
| 4 | Advanced |

### Function

```python
calculate_proficiency_gap(
    gyansetu_required_proficiency_level: int,
    gyansetu_current_proficiency_level: int
) -> int
```

### Inputs

Both inputs must be integers from `1` to `4`.

- **Required Level:** proficiency required by the target role.
- **Current Level:** user's current demonstrated proficiency.

### Output

- **Type:** `int`

Example:

```text
Required = 3
Current  = 2
Gap      = 1
```

### Interpretation

| Gap | Interpretation |
| ---: | --- |
| `> 0` | User has a learning gap |
| `= 0` | User meets the required proficiency |
| `< 0` | User exceeds the required proficiency |

The application can optionally normalize `Gap <= 0` to **No Learning Gap**.

### Exceptions

Raises `ValueError` if either proficiency value is outside `1–4`.

---

## 10. `calculate_learning_improvement()`

### Purpose

Calculates the absolute improvement between the initial diagnostic assessment and reassessment.

### Formula

```text
Improvement = New Score - Old Score
```

### Function

```python
calculate_learning_improvement(
    gyansetu_old_score: float,
    gyansetu_new_score: float
) -> float
```

### Inputs

Both values must be numerical values in the range `0–100`.

- `gyansetu_old_score`: score before learning.
- `gyansetu_new_score`: score after learning/reassessment.

### Output

- **Type:** `float`
- Measured in percentage points.

Example:

```text
Old Score   = 65
New Score   = 82
Improvement = 17 percentage points
```

### Exceptions

Raises `ValueError` when either score is outside `0–100`.

### Important

The result may be negative.

```text
Old = 80
New = 70
Improvement = -10
```

This indicates a decrease in demonstrated performance. The function should not automatically convert negative improvement to zero because the decrease itself is meaningful assessment data.

---

## 11. `calculate_relative_learning_improvement()`

### Purpose

Calculates improvement relative to the user's original score.

### Formula

```text
Relative Improvement = ((New Score - Old Score) / Old Score) × 100
```

### Function

```python
calculate_relative_learning_improvement(
    gyansetu_old_score: float,
    gyansetu_new_score: float
) -> float
```

### Inputs

Both values must be numerical scores in the range `0–100`.

### Output

- **Type:** `float`

Example:

```text
Old Score = 65
New Score = 82

Relative Improvement = ((82 - 65) / 65) × 100
                     = 26.15%
```

### Exceptions

Raises `ValueError` when:

- Either score is outside `0–100`.
- The old score is `0`, because division by zero is undefined.

Example:

```python
calculate_relative_learning_improvement(0, 50)
```

---

## 12. `calculate_course_recommendation_priority()`

### Purpose

Calculates the initial learning priority of a competency or sub-competency.

### Formula

```text
Priority = Proficiency Gap × Competency Importance
```

### Function

```python
calculate_course_recommendation_priority(
    gyansetu_proficiency_gap: int,
    gyansetu_competency_importance: float
) -> float
```

### Inputs

`gyansetu_proficiency_gap`

- **Type:** `int`
- Calculated by `calculate_proficiency_gap()`.

`gyansetu_competency_importance`

- **Type:** `float`
- Represents importance of the competency/sub-competency for the target role.

Example scale:

| Importance | Meaning |
| ---: | --- |
| 1 | Low importance |
| 2 | Moderate importance |
| 3 | High importance |

The exact importance scale should be defined by the GyanSetu recommendation design.

### Output

- **Type:** `float`

Example:

```text
Gap        = 2
Importance = 3
Priority   = 2 × 3 = 6
```

Higher priority indicates a stronger candidate for learning intervention.

### Exceptions

Raises `ValueError` when competency importance is negative.

### Negative Gap Handling

If the user exceeds the required proficiency (`Gap < 0`), the function normalizes the gap to `0`. This prevents an already-satisfied competency from receiving a negative learning priority.

---

## 13. Function Dependency Map

```text
calculate_diagnostic_question_count()
                    ↓
          Diagnostic Assessment
                    ↓
calculate_subcompetency_score()
                    ↓
calculate_competency_score()
                    ├────────────────────┐
                    ↓                    ↓
      Overall Assessment Score    Current Proficiency
                                         ↓
                         calculate_proficiency_gap()
                                         ↓
                  calculate_course_recommendation_priority()
                                         ↓
                              Course Recommendation
                                         ↓
                                      Learning
                                         ↓
                                   Reassessment
                                         ↓
                         calculate_learning_improvement()
                                         ↓
                   calculate_relative_learning_improvement()
```

---

## 14. Input and Output Summary

| Function | Main Input | Output |
| --- | --- | --- |
| `calculate_diagnostic_question_count` | `int` | `int` |
| `calculate_subcompetency_score` | `int`, `int` | `float` |
| `calculate_competency_score` | `list[float]` | `float` |
| `calculate_overall_assessment_score` | `list[float]` | `float` |
| `calculate_proficiency_gap` | `int`, `int` | `int` |
| `calculate_learning_improvement` | `float`, `float` | `float` |
| `calculate_relative_learning_improvement` | `float`, `float` | `float` |
| `calculate_course_recommendation_priority` | `int`, `float` | `float` |

---

## 15. General Validation Rules

| Value | Valid Rule |
| --- | --- |
| Assessment Scores | `0 ≤ Score ≤ 100` |
| Proficiency Levels | `1 ≤ Level ≤ 4` |
| Correct Answers | `0 ≤ Correct Answers ≤ Total Questions` |
| Total Questions | `Total Questions > 0` |
| Competency Importance | `Importance ≥ 0` |

---

## 16. Common Unexpected Errors

Although the functions perform their own basic validation, the surrounding GyanSetu application should validate data before calling them.

Potential unexpected inputs include:

| Problem | Example |
| --- | --- |
| Wrong data type | `"80"` instead of `80.0` |
| Missing value | `None` |
| Empty collection | `[]` |
| Negative score | `-20` |
| Score greater than 100 | `120` |
| Invalid proficiency level | `5` |
| Correct answers greater than questions | `Correct = 8`, `Questions = 5` |
| Division by zero | `Total Questions = 0` or `Old Score = 0` for relative improvement |

---

## 17. Recommended Error Handling

The formula module should raise errors rather than silently producing incorrect results.

```python
try:
    gyansetu_score = calculate_subcompetency_score(
        gyansetu_correct_answers=3,
        gyansetu_total_questions=4
    )

except ValueError as gyansetu_error:
    print(f"Invalid assessment data: {gyansetu_error}")
```

The higher-level GyanSetu service layer should decide how these errors are presented to the user or logged by the application.

---

## 18. Important Architectural Rule

The formula module should remain **stateless**.

It should not store:

- User data
- Assessment data
- Course data
- Database records
- LLM responses
- Session information

Instead:

```text
Input Data
    ↓
Formula Function
    ↓
Calculated Result
```

This makes the module:

- Easy to test
- Easy to reuse
- Easy to import
- Easy to debug
- Independent of the database
- Independent of the LLM
- Suitable for unit testing
- Suitable for future API integration

---

## 19. Future Formula Extension

The current recommendation priority formula:

```text
Priority = Gap × Importance
```

is intentionally simple.

The final GyanSetu recommendation engine may eventually incorporate additional factors:

```text
Priority =
    Gap
    × Role Importance
    × Course Relevance
    × Prerequisite Importance
    × Learning Efficiency
```

These factors should be introduced only after the recommendation methodology is finalized.

Similarly, the conversion:

```text
Percentage Score → Proficiency Level 1–4
```

is not defined by this module yet.

A future function could be introduced separately, for example:

```python
convert_score_to_proficiency_level()
```

after validated proficiency thresholds are established.

---

## 20. Current Core Formula Set

### 1. Question Count

```text
Q = ceil(Sub-competencies / 10) × 10
```

### 2. Sub-Competency Score

```text
Sₛ = (Correct / Total) × 100
```

### 3. Competency Score

```text
S꜀ = Σ Sub-Scores / Number of Sub-Competencies
```

### 4. Overall Assessment Score

```text
Soverall = Σ Competency Scores / Number of Competencies
```

### 5. Proficiency Gap

```text
Gap = Required Level - Current Level
```

### 6. Learning Improvement

```text
Improvement = New Score - Old Score
```

### 7. Relative Improvement

```text
Relative Improvement = ((New Score - Old Score) / Old Score) × 100
```

### 8. Course Recommendation Priority

```text
Priority = Gap × Importance
```

---

## 21. Module Import Reference

### Individual function import

```python
from gyansetu_formulas import calculate_subcompetency_score
```

### Multiple function import

```python
from gyansetu_formulas import (
    calculate_diagnostic_question_count,
    calculate_subcompetency_score,
    calculate_competency_score,
    calculate_overall_assessment_score,
    calculate_proficiency_gap,
    calculate_learning_improvement,
    calculate_relative_learning_improvement,
    calculate_course_recommendation_priority,
)
```

---

## 22. Final Design Principle

`gyansetu_formulas.py` should be treated as the mathematical foundation of the GyanSetu competency engine, not as the competency engine itself.

The responsibility separation should remain:

```text
Question Generator
        ↓
Scoring Engine
        ↓
gyansetu_formulas.py
        ↓
Competency / Gap Engine
        ↓
Recommendation Engine
        ↓
Reassessment
        ↓
gyansetu_formulas.py
```

This separation ensures that changes to the mathematical formulas do not require rewriting the entire GyanSetu backend.

---

## 23. Repository Path Verification

This section verifies file and folder names referenced by this guide against the **current `main` branch** of the project.

### Confirmed existing paths

- `GyanSetu/`
- `GyanSetu/backend/`
- `GyanSetu/Formula.py`

The current `GyanSetu/backend/` directory contains only `README.md`.

### Referenced paths that do **not** currently exist

- `GyanSetu/backend/assessment/`
- `GyanSetu/backend/assessment/question_generator.py`
- `GyanSetu/backend/assessment/scoring_engine.py`
- `GyanSetu/backend/competency/`
- `GyanSetu/backend/competency/competency_engine.py`
- `GyanSetu/backend/competency/gap_analyzer.py`
- `GyanSetu/backend/recommendation/`
- `GyanSetu/backend/recommendation/recommendation_engine.py`
- `GyanSetu/backend/utils/`
- `GyanSetu/backend/utils/gyansetu_formulas.py`

### Module-name mismatch

The guide repeatedly references a module named `gyansetu_formulas.py`, including its import examples. No file with that name currently exists in the repository. The current formula implementation is stored at:

```text
GyanSetu/Formula.py
```

This audit intentionally **does not create, rename, move, or delete files**. It only records mismatches between the documentation and the current repository structure so the team can decide the final backend layout.