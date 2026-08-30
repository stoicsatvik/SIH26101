# GyanSetu UI Stock Library

Last updated: 2026-08-30

This library converts the approved GyanSetu landing-page visual into reusable frontend primitives. The reference direction contains a warm cream government-education theme, saffron/teal corner waves, a central learning/bridge mark, muted education icons, dark pill CTAs, and a civic-building silhouette.

## Live inventory

Open `/ui-library.html` in the deployed site to see the current reusable components.

## Files

- `frontend/ui/gyansetu-logo.svg` — scalable GyanSetu brand mark.
- `frontend/ui/gyansetu-icons.svg` — reusable SVG symbol sprite.
- `frontend/ui/gyansetu-components.css` — design tokens and reusable components.
- `frontend/ui-library.html` — visual catalogue/showcase of reusable elements.

## Element breakdown

### 1. Page canvas
Warm cream/off-white background used as the base surface.

Reusable primitive: `.gs-page`, `.gs-shell`

### 2. Saffron/teal corner waves
Large curved color bands in the top-right and bottom-left corners. Implemented with CSS gradients so the shapes scale to mobile/desktop without raster stretching.

Reusable primitive: `.gs-shell::before`, `.gs-shell::after`, `.gs-wave-lines`

### 3. Halftone/dot texture
Soft decorative dotted fields that create print/government-brochure texture without interfering with content.

Reusable primitive: `.gs-dot-field`

### 4. Central brand mark
Bridge + learner + open book + data/learning indicators + pathway.

Reusable asset: `./ui/gyansetu-logo.svg`

### 5. GyanSetu wordmark
Large navy-to-orange word treatment.

Reusable primitive: `.gs-brand-word`

### 6. Graduation-cap divider
Two horizontal lines with a small education icon between them, navy on the left and saffron on the right.

Reusable primitive: `.gs-brand-rule`

### 7. Tagline
Uppercase, widely tracked text: `Bridging competency gaps through learning`.

Reusable primitive: `.gs-tagline`

### 8. Floating education icons
Muted line icons around the composition: book, chart, graduation cap, lightbulb, gear.

Reusable sprite IDs:
- `icon-book`
- `icon-chart`
- `icon-cap`
- `icon-bulb`
- `icon-gear`

Reusable primitive: `.gs-float-icon`

### 9. Dark pill CTA buttons
Large rounded black/charcoal buttons with left icon, centered label and optional right arrow. Used for login/register and reusable for other high-priority actions.

Reusable primitive: `.gs-cta`, `.gs-cta__icon`, `.gs-cta__arrow`

Sprite IDs:
- `icon-login`
- `icon-register`
- `icon-arrow`

### 10. Government/civic silhouette
Low-contrast civic building line art at the bottom of the landing page. Kept decorative and non-branded so it can be reused on other public-sector screens.

Current implementation is inline SVG in `index.html`. If reused widely, move it into the sprite library as `icon-building` or a dedicated `gyansetu-building.svg`.

### 11. Glass surface and badge
Reusable soft cards/badges for future dashboard/onboarding screens while staying in the same visual family.

Reusable primitives: `.gs-card`, `.gs-badge`

## Design tokens

Primary reusable variables include:

- `--gs-navy`
- `--gs-blue`
- `--gs-teal`
- `--gs-green`
- `--gs-saffron`
- `--gs-orange`
- `--gs-cream`
- `--gs-ink`
- `--gs-shadow-soft`
- `--gs-shadow-cta`
- `--gs-radius-pill`

Do not hard-code these colors in new screens unless there is a deliberate exception.

## Usage example

```html
<link rel="stylesheet" href="./ui/gyansetu-components.css" />

<a class="gs-cta" href="./login.html">
  <span class="gs-cta__icon">
    <svg><use href="./ui/gyansetu-icons.svg#icon-login" /></svg>
  </span>
  <span>Log In</span>
  <svg class="gs-cta__arrow">
    <use href="./ui/gyansetu-icons.svg#icon-arrow" />
  </svg>
</a>
```

## Maintenance rule

When a visual element becomes reusable across two or more screens:
1. move it into `frontend/ui/`,
2. expose it in `ui-library.html`,
3. document it here,
4. avoid duplicating page-specific copies.

The landing page should consume the same library rather than owning a private version of these elements.
