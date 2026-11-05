# Phase 6c — snapshot scheduler authentication observability

## Objective and boundary

Repair the private `snapshot-capture` worker's authorization diagnostics and
make repeated rejected scheduler calls visible without exposing a scheduler
secret, bearer token, financial data, or internal routing details.

This phase changes the scheduler-auth boundary and adds a small operational
health record. It does not alter snapshot content, capture-window policy,
portfolio ownership, or history immutability.

## Authorization decision

The old origin predicate compares `request.url` with `SUPABASE_URL`. In the
Supabase Edge runtime, `request.url` can be an internal routing URL, so this
comparison is not a reliable indication that the caller used the public
project endpoint. It also supplies no independent authentication: a caller
that possesses the dedicated bearer secret can already invoke the configured
public function URL, and a caller without it cannot pass the bearer check.

Remove origin equality from the authorization decision. Continue to compute a
safe `originMatchesProject` boolean solely for diagnostics, using a guarded URL
parse so malformed or absent configuration cannot throw from the auth path.
The decisive conditions are:

1. request method is `POST`;
2. configured scheduler secret is at least 32 characters; and
3. supplied bearer token equals that secret.

The function must never log either secret value, token value, request URL, or
authorization header. Its rejected-auth log records only method, configured
secret length, `tokenMatched`, and `originMatchesProject` booleans.

## Operational signal

Add a singleton service-worker-owned scheduler health record. A rejected
invocation increments its consecutive authentication-failure count and stores
only the four safe diagnostic fields plus timestamps. The first successfully
authorized invocation resets that consecutive count. The Edge function emits a
structured error log for every rejection and persists the failure before
returning its generic `401`; a persistence failure is separately logged with
the existing safe server error logger and never turns into a detailed browser
response.

After three consecutive rejected invocations, an authenticated, no-argument
read RPC exposes only an `alert` boolean and the alert's most recent timestamp.
It does not expose secret length, methods, origin results, tokens, request URLs,
or counts. The History/Time Machine page shows an honest operational notice:
automated snapshot capture is temporarily unavailable and the operator must
repair the scheduler; users can still save or backfill snapshots. This makes a
rejected scheduler visible in the application without leaking infrastructure
diagnostics to ordinary users.

The health table has RLS enabled and forced, no browser table grants, and no
policies. Only narrowly scoped `SECURITY DEFINER` worker RPCs can mutate it;
they require the service role, pin `search_path = ''`, and document the
elevation. The read RPC is `SECURITY INVOKER`, requires `auth.uid()`, and is
granted only to `authenticated`.

## Implementation plan

1. Add a forward migration that creates and locks down the singleton scheduler
   health table; adds private worker-only record-failure/reset-success RPCs;
   adds the authenticated minimal-status RPC; and revokes/grants all functions
   explicitly.
2. Refactor `snapshot-capture` auth evaluation to produce safe diagnostics,
   log every rejected request, persist failures, and reset the count after a
   successful authorization. Remove origin equality from access control while
   retaining guarded diagnostic comparison.
3. Add the status contract and History-page alert, including loading/error
   behavior that does not obscure normal recorded-history access.
4. Update the capture runbook and threat model with the new authorization
   rationale, observable alert threshold, and operator response/reset behavior.
5. Extend SQL/RLS tests for table lock-down, function grants, service-role
   mutation, authenticated minimal reads, anonymous denial, threshold/reset
   semantics, and `SECURITY DEFINER` inventory. Extend frontend tests for the
   operational alert. Run `npm run build`, `npm run lint`, `npm run test`, and
   `npm run test:rls`.

## Files in scope

- `supabase/migrations/<timestamp>_phase_6c_scheduler_auth_observability.sql`
- `supabase/functions/snapshot-capture/index.ts`
- `supabase/tests/snapshots.sql` and `supabase/tests/rls.sql`
- `src/features/history/data.ts`, `src/features/history/HistoryPage.tsx`, and
  focused tests
- `docs/RUNBOOK-SNAPSHOT-CAPTURE.md` and `docs/THREAT-MODEL.md`
