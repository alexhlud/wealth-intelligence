# Phase 6a-1 repair — snapshot JSON-key regression

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

Production logging disproved the earlier MFA diagnosis: the save reached the
database and failed with SQLSTATE `42703`, `column k.key does not exist`.

`20261024000000_phase_6a_1_current_quote_close.sql` replaced
`app.insert_snapshot_revision`. Its JSON allowlist checks alias
`jsonb_object_keys(...)` as `k`, then reference `k.key`; unlike the prior
implementation, that replacement did not name the function's output column.
Every non-empty child payload therefore fails before validation or inserts.
MFA remains a separate, correctly enforced authorization rule, not the cause
of this incident.

## Implementation plan

1. Add a forward-only migration replacing the JSON-key aliases with explicit
   `as k(key)` output-column aliases in the existing helper definition.
2. Add a database regression test that invokes the public
   `create_portfolio_snapshot` RPC with a realistic position using
   `current_quote_close`, then verifies the persisted immutable leaf.
3. Run `npm run build`, `npm run lint`, `npm run test`, and `npm run test:rls`.

## Targeted files

- `supabase/migrations/20261024010000_phase_6a_1_snapshot_json_key_fix.sql`
- `supabase/tests/snapshots.sql`

## Acceptance criteria

- A non-empty snapshot payload succeeds through the existing owner-scoped RPC.
- A `current_quote_close` price kind is accepted and persisted immutably.
- The JSON allowlist still rejects unexpected payload fields rather than
  bypassing validation.
- The full build, lint, unit-test, and RLS-test gate passes.
