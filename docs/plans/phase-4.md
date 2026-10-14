# Phase 4 — Market data

## Goal

Replace the temporary QQQ/VOO display prices with an authenticated,
provider-neutral quote path. Provider credentials remain in Supabase Edge
Function secrets; the browser receives only validated, normalized quotes or a
clearly labelled last-known cached quote. A provider failure must leave the
holdings table and its non-price data usable.

This phase does not choose a market-data vendor, enable a live-data public
demo, add historical backfill, create snapshots, or change the Phase 2a/2b
financial records.

## Provider research — decision required before implementation

Research checked 2026-09-07. Prices, entitlements, exchange agreements, and
terms can change; the chosen provider's current order form and add-ons must be
reviewed before enabling live data in production.

The critical distinction is between an account holder privately viewing data
and the application showing it to registered members. The latter is external
display/redistribution even when the application is free and each member is
authenticated. A server-side credential and a cache do not change that legal
classification.

| Provider | Free tier: limits, coverage, history | Display/redistribution terms | Freshness | What fails when it is outgrown |
| --- | --- | --- | --- | --- |
| [Twelve Data Basic](https://twelvedata.com/pricing) | Free; 8 API credits/minute and 800/day; 8 trial WebSocket credits; three markets. It lists real-time US equities/ETFs, forex, crypto, reference data, batch requests, and global *trial* symbols. The US-equities support article says EOD/historical data is available from Basic after midnight ET on the next trading day; confirm exact endpoint, symbols, and retention during a proof-of-concept because pricing labels Basic as “internal non-display.” | Basic permits **internal non-display** only. The terms say only some tiers/add-ons permit external display and redistribution, subject to extra terms, attribution, exchange rules, and separate agreements. The US-equities article says external distribution requires a Redistribution Rights Add-On and attribution normally applies. Therefore Basic cannot power registered users' holdings screens. | The Basic table labels US equities/ETFs, forex, and crypto real-time, but that right is for internal non-display use. Its US feed represents about 5% of trading volume; EOD history becomes available the next trading day. | It returns 429 once minute/day credits run out. Moving to the individual Grow tier adds internal **display** and removes the daily limit, but it still does not grant external redistribution. Public members require a business/display plan plus the correct redistribution/exchange add-ons; data coverage and attribution can also change. |
| [Alpha Vantage](https://www.alphavantage.co/support/) | Free key: 25 requests/day for the majority of datasets; Alpha Vantage advertises unlimited requests only for a verified open-source or educational project. It documents a broad stock, ETF, FX, crypto, and indicator catalogue, but endpoints have their own entitlements. Historical series are available for supported free datasets; do not assume every symbol, interval, or adjusted series is free. | Its terms license personal, non-commercial use only. They define commercial use to include providing the information directly or indirectly to anyone other than the user, then direct commercial users to contact sales. Thus a public-registration application cannot use the free key for member-facing quotes. | Alpha Vantage says real-time and 15-minute-delayed US market data are premium-only and subject to entitlement. The free path must be treated as **not a licensed current-US-quote source**; the adapter must preserve any supplied timestamp/delay instead of calling it live. | The 26th request fails/throttles. Scaling requires a premium key and, for US real-time or 15-minute delayed data, separate data entitlement; commercial/display use requires written commercial terms. The unlimited educational exception is not a production license. |
| [Polygon / Massive Stocks Basic](https://polygon.io/stocks) | Free; 5 API calls/minute; all US stock tickers; two years of historical data; end-of-day data, reference data, fundamentals, corporate actions, technical indicators, and minute aggregates. It is US-stocks-only for this product; no free live quote entitlement is advertised. | The published market-data terms permit personal, non-business, non-commercial use only and expressly prohibit building an application for end users other than the subscriber. They also prohibit public display/distribution without express prior permission. Basic is therefore unsuitable for public registered users. | End-of-day only on Basic. The published paid individual tiers list 15-minute delayed data at Starter/Developer and real-time at Advanced. | The sixth request in a minute is throttled. A paid **individual** tier still has individual-use terms; a public product needs a business plan and written display/redistribution approval. Paid data also changes retention, delay, and coverage commitments, so the cache's provider/source metadata cannot be discarded. |
| [Finnhub](https://finnhub.io/terms-of-service) | Finnhub exposes global market-data endpoints and its docs show quote/candle-style history endpoints, but its current public pricing page does not state a reliable free-plan request quota, supported quote exchanges, or historical-retention entitlement in text that can be verified without an account. Its terms state a global ceiling of 30 API calls/second, which is **not** a free-plan allocation. Obtain a written free-tier entitlement before treating it as an option. | Every listed plan is personal unless explicitly stated otherwise, and the terms prohibit redistributing or sharing access to data **or derived results** with a third party without written approval. They additionally say a personal plan cannot be used by a business, even internally, without approval. It is not usable for member-facing prices on the default terms. | Do not infer real-time status from an endpoint name. It varies by exchange and entitlement; capture the source timestamp and explicit delay only after Finnhub confirms the chosen plan. | Unknown plan-level free limits make quota exhaustion and feature loss unpredictable. Upgrade/cancellation can require deleting data when the subscription ends; public display needs Finnhub's written approval and likely an appropriate licensed/commercial agreement. |

### Sources and implications

- Twelve Data's [pricing](https://twelvedata.com/pricing),
  [terms](https://twelvedata.com/terms), and [US-equities licensing
  article](https://support.twelvedata.com/en/articles/9935903-us-equities-market-data)
  distinguish Basic non-display use from external redistribution rights.
- Alpha Vantage's [support/pricing](https://www.alphavantage.co/support/),
  [premium page](https://www.alphavantage.co/premium/), and
  [terms](https://www.alphavantage.co/terms_of_service/) distinguish the
  25/day free key from exchange-entitled US real-time/delayed data and define
  access by other users as commercial use.
- Polygon's [Stocks pricing](https://polygon.io/stocks) and
  [market-data terms](https://polygon.io/terms/market_data_terms.pdf) give the
  free US/EOD limits and expressly bar an end-user application on the
  individual license.
- Finnhub's [terms](https://finnhub.io/terms-of-service) supply the decisive
  personal-use and non-redistribution restriction. Its public price page is
  not sufficiently specific to use as a free-tier capacity commitment.

The Phase 4 provider-selection gate is therefore: obtain and record the
selected provider's written authorization for the intended member-facing
display, the instruments/exchanges and historical retention needed by V1,
required attribution, delay status, allowed cache retention, and cost/quotas.
Until that gate passes, live prices remain disabled in production. The
private/educational mode may use only a credential and terms valid for its
single account holder; the anonymous public demo continues to use bundled,
deterministic fictional data and makes no provider request.

## Architecture and implementation plan

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

- Add one deterministic Phase 4 migration that creates `app.quote_cache` with
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
- Apply an explicit development and production CORS-origin allowlist from
  server-side configuration. Do not use wildcard CORS. Keep the provider key
  only in the Edge Function secret store (`MARKET_DATA_PROVIDER` and the
  provider-specific credential); do not add it to `VITE_*`, `.env.example`,
  client code, logs, or test fixtures.
- On a cache miss or expired cache entry, serialize/upsert refreshes per
  provider-symbol key so simultaneous portfolio renders do not fan out into
  duplicate provider requests. Fetch a batch where the selected provider
  supports it, validate every untrusted provider response, normalize it, and
  upsert only a complete valid quote. Cache TTL, batch size, refresh rate, and
  stale threshold are provider configuration values selected from the approved
  quota/entitlement; they are not hard-coded as a licensing assumption.
- If refresh succeeds, return `fresh` or explicitly `delayed` data with both
  timestamps. If it is throttled, unavailable, invalid, or times out, return
  the last valid cached quote as `stale` with its exact last-successful time.
  If no cache exists, return an `unavailable` quote record for that symbol and
  preserve the rest of the batch. Do not overwrite a valid cached quote with a
  failure response.

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
  partial-batch failure, stale fallback, and no-cache unavailable result.
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

After the provider-selection gate and implementation, run `npm run build`,
`npm run lint`, `npm run test`, and `npm run test:rls`. Exercise the deployed
authenticated route with a provider-approved test symbol and a forced provider
failure; confirm no credential reaches browser network requests, stale data
shows its true timestamp, and the holdings table remains intact. Confirm the
anonymous fictional demo issues no market-data request and has no database
access.

## Boundaries

- No provider is selected by this plan and no production credential, paid plan,
  data entitlement, or public-display right is assumed.
- No live data is added to the public demo. It remains bundled fictional data.
- No historical portfolio snapshots or historical backfill is implemented;
  historical provider methods are contractual preparation only.
- No external provider data is logged, exposed raw, or treated as investment
  advice. Provider data is an untrusted input and is validated before storage
  or display.
