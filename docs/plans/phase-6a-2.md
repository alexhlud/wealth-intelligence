# Phase 6a-2 — Historical backfill and append-only correction

## Objective and boundary

Phase 6a-2 adds the two authoring-heavy snapshot flows after Phase 6a-1's
price/session boundary and read workspace are reviewed: historical backfill and
explicit correction. It never invents past facts from current positions,
rewrites a snapshot in place, or creates a position event just to represent
imported history.

It depends on Phase 6a-1's selected server-only XNYS session provider,
normalized historical-close contract, snapshot workspace, and Phase 2b's exact
snapshot invariants. It excludes automatic capture, request queue, current-state
write integration, privileged worker, Cron, and Phase 7 Time Machine/chart UI.
No new npm dependency is planned.

## Historical accuracy and provenance policy

Backfill asks the user for the complete composition of a verified completed
XNYS session. Date and close instant come only from the server session provider;
the UI never makes a local calendar date its as-of date.

There is no historical-close provider in V1. Every security price is therefore
entered by the user as an explicit decimal with `manual` or `estimate` kind; it
is never silently called raw. The flow makes plain that it is for history
predating the app and that the user supplies all prices. Manual/estimate
provenance is visible both before confirmation and in recorded list/detail
views. If an approved raw-close provider is later added, its normalized result
may be proposed only after this user-supplied default remains available.

Facts predating app records use null source IDs rather than a false link to
today's mutable records. Average cost is optional; legitimate unknown basis is
represented consistently with Phase 2b, including zero where that schema permits
it. Persisted totals remain SQL-authoritative and money remains `NUMERIC`.

## Follow-up gap: historical manual assets and liabilities

The implemented wizard currently sends empty `p_manual_assets` and
`p_liabilities` arrays. That makes a snapshot described as net worth incomplete
whenever the user has included manual assets or liabilities, even though Phase
2b already persists both immutable child sets. This follow-up closes that gap;
it does not change the snapshot schema, current-state records, or historical
immutability rules.

After the XNYS session is verified, the wizard will load the owner's current
manual assets and liabilities for the selected portfolio as editable starting
rows. Each prefilled row will say that its values are copied from a *current
record only as a starting point* and must be reviewed as user-supplied values
for the selected historical date. A user may edit every snapshot field, remove
a row that did not exist then, add a historical-only row, and choose whether it
is included in the historical net-worth calculation. The wizard will never
update, link to, or otherwise mutate the current record: every backfill row
uses a null source ID, a historical effective-at timestamp equal to the verified
close, and the user-entered decimal value.

The snapshot and correction payload schemas will validate names, allowed
categories, optional account labels, decimal values, include flags, USD, bounded
row counts, and the server-resolved timestamp before their RPC calls. The server
continues to calculate all persisted totals from the complete payload.

## Correction policy

Only an owner may correct a correction-chain leaf. The editor begins with a
complete immutable leaf copy, requires a 1–500-character reason, and calls
`correct_portfolio_snapshot` with an idempotency UUID. That RPC appends a full
replacement revision and copied child rows; it never updates/deletes the prior
snapshot.

Details identify superseded revision, reason, and recorded time, with an
accessible audit expander for earlier revisions. Non-leaves have no correction
action. A conflict/already-corrected response refetches the leaf and explains
that a newer revision is recorded.

## User experience

The existing workspace gains two focused flows, retaining Midnight Scope's
one-form/readout rhythm, rule-led tables, mono dates/numerics, textual warning
labels, and mobile linearity.

- **Add historical snapshot** is a bounded date-first wizard. It admits only a
  verified completed XNYS session, displays the resolved close, collects account
  labels, holdings/quantities, optional basis, every security price as decimal
  strings, and complete manual-asset and liability rows. The latter sections
  begin with current-record values solely as editable starting points and state
  plainly that saved rows are user-supplied historical values, not current
  records. Final submission requires complete labelled prices and valid complete
  value-item rows. No provider-price request, loading, or retry state exists in
  V1; no-session, validation, duplicate, and incomplete-price states have
  explicit copy.
- **Correct snapshot** is a leaf-only bounded editor of the full copied payload
  and its provenance. It supports adding, removing, and editing the complete
  manual-asset and liability child sets as well as holdings/prices. The reason
  and immutable-revision explanation appear before confirmation.
- **Recorded detail** preserves the 6a-1 leaf default list and adds textual
  “Manually supplied”/“Estimated” labels, warning counts, and revision audit;
  no chart, comparison, or timeline controls.

Zod validates session values, UUIDs, enums, reason, row bounds, and decimal
precision before queries/RPCs. One submission UUID survives retries; client
decimal calculations are preview-only. Invalidate only affected leaf/detail
queries on success.

## Implementation plan

1. Extend 6a-1 schemas/payloads for historical composition and explicit price
   provenance, retaining nullable source IDs only for genuine pre-app facts.
2. Expose a safe owner-facing creation boundary supplying the complete Phase 2b
   payload. It cannot mutate current state or manufacture position events.
3. Reuse `correct_portfolio_snapshot`, enforcing ownership, leaf status,
   idempotency, copied-child completeness, and normalized conflict handling.
4. Add portfolio-scoped current manual-asset/liability reads to the backfill
   wizard; build editable historical asset/liability sections and submit their
   null-source payloads with the existing holdings payload.
5. Expand the correction editor into a complete leaf-composition editor so a
   user can append missing assets/liabilities (and remove or revise existing
   child rows) without changing the superseded revision.
6. Replace the dashboard's obsolete Phase 6 placeholder with copy that reflects
   whether the owner has recorded snapshot history.
7. Add RLS/RPC, unit, React, and Playwright coverage only for these flows.

## Targeted files and tests

- `src/features/dashboard/DashboardPage.tsx` and its focused test: truthful
  recorded-history/empty-history copy only.
- `src/features/assets/ValueItemsPage.tsx` only as a source of existing value
  item category/validation conventions; no current-state behavior changes.

- `src/features/snapshots/` — additive wizard/editor/audit, schemas, payloads,
  mutations, queries, and tests
- `src/lib/validation.ts` and tests
- only an additive migration/RPC if Phase 2b cannot safely receive the reviewed
  payload; `supabase/functions/market-data/` only for the established price call
- `supabase/tests/rls.sql` or focused adjacent SQL tests; route/style files only
  if narrowly required

Test session-only date admission; mandatory manual/estimate provenance and
complete-price blocking; zero basis; fractional shares; null source IDs; decimals;
duplicate/idempotency; no provider-price request or stale/current/intraday fallback;
and no current-state/position-event mutation. Prove ownership, cross-user denial,
reason bounds, leaf-only correction, append-only revisions, child-copy
completeness, and immutable old revisions. Playwright covers manual-price
backfill, historical asset/liability prefilling and removal, provenance,
correction history (including adding a previously absent asset/liability), and
isolation. Dashboard tests prove the obsolete Phase 6 placeholder is absent and
the new history state is truthful. Run `npm run build`, `npm run lint`, `npm run
test`, and `npm run test:rls`.
