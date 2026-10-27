# Phase 7b.1 — History Detail Contract Repair

## Objective

Make the Portfolio Time Machine detail contract exact and observable: the RPC
must emit decimal values as strings, the browser must validate that contract
without lossy numeric coercion, and a schema-contract failure must be shown as
a data-integrity problem rather than a loading/network failure.

## Evidence and diagnosis

- `get_recorded_snapshot_detail` currently serializes `NUMERIC` columns through
  `jsonb_build_object` and `to_jsonb`, which exposes them to the client as JSON
  numbers.
- `src/features/history/data.ts` currently accepts both strings and JavaScript
  numbers, then applies `String`. This bypasses the required decimal-string
  transport boundary and can lose precision before conversion.
- The reported `source_position_id: null` is not the parsing failure: it is an
  unknown property in the existing non-strict position schema and is stripped.
  Likewise, JSON numeric values are currently accepted, so they cannot by
  themselves produce the reported Zod error.
- The diagnostic identified the concrete mismatch: `to_jsonb` exposes each
  `snapshot_liabilities.balance` column as `balance`, while the client detail
  contract expects the normalized value-item key `value`. The result is the
  observed `liabilities.0.value` `invalid_union` issue.

## Scope

1. Update the detail RPC to construct an explicit response projection. Cast
   every financial `NUMERIC` value to text before placing it in JSON, while
   preserving nullable foreign-source IDs for backfilled rows.
2. Replace the history decimal schema with a string-only decimal validator at
   the RPC boundary. Keep values as decimal strings through rendering.
3. Introduce a typed history-detail contract error that retains validation
   issue paths for development diagnostics without exposing raw server data or
   financial values to the browser UI.
4. Render a dedicated, truthful Time Machine detail error: the recorded
   snapshot was received but its format could not be verified. Keep a retry
   action, and retain the generic load state only for actual RPC/query errors.
5. Add a test fixture matching the complete RPC response shape (snapshot,
   QQQ and VOO positions, numeric fields represented as strings, manual price
   metadata, and `source_position_id: null`). Assert it parses and renders.
   Add a separate contract-violation assertion for numeric JSON values so a
   future regression fails locally instead of being silently coerced.
6. Add/update SQL contract coverage for the RPC output types if the existing
   Supabase test setup can invoke the function with an owner JWT.

## Files expected to change

- `supabase/migrations/<new>_phase_7b_1_history_detail_decimal_contract.sql`
- `src/features/history/data.ts`
- `src/features/history/HistoryPage.tsx`
- `src/features/history/HistoryPage.test.tsx` (or a focused data-contract test)
- `supabase/tests/snapshots.sql` if the callable-RPC contract can be covered
  there

## Safety and non-goals

- No snapshot, position, asset, or liability records will be modified.
- No current-price substitution or history rewrite is introduced.
- No dependency is needed.
- Validation diagnostics must not log or display financial values.

## Verification

Run `npm run build`, `npm run lint`, `npm run test`, and `npm run test:rls`.
