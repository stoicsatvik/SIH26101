# Frontend

Cloudflare-friendly frontend for the SIH26101 AI learning and competency intelligence platform.

## Current prototype

The first screen is an iGOT Karmayogi-inspired login experience with:

- password and OTP modes
- responsive desktop/mobile layout
- basic client-side validation
- password visibility control
- local prototype OTP flow (`123456`)
- a visual Parichay/SSO handoff button
- an explicit authentication seam for later Cloudflare + WorkOS integration

The prototype deliberately does **not** perform real authentication. No passwords or OTPs are sent or stored anywhere.

## Run locally

No build step is required yet. Serve this directory with any static server, for example:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Cloudflare Pages setup

For the current static prototype:

- **Project path:** `sih-ai-learning-platform/frontend`
- **Framework preset:** None
- **Build command:** leave blank
- **Build output directory:** `.`

The included `_headers` file adds basic static security headers when deployed through Cloudflare Pages.

## WorkOS integration seam

Authentication behavior is controlled near the top of `app.js`:

```js
const AUTH_CONFIG = {
  mode: "mock",
  workosStartUrl: "/auth/login",
  demoOtp: "123456",
};
```

When the Cloudflare Worker/WorkOS route is ready, switch `mode` to `"workos"` and point `workosStartUrl` at the Worker endpoint. The form and Parichay-style SSO button will then hand off to that route rather than the local prototype logic.

Real identity verification, sessions, cookies, logout, password recovery, and authorization must live in the server-side identity layer, not in this browser script.

## Visual direction

The theme is based on the public iGOT Karmayogi visual language: warm cream/peach surfaces, deep blue government-service branding, saffron highlights, restrained rounded controls, and a role-based public-service message.

UI layout/polish references supplied for the project:

- Mobbin: mobile spacing and authentication flow conventions
- 21st.dev: compact sign-in/card/component conventions
- Dribbble: split-panel login and brand storytelling patterns

The page is an original SIH26101 prototype and is clearly labelled as **not an official iGOT Karmayogi deployment**.
