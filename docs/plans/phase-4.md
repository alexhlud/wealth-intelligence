# Phase 4 — Market data

## Goal

Replace the temporary QQQ/VOO display prices with an authenticated,
provider-neutral quote path. Provider credentials remain in Supabase Edge
Function secrets; the browser receives only validated, normalized quotes or a
clearly labelled last-known cached quote. A provider failure must leave the
holdings table and its non-price data usable.

This phase uses the decided and approved Finnhub path; it does not enable live
data in the public demo, add historical backfill, create snapshots, or change
the Phase 2a/2b financial records.

## Provider decision — Finnhub approved

Finnhub is the V1 provider. It uses the free tier (60 calls per minute) and one
shared server-side key. Finnhub granted written approval on 2026-10-14 for
non-monetized use with friends and family; the approval and conditions are in
[MARKET-DATA-LICENSE.md](../MARKET-DATA-LICENSE.md).

The approval depends on server-enforced invite-only registration (public signup
remains disabled), users personally known to the operator, and no monetization.
Invite-only is therefore a live-data licensing dependency, not a UI preference.
If any condition changes, disable live Finnhub access and obtain renewed written
approval before re-enabling it. The anonymous public demo remains bundled
fictional data and never requests Finnhub.

This phase supports US equities only. A non-US-equity symbol, or a symbol
Finnhub does not return, receives an explicit unavailable quote with a safe
unsupported-symbol or not-found reason. The holding remains visible with its
non-price facts; price-dependent value/allocation is excluded from totals, with
the excluded-holding count stated. It is never silently dropped or fabricated.

This is a long-horizon tracker, not a trading app. Target one successful
provider refresh per provider-symbol per XNYS trading day by default. Manual
**Refresh Prices** uses the same quota-aware endpoint and cache policy; it does
not create render-driven polling or bypass the daily target without a separately
approved and documented exception. Failures always retain a valid cached quote.

## Architecture and implementation plan

This work is split into two reviewable phases because the contract, cache,
credential boundary, RLS/grants, and fallback behavior must be proved before
the holdings UI consumes them:

| Phase | Scope | Completion boundary |
| --- | --- | --- |
| 4a — Market-data foundation | Contracts, Finnhub adapter, quote cache, RLS/grants, authenticated Edge Function, rate controls, and server-side tests. | A protected endpoint returns normalized fresh, stale, delayed, or unavailable quotes; the holdings UI does not consume it yet. |
| 4b — Holdings price integration | Quote query, manual Refresh Prices action, freshness/error display, totals handling, UI tests, and operational documentation. | Hard-coded holding prices are removed and the authenticated holdings UI uses the resilient quote path. |

Do not begin 4b until 4a's migration, Edge Function, and RLS tests have passed
review. Sections 1–3 below are Phase 4a; sections 4–5 are Phase 4b.

### Phase 4a prerequisite — disable public signup before live data

Before setting `FINNHUB_API_KEY`, deploying the function, or enabling live
Finnhub access, open the Supabase Dashboard for the linked production project:
**Authentication → Providers → Email** and disable **Allow new users to sign
up**. Confirm the server-side invite/allowlist enforcement test passes. This
is required by Finnhub's written approval; do not treat the browser UI as the
control.

### 1. Define application-owned market-data contracts

- Add a `src/features/market-data/` boundary containing Zod schemas and TypeScript
  types for canonical, uppercase symbols; a `DecimalString` price; `Quote`;
  `SymbolSearchResult`; `HistoricalPrice`; and `HistoricalSeriesPoint`.
  Decimal values remain strings across HTTP and are converted to Postgres
  `NUMERIC` only at the database boundary. No market calculation will coerce a
  provider number to JavaScript `number`.
- Define `MarketDataProvider` around the architecture's capabilities:
  `searchSymbols`, `getQuote`, `getQuotes`, `getPreviousClose`,
  `getHistoricalPrice`, and `getHistoricalSeries`. Its methods return only the
  normalized contracts, including `symbol`, `price`, `previousClose`, `change`,
  `changePercent`, `marketTimestamp`, `fetchedAt`, `source`, and freshness
  status. Provider JSON never crosses the boundary.
- Model freshness separately from value: `fresh`, `stale`, `delayed`, and
  `unavailable`, with an exact UTC `lastSuccessfulAt`, an optional provider
  timestamp, a known delay where the provider supplies one, and a safe reason
  code. `stale` is derived against a documented TTL at read time, never stored
  as a permanent boolean.
- Put the selected adapter in the Edge Function, not the React bundle. A
  future provider is one new adapter plus a contract test fixture; existing
  components, queries, cache rows, and financial calculations remain unchanged.
  Add no dependency unless the chosen provider's adapter genuinely needs it;
  native `fetch`, Zod, and existing decimal-string helpers are sufficient for
  the initial design.

