# Phase 6c-2 — snapshot scheduler health observability

## Objective and boundary

Make failed or absent automated snapshot capture visible to authenticated users
without exposing scheduler credentials, request details, financial data, or
internal worker diagnostics. The alert measures missing successful capture, not
authentication failures.

Phase 6c-1 is already shipped. Its `snapshot-capture` authorization predicate,
generic `401` response, safe diagnostic values, and safe server-error logging
must remain unchanged. This phase adds health persistence, a minimal read
contract, a History-page notice, tests, and operational documentation. It does
not change snapshot content, capture-window policy, portfolio ownership, or
history immutability.

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

Add one forward migration that creates `app.scheduler_health` with exactly one
initial row. A one-row check constraint enforces the singleton. The table
contains these requested health and diagnostic fields:

- `last_capture_at timestamptz`
- `last_invocation_at timestamptz`
- `last_auth_failure_at timestamptz`
- `consecutive_auth_failures integer not null default 0`
- `last_auth_failure_method text`
- `last_auth_failure_secret_length integer`
- `last_auth_failure_token_matched boolean`
- `last_auth_failure_origin_matched boolean`
- `updated_at timestamptz`

It also needs immutable `created_at timestamptz not null default now()` to
implement the specified null-`last_capture_at` rule: two completed sessions
since the health row was created. `updated_at` cannot provide that boundary,
because every worker mutation advances it. This additional internal field is
not exposed by the read RPC or browser. Only the migration's singleton seed
insert writes `created_at`; there is no trigger or `ON CONFLICT DO UPDATE`
path, and `record_scheduler_invocation` never references it.

Enable and force RLS. Create no table policies. Revoke table privileges from
`public`, `anon`, and `authenticated`; the browser never reads this relation
directly.

Create two private `SECURITY DEFINER` mutation RPCs with `SET search_path =
''`, schema-qualified references, comments explaining why service-role
elevation is required, explicit service-role assertions, explicit revokes from
`public`/`anon`/`authenticated`, and grants only to `service_role`:

1. `app.record_scheduler_auth_failure(method text, secret_length integer,
   token_matched boolean, origin_matched boolean)` updates the safe diagnostic
   fields, records its timestamp, and increments `consecutive_auth_failures`.
2. `app.record_scheduler_invocation(captured boolean)` always records
   `last_invocation_at`. It records `last_capture_at` and resets
   `consecutive_auth_failures` only when `captured` is true.

Create `app.get_scheduler_health_status()` as a no-argument `SECURITY
DEFINER` RPC. It pins `search_path = ''`, schema-qualifies references, and
documents why elevation is necessary: `scheduler_health` is deliberately
service-role-write and browser-unreadable, so this narrow function is its only
authenticated read path. It raises when `auth.uid()` is null, is explicitly
revoked from `public` and `anon`, is granted only to `authenticated`, and
returns exactly `alert boolean` and `alert_since timestamptz`.

The earlier `SECURITY INVOKER` approach was rejected because an invoker runs
with the caller's privileges. A forced-RLS table with no policies and no
authenticated table grant cannot be read by that caller. Granting a helper to
the browser would make the helper directly callable and defeat the intended
isolation; the narrow, guarded status RPC is therefore the sole elevated read
boundary.

The migration also materializes the reviewed 2026–2027 XNYS sessions in a
committed calendar table, including holiday and early-close values, for this
server-side calculation. The read RPC calculates completed sessions from that
table:

- A missing capture session is always a completed session: its UTC close is no
  later than `now()`.
- With a capture, a completed session whose close is after `last_capture_at`
  is a missing capture session.
- Without a capture, a completed session whose close is on or after
  `created_at` is a missing capture session.
- `alert` is true when at least two missing capture sessions exist.
- `alert_since` is the close timestamp of the first missing completed session;
  otherwise it is null.

If the committed calendar is exhausted—its last close is before `now()` or it
has no rows—the alert is also true. In that case `alert_since` falls back to
the final covered close, while a first missing completed session takes
precedence when one exists.

The function returns no count, capture time, health diagnostics, secret
metadata, token information, URL, or request-origin information.

