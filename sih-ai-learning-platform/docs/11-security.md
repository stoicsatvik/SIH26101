# Security

Last updated: 2026-08-28

## Prototype status

This is an SIH26101 hackathon prototype, not an official iGOT Karmayogi, Parichay or Government of India authentication service. The UI must state that clearly.

The current `workers.dev` production hostname has been classified by Google Safe Browsing as containing deceptive pages. Google Search Console ownership has been verified and remediation/review is in progress. Do not treat local Chrome bypasses as a fix.

## Password handling

Current implementation: `src/worker.js`.

Passwords are:
- received by the Worker over HTTPS,
- hashed server-side,
- salted with a random 16-byte salt,
- derived using PBKDF2-SHA256,
- currently configured for 210,000 iterations,
- stored only as the encoded derived hash/salt/iteration record.

Plaintext passwords must never be written to logs, Git, localStorage or the database.

## Sessions

After registration/login:
- Worker generates a random 32-byte session token,
- SHA-256 hash of the token is stored in `user_sessions`,
- raw token is sent only as the `sih_session` cookie,
- cookie flags: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`,
- default session lifetime: 7 days,
- logout revokes the stored session and clears the cookie.

## Secrets

`DATABASE_URL` must be configured as a Cloudflare Worker secret/environment binding.

Never commit:
- Neon connection strings,
- database passwords,
- API keys,
- OAuth/client secrets,
- private signing keys.

## Database access

The browser must never directly receive the privileged Neon connection string. All current database access goes through the Worker.

## Login branding / phishing risk

Because the product is inspired by iGOT, authentication pages must avoid implying they are official government pages.

Requirements:
- always identify the site as an SIH26101 hackathon prototype,
- do not ask users for real Government/iGOT credentials,
- do not label inactive prototype buttons as real Parichay/official SSO,
- use test/project accounts while the identity integration is not official,
- keep the landing page free of misleading credential collection.

## Google Search Console verification

File:
`frontend/google6603f76e5906e835.html`

Purpose: URL-prefix ownership verification for the current Worker hostname. Do not delete it while verification/review depends on it.

## Future work

Before real production use:
- replace prototype auth with an approved identity architecture (e.g. WorkOS/official SSO if authorized),
- add CSRF analysis/protection where required,
- add rate limiting for login/register endpoints,
- add account recovery policy,
- add structured security logging without secrets/PII leakage,
- add authorization/roles for admin APIs,
- review retention/deletion/privacy requirements,
- perform dependency/security scanning and threat modeling.
