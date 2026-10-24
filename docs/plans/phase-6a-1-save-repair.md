# Phase 6a-1 repair — snapshot-save diagnostics and MFA recovery

## Objective and boundary

Repair the production failure in the existing manual latest-close snapshot
flow. The fix preserves the existing database authorization model: snapshot
writes remain performed as the authenticated user and continue to require MFA
when the account has a verified factor. It does not bypass the RPC with the
service-role client, weaken MFA/RLS, alter snapshot data, add a provider, or
start Phase 6a-2/backfill work.

No new dependency is planned.

## Confirmed cause

`snapshot_preview` and `save_snapshot` share `build()` in
`supabase/functions/market-data/snapshot.ts`, so a successful preview proves
the session, current state, and fresh quotes can be assembled. Only save then
calls `app.create_portfolio_snapshot` using the caller's JWT.

That public RPC is wrapped by the Phase MFA-1 migration and calls
`app.require_mfa_assurance()`. Its existing database test proves that a
verified-factor AAL1 session is rejected with SQLSTATE `42501`, message `MFA
verification required`. The current Edge Function catch discards this error
and returns a generic 503, producing the reported production symptom.

The confirmed production migration
`20261024000000_phase_6a_1_current_quote_close.sql` accepts
`current_quote_close` in both the table constraint and RPC payload validation.
It is not the cause.

## Implementation plan

1. Add a narrow server-side error normalizer for snapshot capture failures.
   Log only operation, a stable failure category, error class/name, error
   message, SQLSTATE/code, and safe Supabase details/hint when present. Do not
   log tokens, API keys, financial values, holdings, prices, provider payloads,
   or raw request bodies. Continue returning a generic browser error for
   unexpected provider/database failures.
2. Recognize only the existing MFA rejection (`42501` plus the known MFA
   message) as a safe, authored `mfa_required` outcome. Return that normalized
   outcome rather than the raw database text; do not expose SQLSTATE, stack,
   provider, or database details to the browser.
3. Keep all other RPC/database failures as generic unavailable responses, but
   retain their diagnostic class/message/code in Edge Function logs. Preserve
   duplicate-session and normal `saved` behavior.
4. Update the Save snapshot dialog to parse the normalized MFA outcome and
   retain the prepared preview. Display an accessible inline alert explaining
   that the secure session needs authenticator verification, with an authored
   action to `/auth/mfa`; generic failures remain an authored retryable save
   error. Never render server error text.
5. Add focused tests for (a) successful save: correct request, invalidation,
   and close; (b) failed save: the dialog remains open and announces the safe
   error/action; and (c) MFA normalized response routes to verification
   without displaying raw server detail. Add Edge Function coverage for
   diagnostic normalization, including a database-shaped error and a native
   `Error`, asserting no financial or credential data is logged.
6. Run `npm run build`, `npm run lint`, `npm run test`, and `npm run test:rls`.

## Targeted files

- `supabase/functions/market-data/index.ts`
- `supabase/functions/market-data/snapshot.ts` and focused function tests
- `src/features/snapshots/SnapshotsPage.tsx` and a focused component test
- no schema or permission migration is expected

## Acceptance criteria

- An AAL2 user can save a prepared snapshot through the existing owner-scoped
  RPC.
- An AAL1 user with a verified factor receives an authored MFA-verification
  path, not a silent dialog or raw database message.
- Provider and database save failures preserve a safe generic browser response
  and produce diagnostics sufficient to identify error class/message/code in
  server logs.
- Logs never include a key, financial value, holding, provider response, or
  request payload.
- The full build, lint, unit-test, and RLS-test gate passes.
