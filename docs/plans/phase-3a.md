# Phase 3a — Observatory visual foundation and signature compositions

## Goal

Establish **The Observatory** as the canonical visual direction and make
its five selection-gate compositions reviewable before any design tokens,
React components, or application UI are implemented.

## Scope

1. Replace the legacy lavender-on-white guidance in `DESIGN.md` with the
   canonical Observatory specification.
   - Define the shared instrument grammar and its fixed meanings:
     purple for the active signal; mono for measured facts; crosshairs for
     inspection; dashes for uncertainty or projection; rules for scale; and
     empty space for hierarchy.
   - Specify the complete public dark and authenticated light color systems,
     including semantic gain, loss, warning, focus, and structural colors.
   - Specify Space Grotesk, Geist, and IBM Plex Mono and their roles.
   - Define responsive composition, type, chart, table, interaction,
     accessibility, and motion rules without introducing implementation
     tokens or component APIs.

2. Create review-only, static HTML mockups in `mockups/`, using fictional,
   clearly illustrative financial values.
   - `public-hero.html`
   - `dashboard-overview.html`
   - `net-worth-history.html`
   - `holdings-table.html`
   - `mobile-history-inspection.html`
   - A shared local stylesheet and optional local SVG assets used only by
     these mockups.
   - Each mockup will render a signature composition rather than a reusable
     product component, and will show the selected grammar in context.

3. Keep `mockups/` versioned in the repository. It is already outside the
   Vite build because Vite only bundles files imported from `src/`.
   - Add `mockups/README.md` explaining that these are static Observatory
     design references, not application code, and that all figures are
     fictional.

## Constraints

- Do not modify `src/`.
- Do not add dependencies, design tokens, React components, routes, or
  production assets.
- Do not use real user or account data; all financial content is fictional
  and labelled illustrative where appropriate.
- Maintain meaningful non-color cues for gains, losses, selected data, and
  projected data.
- Mockups are static review artifacts: no data fetching, authentication, or
  product behavior is added.
- Include realistic hard cases across the five compositions: a stale price
  with its last-updated treatment, a long wrapping security name, a negative
  day, and an intentional empty state.

## Verification

- Confirm `src/` has no changes.
- Open each HTML file at desktop size; open the mobile composition at a
  phone-width viewport; verify the shared grammar and legibility visually.
- Confirm `mockups/` is tracked by Git and remains outside the Vite build.
- Run `npm run build`, `npm run test`, and `npm run lint` after the planned
  artifacts are complete; all must pass without changes to application code.

## Out of scope

- Reusable CSS variables/tokens, shadcn changes, React implementation, and
  app shell/navigation implementation.
- Data integration, charting-library configuration, interaction wiring, and
  responsive behavior beyond the static composition demonstrations.
