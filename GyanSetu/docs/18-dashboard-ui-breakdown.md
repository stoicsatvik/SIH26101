# GyanSetu Dashboard UI Breakdown

This document translates the approved dashboard reference into implementation blocks before coding. The current frontend remains static HTML/CSS/JavaScript so the design is implemented with reusable local UI assets instead of changing stacks.

## 1. Application shell

The dashboard is a two-column application shell:

- **Left sidebar:** fixed navigation and GyanSetu branding.
- **Workspace:** top employee header plus scrollable dashboard content.

Desktop target: approximately `240px` sidebar and the remaining width for the workspace. On tablets/mobile the sidebar becomes a compact horizontal/scrollable navigation region rather than forcing the desktop layout.

## 2. Sidebar

### Brand block

- White brand area at the top.
- Existing `frontend/ui/gyansetu-logo.svg` is reused.
- `GyanSetu` wordmark is rendered below it using project brand colors.

### Primary navigation

Items shown in the reference:

1. Home
2. Competency Profile
3. Assessment
4. My Learning
5. Recommendations
6. Career Roadmap
7. Profile

The active page receives a bright blue rounded highlight. Icons reuse the existing shared SVG sprite where possible.

### Secondary navigation

Separated by a divider near the bottom:

- Notifications with count badge
- Settings
- Logout

Logout is wired to `POST /api/auth/logout`.

## 3. Employee top header

Left side:

- Time-aware greeting: `Good morning/afternoon/evening, [Employee Name]`.
- Role, organization/department and ministry context below.

Right side:

- Notification button + badge.
- Circular employee initials/avatar.
- Employee name and dropdown affordance.

Employee/profile values come from `GET /api/profile`; a `401` redirects to `login.html`.

## 4. Baseline assessment hero

Large pale-blue card containing four zones:

1. Clipboard/assessment illustration.
2. Heading and explanation.
3. Target illustration.
4. Primary CTA: **Start Baseline Assessment**.

The CTA is connected to `POST /api/assessments/start`. If the assessment API has not yet been merged/deployed, the UI shows a non-destructive status message instead of pretending generation succeeded.

## 5. Status summary cards

Three equal cards below the hero:

- **Role-Based Competencies** — mapped to the employee role.
- **Assessment Status** — starts as `Not Assessed`.
- **Development Journey** — starts as `Not Started`.

These are intentionally small dashboard indicators, not full feature pages.

## 6. Main information grid

### Why Baseline Assessment?

A large card explaining three benefits:

- Understand current competency levels.
- Get personalized recommendations.
- Track growth over time.

Includes a simple clipboard/person illustration and a secondary `Learn More About GyanSetu` button.

### What You Can Do

Two action rows:

- Explore Learning Resources.
- Explore Career Paths.

The rows are prepared as reusable dashboard actions. Until those feature pages exist they display a `coming soon` notice rather than linking to a dead route.

## 7. Development journey strip

The bottom card displays the four-step flow from the reference:

1. Baseline Assessment
2. Gap Analysis & Recommendations
3. Learning & Development
4. Reassessment & Progress Tracking

The first step is highlighted before the user has completed an assessment. Later states can advance this indicator from backend data.

## 8. Shared UI and design tokens

The implementation reuses:

- `frontend/ui/gyansetu-logo.svg`
- `frontend/ui/gyansetu-icons.svg`
- existing GyanSetu navy / blue / saffron / green palette

New dashboard-specific styling is isolated in `dashboard.css`. Existing login/register/onboarding styling is left untouched.

## 9. Frontend/backend boundary

Frontend API calls are centralized in `api-client.js`.

Current working auth/profile endpoints:

- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/profile`
- `PUT /api/profile`

Assessment client contract prepared for the assessment-engine branch:

- `POST /api/assessments/start`
- `GET /api/assessments/:id`
- `POST /api/assessments/:id/submit`
- `GET /api/assessments/:id/results`
- `GET /api/users/me/competency-profile`

The UI does not calculate correctness or competency gaps. Those remain backend responsibilities.

## 10. Build order

1. Recreate dashboard shell and cards from the reference.
2. Wire auth/profile/logout.
3. Add reusable API client.
4. Add functional assessment/quiz screen prepared for the assessment API.
5. Merge/deploy the backend assessment engine and migration.
6. Run end-to-end API + quiz generation tests.
7. Build competency profile, recommendations, learning and roadmap pages using the same shell.
