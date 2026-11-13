# Phase 6c-2 — snapshot scheduler health observability

## Objective and boundary

Make absent or recently incomplete automated snapshot capture visible to
authenticated users without exposing scheduler credentials, request details,
financial data, or worker diagnostics. The alert measures completed capture
across the expected portfolio set; it does not diagnose a cause.

Phase 6c-1 authorization, its generic `401`, safe diagnostic values, and
safe server-error logging remain unchanged. This correction changes scheduler
health finalization, the protected gap read, non-blocking History notices,
tests, and runbook documentation. It does not change snapshot content,
capture-window policy, portfolio ownership, or history immutability.

## Why the earlier counter design was rejected

The original proposal incremented a counter for rejected authorization and
reset it on the next authorized invocation. That cannot report an authorized
worker which later fails, including a failed portfolio query, a failed capture
write, or a zero-portfolio run. It also cannot report `pg_cron` not firing,
because no invocation occurs to increment the counter.

The alert therefore derives from the absence of a completed capture across
completed XNYS sessions. Authentication failures remain stored only as safe
operator diagnostics; they never determine the user-visible alert.

## Health persistence and access boundary

`app.scheduler_health` is a forced-RLS singleton with no browser table access.
`record_scheduler_auth_failure` and `record_scheduler_invocation` are
service-role-only `SECURITY DEFINER` mutation RPCs with empty search paths.
`get_scheduler_health_status` is the sole authenticated elevated read of this
table; it returns exactly `alert boolean` and `alert_since timestamptz`.

The earlier `SECURITY INVOKER` approach was rejected because an invoker runs
with the caller's privileges. A forced-RLS table with no policies and no
authenticated table grant cannot be read by that caller. Granting a helper to
the browser would make the helper directly callable and defeat the intended
isolation; the narrow, guarded status RPC is therefore the sole elevated read
boundary.

The health RPC counts completed XNYS sessions after `last_capture_at`, or
after the singleton's immutable `created_at` when no capture exists. It alerts
after two missing completed sessions and also fails closed after calendar
coverage is exhausted. It exposes no count, capture time, diagnostics, secret
metadata, token information, URL, or request-origin information.

## Worker changes

Keep the already-shipped Phase 6c-1 authorization decision and logging. Every
authorized invocation finalizes exactly once with
`record_scheduler_invocation`, including configuration, no-session, query,
and loop-failure paths. Persistence failures are safe-logged and do not turn a
safe response into a diagnostic response.

Page portfolios by stable `id` keyset order with an explicit page size until
the final partial page. Every portfolio is processed. The expected set contains
only portfolios with at least one snapshot-eligible current fact: an open
position, manual asset, or liability, matching `buildSnapshot`. Empty
first-login portfolios are processed but excluded.

`skipped` has one current meaning: no original snapshot exists for the current
XNYS close and `buildSnapshot` found no open positions, manual assets, or
liabilities. It does not mean a pricing, write, session, or state-timing
failure. Those paths record `gap` where a per-portfolio session record is
reached.

Pass `captured: true` only after every expected portfolio is satisfied for the
current session by either an original snapshot or a deliberate `skipped`
`snapshot_capture_requests` row. A `gap` never satisfies the set. A completed
duplicate invocation therefore advances `last_capture_at` when the session is
healthy. Runs which process zero portfolios, fail their portfolio query, fail
before verification, or leave an expected portfolio unsatisfied pass
`captured: false`; they must not advance `last_capture_at` or clear an alert.

Track terminal outcomes and return non-200 when every processed portfolio
records a `gap`. Mixed runs and all-skipped runs remain distinguishable from
that failure.

The original expected-set rule was wrong because it treated every portfolio as
snapshot-producing. First-login provisioning creates empty portfolios; their
deliberate `skipped` records otherwise held a healthy worker permanently below
the all-satisfied health threshold.

`scheduler_health` remains one global record. One portfolio that gaps every
session therefore holds the alert for every user without identifying that
portfolio. Per-portfolio health is the correct long-term design and is
deliberately deferred from this correction.

## Capture-gap read boundary

