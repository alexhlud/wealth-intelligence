# Phase 3b-2 — Midnight Scope financial entry and maintenance flows

## Goal

Complete the user-facing Phase 2a scope on the established Midnight Scope
shell: add and edit positions through the existing atomic RPCs, and manage
manual assets and liabilities with clear states, validated inputs, and
financial-data safety preserved.

## Dependency and boundary

Begin only after 3b-1 is accepted and its token/primitives, protected shell,
typed read models, Accounts screen, and persistent account selection are in
place. This half owns mutations because positions are not ordinary editable
rows: every change must use `create_position` or `edit_position`, which writes
the current state and its immutable event in one transaction. Separating that
work prevents a visual foundation change from being entangled with history-
preserving financial writes.

## Scope

### 1. Finish the Holdings action flows without bypassing history

- Wire the 3b-1 Add position entry point to an accessible dialog or dedicated
  route using the shared form primitives. Collect account, ticker, security
  name, asset type, shares, average cost, effective date/time, and optional
  notes. Use the selected account when exactly one account is selected;
  otherwise require an explicit account choice.
- Validate every field with a dedicated Zod intent schema before calling
  Supabase: bounded/trimmed strings and notes, allowed asset types, known
  account UUID from the current account list, decimal strings accepted by the
  database precision, and a valid UTC timestamp. Generate a request UUID per
  submitted intent and retain it for a retry of that same submission, so an
  interrupted retry remains idempotent.
- Call only `create_position` with its existing parameter contract; do not
  insert or update `positions` directly. On success, invalidate/refetch the
  account and holdings query keys, close the form, announce success, and
  return focus predictably. Translate all RPC failures to concise generic
  messages; do not display raw database errors.
- Add an Edit position action on each open holdings row. Its simple default is
  the PRD’s `manual_adjustment`: show ticker, shares, and average cost in a
  familiar form, with an optional reason selector for the RPC’s supported
  event types and only the conditional fields relevant to the selected reason.
  The UI must not require a user to understand the immutable event model.
- Route every edit, including close position, through `edit_position` with the
  existing event-type constraints, current/effective timestamp, account and
  request UUID. Present closing as a deliberate confirmation that says the
  holding is removed from the current view while historical records are
  preserved. Do not issue a DELETE against positions or position events.
- Respect the active account selection when returning to Holdings. Closed
  positions leave the open table after successful refetch; future history
  views remain out of scope.

### 2. Add manual-assets and liabilities workspace screens

- Add protected `Assets` and `Liabilities` destinations to `AppShell` only
  once their routes exist; preserve centered navigation and make the mobile
  navigation horizontally reachable without hiding active context.
- Implement concise flat list/table screens with account association,
  category, current value/outstanding balance, inclusion in net worth,
  as-of timestamp, notes summary, add action, and edit action. The active
  account multi-selection applies consistently to account-associated rows;
  rows with no account remain available in the all-accounts/default view and
  are described clearly when a narrower selection excludes them.
- Add create and edit forms for `manual_assets` and `liabilities` using their
  Phase 2a database categories and field bounds. Parse response data and
  validate submission data with Zod before typed direct table operations. Let
  RLS/auth derive identity; never send a client-controlled `user_id`.
- Values remain canonical decimal strings in the client and are formatted only
  at render. Use explicit positive/zero validation appropriate to each table,
  UTC conversion for `value_as_of`/`balance_as_of`, account membership checked
  against the current primary portfolio, and 500-character bounded notes.
- Include loading, empty-first-entry, filtered-empty, save-pending, successful
  save announcement, generic query/mutation failure with retry, and stale
  timestamp presentation. All error text remains safe and non-enumerating;
  no raw Supabase data is rendered.
- Do not implement destructive delete controls for manual assets or
  liabilities in this phase unless a reviewed retention/deletion behavior is
  added first. Edit keeps current-state records accurate; Phase 2b historical
  treatment must not be undermined by unplanned deletion semantics.

### 3. Complete cross-screen resilience and accessibility

- Apply consistent loading, empty, error, retry, pending, disabled, and
  background-refetch states to every query and mutation delivered in 3b-1 and
  this phase. Preserve the last successful values during refetch and make the
  refresh state textual; reserve the documented warning callout for an actual
  stale timestamp or incomplete value.
- Test focus management, Escape/close behavior, error summary linkage,
  validation announcements, submit-on-Enter, and touch-sized controls across
  all dialogs/forms. Keep visible focus and semantic headings/table markup.
- Maintain all Midnight Scope safeguards: no color-only financial meaning,
  no gradients/glows/card-grid treatment, no unintended motion under reduced
  motion, and 720px minimum horizontal holdings-table behavior on narrow
  screens.

## Planned implementation targets

- `src/features/portfolio/*` — position intent schemas, RPC adapter/hooks,
  add/edit/close flows, holdings-row actions, query invalidation, and tests.
- `src/features/assets/*` and `src/features/liabilities/*` — typed query and
  mutation modules, screens, forms, and tests.
- `src/components/ui/*`, `src/components/AppShell.tsx`, and `src/App.tsx` —
  only targeted additions needed for form primitives, accessible routes, and
  the two completed destinations.
- `src/lib/validation.ts` and focused tests — bounded asset/liability and
  position-intent schemas plus untrusted response parsers.
- `src/index.css` — only component/state styling necessary for the delivered
  flows; retain the 3b-1 token contract.

No new dependencies are planned: React, React Router, TanStack Query, Zod,
lucide-react, Supabase, and the existing CSS/Tailwind setup cover the work.
No database migration, RPC change, direct positions write, market-data work,
snapshot/history UI, dashboard, goals/projections, public demo, or MFA work
is authorized.

## Verification and acceptance

- Unit/component tests cover valid and invalid position intents; correct
  mapping to `create_position`/`edit_position`; retry reusing a request ID;
  no direct positions mutation; query invalidation after success; close copy;
  manual asset/liability validation and category values; selected-account
  filtering; and every loading/empty/error/pending state.
- Test the existing portfolio behavior end-to-end in the browser: create an
  account, add a position, reload, edit its shares, reload again, close it,
  and confirm the current list reflects the result without attempting to
  mutate history. Test assets and liabilities create/edit/reload similarly.
- Keyboard-test all dialogs and forms on desktop and mobile widths; verify
  visible focus, label/error associations, reduced-motion behavior, and
  non-color cues for all status/performance examples.
- Run `npm run build`, `npm run test`, `npm run test:rls`, and `npm run lint`.
  The Phase 2a/2b database and RLS tests must continue to pass unchanged.

## Out of scope

- Any market quote retrieval, hard-coded-price replacement, price refresh,
  calculated net-worth dashboard, historic snapshots/Time Machine, charts,
  goals/projections, public surface, account deletion, asset/liability
  deletion, migrations, RPC changes, and new packages.
