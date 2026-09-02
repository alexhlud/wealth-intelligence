# Phase 3b-1 — Midnight Scope foundation, shell, and portfolio reading

## Goal

Replace the Phase 0.5 light interface with the authenticated **Midnight
Scope** workspace, while preserving the existing portfolio route and real
Supabase-backed data access. Deliver the reusable visual and interaction
foundation plus the read side of the Phase 2a portfolio: account management
and a holdings table whose figures respond to a persistent multi-account
selection.

This plan follows `DESIGN.md` and the Midnight Scope mockups, especially
`mockups/holdings-table.html`. It intentionally supersedes the earlier Phase
3 roadmap wording that calls for a desktop sidebar: the current design system
and this phase request require a centered top navigation on every supported
layout.

## Why this is the first half

3b-1 ends once the user can orient themselves, authenticate, manage the
account containers, inspect real current positions, and filter those
positions by any combination of accounts. This isolates global visual
replacement and read/query correctness from the higher-risk mutations that
append immutable position history or alter financial rows. It also means 3b-2
can compose every form and mutation state from a proven shell and primitive
set rather than changing the foundation while writing money data.

## Scope

### 1. Establish the production Midnight Scope system

- Replace the legacy global CSS in `src/index.css` with semantic authenticated
  CSS custom properties from `DESIGN.md`: canvas, surface, quiet, ink, muted,
  faint, rules, violet signals, gain/loss, warning callout, focus, typography,
  radii, and the specified spacing scale. Do not bring the mockup stylesheet
  into the Vite bundle and do not change its illustrative-only files.
- Load the specified Newsreader, IBM Plex Sans, and IBM Plex Mono faces using
  the project’s existing web-font approach; use resilient system fallbacks.
  No dependency is required.
- Add a small token-driven primitive layer under `src/components/ui/` for the
  production patterns actually needed in Phases 3b-1 and 3b-2: `Button`, form
  field/inline validation treatment, `Select`, `Checkbox`, `Dialog` or
  page-modal treatment, `EmptyState`, `ErrorState`, `LoadingState`,
  `StaleDataNotice`, and `DataTable` structural styles. Keep it intentionally
  local rather than adding shadcn generators or another component library.
- Make all primitives semantic and keyboard-operable. Every interactive
  control receives the `DESIGN.md` focus treatment; labels are programmatically
  associated with fields; dialogs trap focus, expose an accessible name, close
  with Escape, and restore focus to their trigger. Use buttons for actions and
  links only for navigation.
- Apply `prefers-reduced-motion: reduce` globally: no delayed financial
  readings, no nonessential transitions, and no animated inspection treatment
  when the preference is reduced. Wherever gain/loss is shown, pair its color
  with a signed value and directional glyph/text; state status in text rather
  than color alone.

### 2. Introduce the authenticated application shell and routes

- Replace the standalone `PortfolioPage` frame with an `AppShell` containing
  the Midnight Scope canvas, brand/config location, 72px desktop / 62px mobile
  top bar, centered peer navigation, contextual right-side area, and a visible
  `SignOutButton`. The main content remains centered at 1240px with the
  documented responsive padding.
- Add protected routes for `Holdings` and `Accounts`; retain `/portfolio` as a
  redirect to the holdings destination so existing bookmarks and the Phase
  0.5 entry point continue to work. Do not add routes for Phase 4+ destinations
  (History, Future, dashboard) yet. The nav exposes only implemented
  destinations.
- Preserve `ProtectedRoute`, session clearing on sign-out, and generic user
  error copy. Route-level loading and query failures render inside the shell
  without exposing Supabase errors or financial data in logs.
- Redesign `AuthPage`, `AuthCallbackPage`, and protected-route pending state
  in the same Midnight Scope grammar: warm-dark public/auth canvas, restrained
  form surface/rules, display headings, readable validation and generic auth
  errors. Preserve the current invite-only messaging, schemas, redirects,
  autocomplete values, and no-enumeration behavior.

