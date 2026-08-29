# Development Log

This log records major implementation changes so contributors can reconstruct what happened without reverse-engineering every commit.

## 2026-08-29

### iGOT-style login redesign
- Reworked `login.html` from a large SaaS-style hero/card layout into an iGOT-inspired split authentication page.
- Left side now uses a government-style instructional blue panel with technical patterning, four explanatory callouts and a central circular `How to Sign In` visual.
- Right side is now a flatter white form panel with sharper field borders, compact labels, a blue primary action and much less decorative card styling.
- Kept prominent prototype language on both sides so the page remains clearly independent from official iGOT/Government identity systems.
- Login keeps its own isolated `login.css`; registration remains on `register.css` so the two flows cannot break each other through shared layout classes.

### iGOT-style registration rebuild
- Rebuilt `register.html` around the public iGOT registration structure shown in the SIH reference flow.
- Registration is now a two-step experience instead of a generic name/email/password form.
- Step 1 collects Center/State, Ministry/Department, Organisation/MDO, Designation and email verification.
- Step 2 collects name, group, mobile number, prototype password and declaration before account creation.
- Added Center/State-specific sample directory data for prototype testing.
- Added demo OTP generation and verification. The generated OTP is shown on-screen because no email/SMS provider is connected yet; the interface labels this clearly as prototype delivery.
- Added a two-step animated progress indicator and contextual organisation help message.
- Carried registration organisation/designation context into onboarding through temporary `sessionStorage` so users are not forced to re-enter the same information immediately.
- Rebuilt `register.css` with an iGOT-inspired instructional left panel plus locally implemented depth, perspective, floating cards and motion patterns inspired by modern open-source component systems such as Watermelon UI.
- Motion remains framework-free and respects `prefers-reduced-motion`; React/Tailwind/Framer Motion were not added to the current static frontend.

## 2026-08-28

### Frontend foundation
- Built the first SIH26101 landing/login experience using an iGOT-inspired blue/saffron/cream theme.
- Added responsive desktop/mobile layouts.
- Restored the hero line: **“Build the skills your role actually needs.”**
- Split mobile landing and login into separate screens so login is immediately reachable without scrolling through a stacked desktop layout.

### Cloudflare deployment
- Added root `wrangler.jsonc` so Cloudflare can deploy the nested frontend correctly.
- Added Worker/static-assets routing.
- Root Worker entry point is now `src/worker.js`.
- Root `package.json` contains Wrangler and Neon serverless dependencies.

### Prototype account system
- Added `register.html` and `register.js`.
- Added dedicated responsive `register.css` after discovering CSS collisions with standalone login rules.
- Added `/api/auth/register` and `/api/auth/login` Worker endpoints.
- Added logout/current-user endpoints.
- Added server-side PBKDF2-SHA256 password hashing with random salts.
- Added random session tokens, hashed storage and HttpOnly/Secure session cookies.

### Backend diagnostics
- Registration exposed a generic `Server error.` when database setup failed.
- Added safe database error classification for missing Cloudflare `DATABASE_URL`, unreachable database, and missing Neon schema.
- Added `GET /api/health` to report Worker/database/schema readiness without exposing connection strings or credentials.
- Frontend API calls automatically surface these clearer backend messages because they already read the API `error` field.

### Onboarding/profile collection
- Added `onboarding.html`, `onboarding.js` and `onboarding.css`.
- Profile flow collects current employment status, current role/designation, department/organisation, experience, education, previous jobs, completed courses and skills.
- Added `/api/profile` GET/PUT endpoints.
- Added a dashboard placeholder for authenticated users.

### Neon database
- Located existing Neon project `stoicdb`.
- Prepared and verified an application schema on a temporary migration branch.
- Migration ID: `e534239c-6e64-408f-9250-abeb9b9dc902`.
- Main Neon branch has **not** been modified yet; explicit approval is still required.

### Safe Browsing / Search Console
- Chrome/Google Safe Browsing flagged the current `workers.dev` hostname as deceptive.
- Removed direct credential collection from the landing page.
- Added Google Search Console verification file `google6603f76e5906e835.html` and verified the URL-prefix property.
- Search Console reports the security issue as `Deceptive pages` with no sample URLs.
- Performed a second remediation pass before review: credential pages were fully de-branded from external/government identity language and now identify only as `SIH26101 Prototype` / `Student Hackathon Demo`.
- Login/register explicitly accept only prototype accounts created on this site and tell users not to reuse credentials from any external service.
- Landing keeps the SIH/public-service visual direction but identifies itself as an independent student prototype and does not collect credentials.

### Documentation cleanup
- Expanded the root README with current implementation status and docs index.
- Added `00-repository-map.md` describing what each important file does.
- Filled previously placeholder system/frontend/database/API/security/deployment/roadmap docs with the actual architecture and status.
- Updated `11-security.md` with the Safe Browsing remediation rules for future auth-page changes.
- Updated `10-api-documentation.md` with the health endpoint and backend dependency status codes.

## Rule for future entries

Add a short entry whenever one of these changes:
- system boundary/architecture,
- database schema,
- API contract,
- authentication/security behavior,
- deployment setup,
- major user flow,
- important file/directory structure.

Do not log every pixel tweak or typo. Git already has enough feelings about those.
