# Frontend Architecture

Last updated: 2026-08-28

The current frontend is deliberately framework-light: static HTML/CSS/JS served by the Cloudflare Worker asset binding. There is no React/Vite build step yet.

## Pages

| Page | Purpose |
|---|---|
| `index.html` | Public landing page. Describes the SIH26101 prototype and routes users to sign in/register. |
| `login.html` | Dedicated prototype login screen. Calls the Worker login API. |
| `register.html` | Dedicated account creation screen. Calls the Worker registration API. |
| `onboarding.html` | Collects employment/profile/education/work/course/skill data after first registration. |
| `dashboard.html` | Authenticated dashboard placeholder for the next development phase. |
| `google6603f76e5906e835.html` | Google Search Console verification file. Do not remove while verification is required. |

## JavaScript

| File | Responsibility |
|---|---|
| `app.js` | Login validation, password visibility and `/api/auth/login` handoff. |
| `register.js` | Registration submission to `/api/auth/register`. |
| `onboarding.js` | Dynamic repeated profile sections and `PUT /api/profile` submission. |

## CSS

| File | Responsibility |
|---|---|
| `styles.css` | Shared iGOT-inspired visual language and base components. |
| `alignment-fixes.css` | Landing/login responsive alignment overrides. Keep layout-only changes here where possible. |
| `register.css` | Isolated registration layout to prevent login CSS collisions. |
| `onboarding.css` | Profile/onboarding forms and responsive layout. |

## Responsive behavior

### Desktop
- landing content and prototype-access panel use a split layout,
- registration uses a two-column hero/form layout,
- standalone login remains centered and contained.

### Mobile
- landing page shows the hero and a clear login CTA early,
- login is a separate page rather than a very tall stacked desktop layout,
- registration/onboarding collapse to a single column.

## Navigation flow

```text
index.html
 |-- login.html
 |      `-- successful login -> onboarding.html or dashboard.html
 |
 `-- register.html
        `-- successful registration -> onboarding.html
                                      `-- save -> dashboard.html
```

## Branding/security note

The interface uses an iGOT-inspired blue/saffron/cream visual language, but it must remain visibly labelled as an SIH26101 hackathon prototype and not claim to be an official iGOT/Parichay/Government of India authentication service.

## Future frontend direction

A framework migration should only happen when component/state complexity justifies it. If React/Vite/etc. is introduced, document the reason, build path and routing strategy before removing the current static pages.