### 3. Create typed Phase 2a read access and account management

- Extend `src/lib/validation.ts` with Zod schemas that parse every selected
  Phase 2a response before it reaches UI state: portfolio, account, open
  position (including account, security name, asset type, status, and decimal
  strings), manual asset, and liability shapes needed by the next half.
  Preserve NUMERIC values as validated decimal strings; do not introduce
  JavaScript floating-point arithmetic.
- Add narrowly scoped feature data modules/hooks that query only the signed-in
  user’s primary portfolio through normal typed Supabase filters and existing
  RLS. Query account and open-position data, selecting known column names and
  ordering through fixed code constants—never a UI-supplied query expression.
- Build the Accounts screen: a concise list/table of account name,
  institution, type, inclusion state, and position count; loading, zero-account
  onboarding, generic error/retry, and disabled/pending mutation presentation.
  It supports create and edit account details with local Zod validation and
  direct table writes permitted by the Phase 2a RLS/grants. Defer destructive
  account deletion until its dependent-row and historical-record rules have an
  explicitly designed flow.

### 4. Build the holdings read experience and account multi-select

- Build the Holdings screen as a flat evidence layout: account-selection
  control, selected-account summary, responsive measurement table, and an
  explicit add-position entry point reserved for 3b-2. Use the current Phase
  0.5 fixed QQQ/VOO prices only as a clearly labelled temporary display source;
  quote refresh, real prices, daily changes, and stale-price source data remain
  Phase 4.
- Implement an accessible account multi-select with real checkbox controls:
  default to all accounts, allow any subset (including a clear all/select all
  action), announce the resulting selection, and keep the selection in
  session-scoped client state while navigating protected routes. Query/filter
  positions and recompute visible totals, allocation, and empty copy solely
  from that selected account-id set.
- Render the documented holdings facts that Phase 2a has: security/ticker and
  account provenance, shares, average cost, fixed/available price, market
  value, and allocation. Use the 720px minimum-width horizontal table at small
  widths; keep security names wrapping without compressing numeric facts.
  Clearly label unavailable price, totals, or allocation rather than inventing
  a value.
- Give every async surface a distinct state: initial skeleton/loading text,
  no accounts, no positions in the portfolio, no positions in the current
  selection, generic retriable query failure, background-refetch indication,
  and stale-data callout only when a future provider supplies a timestamp.

## Planned implementation targets

- `src/index.css` — token variables, global typography, focus, motion, and
  responsive layout rules.
- `src/App.tsx` — protected route hierarchy and legacy portfolio redirect.
- `src/components/ui/*` and `src/components/AppShell.tsx` — reusable
  primitives and shell.
- `src/features/auth/AuthPages.tsx` — visual composition only, preserving auth
  behavior.
- `src/features/portfolio/*` — replace the thin-slice page with query hooks,
  Holdings and Accounts screens, account selection context/state, table, and
  account forms.
- `src/lib/validation.ts` plus focused tests — response and account-input
  validation; retain the existing position/auth validation coverage.
- Focused component and routing tests alongside the relevant feature files.

No migration, RLS policy, RPC signature, secret, dependency, Phase 2b
snapshot behavior, market-data provider, dashboard, history, or projection
work is included.

## Verification and acceptance

- Unit/component tests cover: decimal response parsing, account form
  validation, all/partial/empty account selections, totals/allocation limited
  to selection, route protection/legacy redirect, and generic error/retry
  states.
- Manually verify keyboard-only navigation through auth, top nav, multi-select,
  account forms, horizontal holdings table, sign-out, focus restoration, and
  320px/mobile plus desktop layouts.
- Confirm a long security name wraps cleanly; unavailable values are textually
  identified; gain/loss examples include direction/sign; and reduced-motion
  media settings remove nonessential motion.
- Run `npm run build`, `npm run test`, `npm run test:rls`, and `npm run lint`.
  Existing RLS tests must remain unchanged and pass.