### 2. Add the quote cache migration and least-privilege access

- Add one deterministic Phase 4a migration that creates `app.quote_cache` with
  an immutable identity `(provider, market, symbol)` and fields for canonical
  symbol, USD `NUMERIC` price and previous close, derived `NUMERIC` change and
  percentage, provider timestamp, fetched-at timestamp, declared delay,
  source/version metadata, and timestamps. Use UTC timestamps and check
  constraints for canonical symbols, non-negative prices, and valid source
  metadata. The provider timestamp and fetched-at timestamp are both retained
  so a stale cache entry is never mistaken for a new market observation.
- Index the lookup identity and `fetched_at`. Retention follows the chosen
  provider agreement; do not add a deletion job until the entitlement says
  what cache retention is allowed.
- Enable RLS on `quote_cache`. Revoke all table and sequence privileges from
  `anon` and grant it nothing. Grant browser roles no direct select, insert,
  update, or delete access: the authenticated Edge Function is the only read
  and write path after validation, so browser code cannot manufacture or bypass
  quote data. Document this shared, non-user-owned reference-data exception in
  the migration and prove it in RLS tests.
- Add the database-backed, user-keyed refresh-rate counter needed by the Edge
  Function. It derives the user from the verified JWT, uses a bounded UTC
  window, has RLS enabled, exposes no browser write path, and has its own
  expiry/cleanup policy. It stores only user identifier, window, and count—no
  portfolio values, symbols, or raw requests.

### 3. Implement one authenticated Edge Function endpoint

- Add `supabase/functions/market-data/index.ts` with a narrow operation
  allowlist for `quotes` in this phase. Historical/search operations belong in
  the provider interface but stay unavailable until a later phase needs them.
  This avoids an exposed speculative API surface while preserving provider
  portability.
- Require and verify the caller JWT, derive identity from it, reject any
  `user_id`, validate a small deduplicated bounded symbol list with Zod, and
  enforce the per-user refresh limit before contacting a provider. Return only
  generic safe errors; never return a provider URL, raw response, credential,
  stack trace, account identifier, or provider error message.
- Treat server-enforced invite-only registration as a deployment prerequisite
  for this shared-key endpoint. Confirm public signup remains disabled and the
  allowlist/invite enforcement test passes before enabling live Finnhub access.
- Apply an explicit development and production CORS-origin allowlist from
  server-side configuration. Do not use wildcard CORS. Keep the shared
  `FINNHUB_API_KEY` only in the Edge Function secret store; do not add it to
  `VITE_*`, `.env.example`,
  client code, logs, or test fixtures.
- On a cache miss or a cache entry due under the one-refresh-per-XNYS-trading-day
  policy, serialize/upsert refreshes per
  provider-symbol key so simultaneous portfolio renders do not fan out into
  duplicate provider requests. Fetch a batch where the selected provider
  supports it, validate every untrusted provider response, normalize it, and
  upsert only a complete valid quote. Cache TTL, batch size, refresh rate, and
  stale threshold are server-side configuration values consistent with the
  approved Finnhub free-tier quota; they are not hard-coded in UI code.
- If refresh succeeds, return `fresh` or explicitly `delayed` data with both
  timestamps. If it is throttled, unavailable, invalid, or times out, return
  the last valid cached quote as `stale` with its exact last-successful time.
  If no cache exists, return an `unavailable` quote record for that symbol and
  preserve the rest of the batch. A Finnhub-unsupported or non-returned symbol
  returns unavailable with the decision-record reason instead of failing
  silently. Do not overwrite a valid cached quote with a failure response.

### Phase 4a deployment and live verification (Git Bash on Windows)

Complete the prerequisite above first. From the linked repository in Git Bash:

```bash
# Enter the key without echoing it; this variable exists only in this shell.
read -rsp 'Finnhub API key: ' FINNHUB_API_KEY; echo
supabase secrets set "FINNHUB_API_KEY=$FINNHUB_API_KEY"
supabase secrets list

# Deploy only the Phase 4a function.
supabase functions deploy market-data
```

Set the key in **Supabase Dashboard → Edge Functions → Secrets** as an
alternative to the CLI command. The secret list may confirm the key name only;
never print or commit its value. Functions read newly set secrets without a
redeploy. Do not place this key in any `.env` used by Vite or in a `VITE_*`
variable.

Before deploying the frontend, verify the production key is absent from the
client bundle. In the same Git Bash session where the key was entered, run:

```bash
npm run build
if rg -Fq -- "$FINNHUB_API_KEY" dist; then
  echo 'FAIL: FINNHUB_API_KEY appears in the client bundle' >&2
  exit 1
fi
echo 'PASS: FINNHUB_API_KEY is absent from the client bundle'
unset FINNHUB_API_KEY
```

Use a real, signed-in user's short-lived access token—not a service-role key—to
call the deployed function. Replace placeholders with the linked project ref,
publishable key, and a current user JWT obtained through the authenticated app:

```bash
curl --fail-with-body --request POST \
  "https://<project-ref>.supabase.co/functions/v1/market-data" \
  --header "apikey: <publishable-key>" \
  --header "Authorization: Bearer <user-access-token>" \
  --header "Content-Type: application/json" \
  --data '{"operation":"quotes","symbols":["QQQ"]}'
```

Expect a normalized quote result or an explicit unavailable/stale result, never
a provider-shaped error. Also invoke with an unsupported symbol and an invalid
token to confirm safe per-symbol unavailability and authentication rejection.

### 4. Replace temporary holdings prices with resilient quote queries

- Remove `HARDCODED_USD_PRICE_BY_SYMBOL` only when the selected adapter and
  Edge Function are ready. Add a `useQuotes` TanStack Query keyed by sorted
  visible symbols and account selection. Its stale time is shorter than the
  server cache TTL and it refetches only on a deliberate Refresh Prices action,
  a suitable visibility/refocus policy, or a controlled background interval;
  it must not poll on every component render.
- Keep positions, quantities, average cost, account selection, and the table
  rendered from their existing successful queries while quote fetching is
  pending or failed. A failed quote query renders price/day/value/allocation as
  unavailable or last-known stale as appropriate, never an empty portfolio or
  a zero-valued holding.
- Display current data only when its freshness state is `fresh`. Delayed data
  says “Delayed” with the declared delay. Stale data uses the design system's
  bounded warning treatment and the exact text “Last updated X minutes ago,”
  based on `lastSuccessfulAt`; it is never labelled current/live. Each stale
  price cell and any affected total receives a text status as well as warning
  color. Exclude unavailable prices from totals and state how many holdings
  are excluded.
- The Refresh Prices control uses the same endpoint and quota guard, remains
  disabled while its request is active, and reports a generic retryable status
  without losing displayed cache data. Maintain USD-only constraints in this
  phase; a non-USD position remains unavailable with an explicit explanation
  until an FX policy is designed.

### 5. Test and document the boundary

- Add provider-contract tests using recorded, non-secret fixtures for valid
  responses, malformed decimals, missing timestamps, unsupported symbols,
  empty results, delayed data, and provider errors. Assert adapters emit no
  provider-shaped values.
- Add Edge Function tests for missing/invalid JWT, supplied `user_id`, invalid
  or oversized symbol lists, unauthorized origin, rate limiting, cache hit,
  cache miss, valid upsert, throttling, timeout, invalid provider response,
  partial-batch failure, stale fallback, no-cache unavailable result, and an
  explicit unsupported/non-returned Finnhub symbol result.
- Extend `supabase/tests/rls.sql` to prove `anon` has no quote-cache or
  rate-counter privileges, an authenticated user cannot mutate either table,
  and policies/grants do not expose write paths. Add focused UI tests that
  prove fresh, delayed, stale, unavailable, and quote-error states preserve
  holdings; prove the exact last-updated text and excluded-total count.
- Add a concise market-data decision record to the Phase 4 implementation
  changes: selected plan/add-ons, permitted audience, symbols/exchanges,
  delay, attribution, cache-retention limit, quota configuration, and renewal
  owner. Update the threat model's browser → Edge Function → provider boundary
  with credential theft, quota exhaustion, poisoned provider responses, stale
  data, and licensing misuse controls.

## Verification

At the end of each subphase, run `npm run build`, `npm run lint`, `npm run
test`, and `npm run test:rls`. Before completing 4b, exercise the deployed
authenticated route with a supported US-equity symbol, an unsupported symbol,
and a forced provider failure; confirm no credential reaches browser network
requests, stale data shows its true timestamp, excluded totals are explained,
and the holdings table remains intact. Confirm the anonymous fictional demo
issues no market-data request and has no database access.

## Boundaries

- Finnhub free tier and the written approval recorded in
  `MARKET-DATA-LICENSE.md` are the provider decision; no provider research or
  selection gate remains. The shared server-side key is permitted only while
  the invite-only, friends-and-family, and no-monetization conditions hold.
- No live data is added to the public demo. It remains bundled fictional data.
- No historical portfolio snapshots or historical backfill is implemented;
  historical provider methods are contractual preparation only.
- No external provider data is logged, exposed raw, or treated as investment
  advice. Provider data is an untrusted input and is validated before storage
  or display.
