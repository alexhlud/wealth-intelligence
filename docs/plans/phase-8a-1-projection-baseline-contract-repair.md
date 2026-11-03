# Phase 8a.1 — Projection Baseline Contract Repair

## Objective

Repair the recorded projection-baseline RPC/client contract that makes the
Future page fail after otherwise successful requests, and make future Zod
contract failures observable in development without logging financial data.

## Evidence and diagnosis

- `app.get_newest_projection_snapshot_baseline` declares its financial result
  columns as `numeric` and selects `portfolio_snapshots` numeric columns
  directly. PostgREST serializes those values as JSON numbers.
- `FuturePage` requires `investment_value`, `manual_asset_value`, and
  `liability_value` to be canonical decimal strings. The resulting Zod parse
  fails even though the RPC returns HTTP 200 and data.
- The current client checks only a subset of the RPC response. The remaining
  response fields (`id`, `market_close_at`, and `total_net_worth`) are not
  currently asserted. Field names of the subset do match the RPC.

## Scope

1. Add an additive migration replacing the RPC with an explicit projection
   that casts every financial value to `text` while retaining the existing
   field names, ordering, effective-correction-leaf logic, `SECURITY INVOKER`,
   empty `search_path`, grants, and ownership filter.
2. Add a focused projections data-contract module/schema that validates the
   complete RPC response shape, including `id`, `as_of_date`,
   `market_close_at`, `investment_value`, `manual_asset_value`,
   `liability_value`, and `total_net_worth`; financial values remain canonical
   decimal strings.
3. Extract the existing development-only sanitized Zod diagnostic into a
   shared helper. It logs only issue path, code, and rule in development. Both
   history detail loading and projection-baseline loading use it. No response
   payloads or financial values are logged.
4. Add a test fixture matching the full RPC response shape with decimal
   strings. Assert it parses and assert the equivalent numeric JSON value is
   rejected. Preserve existing history diagnostic coverage through the shared
   helper.

## Safety and non-goals

- No financial records, snapshots, or projection math are changed.
- No new dependency, data-fetching behavior, UI copy, or unrelated refactor.
- The browser continues to surface generic truthful errors; diagnostics are
  development-only and sanitized.

## Verification

Run `npm run build`, `npm run lint`, `npm run test`, and `npm run test:rls`.