## Worker changes

Keep the already-shipped Phase 6c-1 authorization decision and logging.

On rejected authorization, initialize the existing service-role client only as
needed to invoke `record_scheduler_auth_failure` with the four existing safe
diagnostic values. If persistence fails, call the existing safe server-error
logger with a distinct operation name, then preserve the generic `401` body
and status.

For every authorized invocation, invoke `record_scheduler_invocation` exactly
once before the response is returned, including no-session, configuration,
portfolio-query, and capture-loop failure paths. Refactor the worker around a
single guarded finalization path so its early returns cannot skip this record.
Pass `captured: true` only after confirming every expected portfolio has an
original snapshot for the current session, whether this invocation wrote it or
found it already recorded. A completed duplicate invocation therefore advances
`last_capture_at` and clears an alert when the session's data is healthy. Runs
which process zero portfolios, fail their portfolio query, fail before the
snapshot verification pass, or leave any expected portfolio without a snapshot
pass `captured: false`; they must not advance `last_capture_at` or clear an
existing alert. Persisting invocation health must not turn a successful worker
response into a detailed error response; failures are safe-logged.

## Frontend contract and notice

Add a Zod-validated status query to `src/features/history/data.ts` for the
two-field RPC result. Add a separately keyed, non-blocking query in
`HistoryPage`.

When `alert` is true, render one bounded warning notice in the existing
Midnight Scope warning treatment. It states that automated snapshot capture
has not run, the operator must repair it, and saving or backfilling snapshots
continues to work normally. It does not show internal diagnostic fields. The
notice has an accessible textual state and does not depend on warning color
alone. Loading or failure of this optional query renders no notice and never
blocks, replaces, or obscures recorded-history content.

## Test plan

Extend `supabase/tests/rls.sql` and `supabase/tests/snapshots.sql` to prove:

1. `scheduler_health` has RLS enabled and forced, no policies, and no
   `anon`/`authenticated` table grants.
2. Both mutation RPCs reject `authenticated` and `anon`; service-role-only
   execution and explicit function grants remain intact.
3. The read RPC rejects `anon`, succeeds for an authenticated caller, and
   returns only `alert` and `alert_since`.
4. The alert is false immediately after a recorded capture, becomes true after
   two completed XNYS sessions with no later capture, and reports the first
   missing session close as `alert_since`.
5. An authorized zero-portfolio invocation advances `last_invocation_at` but
   neither clears an alert nor advances `last_capture_at`; a duplicate run
   with every expected session snapshot already present clears the alert.
6. The `SECURITY DEFINER` inventory, empty-search-path, explanatory-comment,
   and public-execution assertions include both mutation RPCs and the status
   RPC.

Extend History-page tests to cover the warning when `alert` is true, its
absence when false, and normal history rendering when the health-status RPC
fails. Keep the existing history and capture-gap tests intact.

## Documentation updates

Update `docs/RUNBOOK-SNAPSHOT-CAPTURE.md` to define the alert as two completed
XNYS sessions without a successful capture, list likely causes (including
authentication failure, post-authorization worker failure, zero captured
portfolios, `pg_cron` not firing, and exhausted XNYS calendar coverage), and
state that the next successful capture clears it automatically with no manual
reset.

Update `docs/THREAT-MODEL.md` to describe the health table as a service-role
write boundary with forced RLS, no browser table access, minimal authenticated
status output, and residual operational availability exposure.

## Files in scope

- `supabase/migrations/<timestamp>_phase_6c_scheduler_health.sql`
- `supabase/functions/snapshot-capture/index.ts`
- `supabase/tests/rls.sql`
- `supabase/tests/snapshots.sql`
- `src/features/history/data.ts`
- `src/features/history/HistoryPage.tsx`
- `src/features/history/HistoryPage.test.tsx`
- `docs/RUNBOOK-SNAPSHOT-CAPTURE.md`
- `docs/THREAT-MODEL.md`
- `docs/plans/phase-6c-scheduler-auth-observability.md`

## Verification

After implementation, run:

```text
npm run build
npm run lint
npm run test
npm run test:rls
```
