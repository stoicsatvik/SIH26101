# Development Log

This log records major implementation changes so contributors can reconstruct what happened without reverse-engineering every commit.

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
- Reworded authentication to clearly identify it as an SIH26101 hackathon prototype rather than an official government login.
- Removed/avoided pretending inactive Parichay/official SSO is real.
- Added Google Search Console verification file `google6603f76e5906e835.html`.
- Search Console now reports the security issue as `Deceptive pages`; review/remediation is in progress.

### Documentation cleanup
- Expanded the root README with current implementation status and docs index.
- Added `00-repository-map.md` describing what each important file does.
- Filled previously placeholder system/frontend/database/API/security/deployment/roadmap docs with the actual architecture and status.

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