- After implementation, open the running production screens and compare Holdings
  and Accounts side by side with `mockups/holdings-table.html`. The production
  screens must be recognizably the same design, not a loose interpretation.
  Record any deliberate divergence and its reason in the implementation handoff.

## Out of scope

- Position creation, editing, closing, or any RPC invocation.
- Manual asset and liability forms/writes (covered by 3b-2).
- Market prices, price refresh, stale price calculation, net worth dashboard,
  history, snapshots, charts, goals, projections, public/demo UI, MFA, and
  unrelated refactoring.

---

## Holdings regression follow-up

### Evidence collected

- The Holdings read query is scoped to the signed-in user's primary
  portfolio, then filters `positions.status = 'open'`. The Phase 2a backfill
  assigns legacy positions their existing `portfolio_id`, a matching
  `account_id` for that portfolio's generated `Unassigned` account, and
  `status = 'open'`. Therefore it does not introduce a value the query
  excludes.
- The empty-state branch itself already selects the "Select at least one"
  message only when `selected.size === 0`. A report of that message while one
  checkbox appears selected must be treated as a selection-state integrity
  issue, not as copy branching for one selection.
- Account selection is currently persisted as an unscoped array of IDs and is
  never reconciled with the accounts returned for the active portfolio. Its
  summary derives "All accounts" from matching counts rather than membership.
  Stale IDs can therefore be described as all accounts while filtering out
  every current account's position.

### Planned targeted changes

- In `src/features/portfolio/PortfolioPage.tsx`, scope persisted selection to
  the active portfolio and reconcile it against returned account IDs. Derive
  all/partial/none labels from current-account membership, so stale IDs cannot
  produce a false "All accounts shown" state. Keep zero selection as the only
  path to the select-an-account empty state.
- Add a focused Holdings component test with mocked, schema-valid Supabase
  responses. Cover an open position rendering under its account, selecting
  one account rendering only that account's position, and zero selected
  rendering the select-an-account state.
- No migration, RLS policy, data repair, dependency, or price-calculation
  change is required. The deployed row should be rechecked in the table editor
  once the client change is available, because this environment has no
  authenticated production session.

### Verification

- Run `npm run build`, `npm run lint`, `npm run test`, and `npm run test:rls`.

---

## Three-bug correction follow-up

### Evidence collected

- `sumDecimals()` accepts the row values correctly but fails when every value
  has scale zero: JavaScript treats `-0` as `0`, so `digits.slice(0, -scale)`
  becomes `digits.slice(0, 0)`. The computed whole amount is consequently
  replaced by `"0"`. This is the direct cause of a displayed `$0.00` for
  visible integer-valued holdings such as `$10,250.00`.
- The account form converts an emptied Institution input to `null`, but its
  Zod input schema requires a string before its transform runs. That mismatch
  yields the raw Zod type error.
- The account selector is a native `<details>` element without a close API,
  outside-interaction listener, Escape handler, or focus-restoration ref.

### Planned targeted changes

- Correct the zero-scale branch in `src/features/portfolio/prices.ts` without
  converting financial values to JavaScript numbers. Add unit coverage for a
  single position, several positions, multiple selected accounts, and an
  unavailable-price position omitted from the numeric total.
- Update `accountInputSchema` to accept `null` as the form's empty optional
  Institution value and normalize both empty-string and null input to null.
  Add a small, explicit validation-error mapping for every Phase 3b-1 form
  (sign-in, invitation password, and account) so UI copy is authored,
  user-readable text rather than a Zod issue message. Preserve generic
  Supabase failure messages.
- Replace the native details-only selector behavior with controlled open
  state. Close it on outside pointer interaction and Escape without changing
  selection; on either close path restore focus to the trigger. Retain its
  native checkbox semantics and live selection announcement.
- Extend component tests to assert the selector's outside-click, Escape, and
  focus-return behavior, in addition to the exact total cases above. No
  migration, RLS policy, RPC, dependency, or market-data behavior changes are
  required.

### Verification

- Run `npm run build`, `npm run lint`, `npm run test`, and `npm run test:rls`.