The Phase 6b `SECURITY INVOKER` gap read is broken because
`app.snapshot_capture_requests` deliberately has no authenticated table grant.
A forward migration replaces it with a narrow `SECURITY DEFINER` function with
`SET search_path = ''`. It rejects a null `auth.uid()`, invokes the existing
`app.require_mfa_assurance()` helper, and returns gaps only for all portfolios
owned by that authenticated AAL2 caller. It projects only `as_of_date`,
`reason`, and `failure_category`; it never grants table access.

The function carries an elevation comment, is revoked from `public` and
`anon`, and is granted only to `authenticated`. This preserves the AAL2
protection that its prior RLS-mediated read enforced.

The security-invoker audit found no other authenticated-executable invoker
reader with this missing-table-grant pattern. The remaining browser readers
use snapshot tables with authenticated `SELECT` grants and ownership RLS;
other invoker routines are triggers or non-public internal helpers.

## Worker-identity hardening amendment

`app.require_snapshot_capture_worker()` currently uses
`auth.role() <> 'service_role'`. With absent claims, SQL three-valued logic
evaluates that comparison to null rather than true, allowing the function to
return. A forward migration will replace the predicate with
`auth.role() is distinct from 'service_role'`, so missing and non-service
roles both fail closed. A regression test will call a worker RPC as the
database `service_role` with empty JWT claims and require `42501`.

`get_scheduler_health_status()` will invoke the existing
`app.require_mfa_assurance()` helper after its identity assertion, aligning its
authenticated operational read with the repository's AAL2 boundary.

The assertion audit found no other role, identity, or assurance comparison
with this null-comparison defect. Identity checks use `is null`; ownership
checks rely on equality inside RLS predicates; and the MFA helper's `if not`
uses `app.mfa_assurance_satisfied()`, which evaluates its SQL expression to a
non-null boolean.

## Frontend contract and notices

Keep the Zod scheduler-status schema `.strict()`. A contract break or rejected
health query renders a neutral, non-blocking capture-status-unavailable notice.

When `alert` is true, render one bounded warning in the established Midnight
Scope warning treatment. It states only that automated snapshot capture has
not completed recently and that saving or backfilling snapshots still works
normally. It names no cause and gives no repair instruction.

The capture-gap query is also optional. Its failure renders a separate neutral
capture-gap-status-unavailable notice. Neither auxiliary-query failure may
block, replace, or obscure recorded-history content.

## Test plan

Extend database and worker tests to prove:

1. Empty portfolios are excluded from the expected set and do not prevent
   `captured: true`.
2. A session `skipped` record satisfies an expected portfolio; an expected
   portfolio with neither snapshot nor skip prevents `captured: true`.
3. More portfolios than one page are all processed and counted.
4. A run where every processed portfolio records a `gap` returns non-200.
5. The gap RPC rejects `anon` and AAL1, succeeds for AAL2, returns gaps for
   all caller-owned portfolios, and never returns another user's rows.
6. The elevated gap RPC has an empty search path, explanatory comment, no
   public or anon execution, and no new authenticated table grant.

Extend History tests to prove that recorded history remains visible with a
distinct neutral unavailable notice when either the health query or gap query
fails, and that the recent-incomplete-capture warning is separately rendered.

## Documentation updates

Update `docs/RUNBOOK-SNAPSHOT-CAPTURE.md` with the corrected definition of a
healthy run and the global-health limitation. For a persistent alert with
healthy scheduler logs, it will give operators a query that joins recent `gap`
rows to portfolios to find a repeatedly failing portfolio. State that the next
run satisfying every expected portfolio clears the alert automatically with no
manual reset.

## Files in scope

- `supabase/migrations/<timestamp>_phase_6c_capture_gap_read.sql`
- `supabase/migrations/<timestamp>_phase_6c_worker_identity_hardening.sql`
- `supabase/functions/snapshot-capture/index.ts`
- `supabase/functions/snapshot-capture/health.ts`
- `supabase/functions/snapshot-capture/response.ts`
- `supabase/functions/snapshot-capture/index.test.ts`
- `supabase/tests/rls.sql`
- `supabase/tests/snapshots.sql`
- `src/features/history/data.ts`
- `src/features/history/HistoryPage.tsx`
- `src/features/history/HistoryPage.test.tsx`
- `docs/RUNBOOK-SNAPSHOT-CAPTURE.md`
- `docs/plans/phase-6c-scheduler-auth-observability.md`

## Verification

Run:

```text
npm run build
npm run lint
npm run test
npm run test:rls
```
