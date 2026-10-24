# Phase 6a-1 — Manual latest-close snapshot boundary and read-only workspace

## Objective and boundary

Phase 6a-1 establishes the server-only completed-session quote boundary, lets
an authenticated owner save exactly the latest completed XNYS session, and
exposes recorded snapshot leaves in a read-only **Snapshots** workspace. It is
one narrow creation flow plus a reader for the facts it creates.

It does **not** add the historical backfill wizard, correction writes, the
capture-request queue, changes to current-state write RPCs, a privileged
worker, Cron, automatic snapshots, or Phase 7 history/chart UI. No new npm
dependency is planned. This uses the existing Supabase Edge Function/provider
boundary, Postgres RPCs, React, TanStack Query, and Zod.

## Verified XNYS session source — decided

`MarketSessionProvider` uses a committed, versioned NYSE annual table rather
than a runtime calendar service. The table records full holidays and 13:00 ET
early closes for 2026 and 2027, cites the NYSE 2026--2028 Holiday and Early
Closings Calendar PDF in its source comment, and has an explicit coverage end
date of `2027-12-31`.

Regular weekdays inside that coverage resolve to 16:00 ET; table holidays,
weekends, and every date after coverage return a non-session result. The
provider never guesses a normal close beyond its coverage. The table carries an
annual maintenance note requiring review against NYSE's next published calendar
before extending the coverage. `docs/ROADMAP.md` carries the same release
maintenance obligation.

When a Finnhub market-status response is already available during a capture,
the server compares it with the table and logs only an operational mismatch
warning. It does not request Finnhub for this purpose, block on it, or treat it
as a session source. The table remains authoritative at runtime.

## Manual-capture policy

Every snapshot represents one completed **XNYS** regular session: `as_of_date`
is the New York exchange date, never the user’s local day, and
`market_close_at` is the exact UTC close (normally 16:00 ET; 13:00 ET on an
early close). The interface says this plainly, for example “Recorded for XNYS
close · Feb 26, 2026 · 4:00 PM ET.”

There is no historical-close provider in V1: Finnhub's historical-candle call
returned HTTP 403 for the valid free-tier key on 2026-10-24, and Alpha Vantage
was declined. For the latest completed session only, a fresh Finnhub **current
quote fetched after the verified close** is the price evidence. It must be
fetched after the close and before the next XNYS session opens; cached, stale,
intraday, adjusted, and later-session values are rejected. It is stored as
`current_quote_close`, with provenance `finnhub current quote after XNYS close`
and a separate quote-fetch timestamp; it is not historical `raw_close`. The
schema keeps `raw_close` exclusively for a future provider that explicitly
supplies an unadjusted official close, and V1 writes none. At most one original
snapshot may exist per portfolio/session; Phase 2b's unique
original-close constraint remains the final backstop.

Save snapshot is a deliberate user action. The server builds from trusted
current state, fetches every required current quote after close, and calls the
existing creation RPC with a retained idempotency UUID. It may capture only if
no tracked current-state write occurred after that session close. If a later
write, provider failure, missing quote, or next-session opening makes the
composition or price inadequate evidence, it stops and directs the user to
Phase 6a-2 backfill.

This pass has no manual/estimate price escape hatch: missing, stale, partial,
unavailable, or outside-window prices block saving. Provenance editing belongs
in Phase 6a-2 rather than expanding this first implementation pass.

## Server boundary

Add server-only abstractions alongside `MarketDataProvider`:

- `MarketSessionProvider.getLatestCompletedSession('XNYS', now)` returns a
  verified `{ asOfDate, marketCloseAt }`, `no_completed_session`, or
  `unavailable`. It alone interprets holiday, early-close, and DST rules.
- `MarketDataProvider.getHistoricalClose(symbol, asOfDate)` remains an explicit
  unavailable outcome in V1. It reserves a normalized decimal-string raw-close
  contract for a future approved provider without exposing provider JSON/keys
  to React. A future source would replace only this unavailable adapter and
  permit a backfill price proposal after it proves raw/unadjusted semantics.

The server validates its after-close/before-next-open capture window and
requires a complete payload. It bypasses the current quote cache for capture so
a pre-close cached value is never recorded. Neither React nor SQL decides
whether XNYS was open.

## User experience

The authenticated **Snapshots** route is a capture/audit surface, not Phase
7's history reader. It follows Midnight Scope: one primary readout per screen,
rule-delimited evidence tables, mono dates/numerics, violet only for the active
action, and text rather than color alone for status. Mobile remains linear and
does not depend on hover.

- A secondary **Save snapshot** Holdings action opens a concise confirmation
  view. It resolves and displays the latest completed XNYS close, then previews
  positions, manual assets, liabilities, and totals. Confirmation names the
  exact session.
- No-completed-session, calendar-unavailable, later-state-change, loading,
  price failure, outside-capture-window, incomplete-price rejection, and
  duplicate states get
  explicit truthful copy; none substitutes a browser-local date.
- The workspace lists correction-chain leaves only, with as-of session, source,
  totals, and provenance-warning count. It is read-only in 6a-1. Accessible
  detail shows every immutable copied child line without joining mutable labels.
- An existing session becomes a link/readout, never a second save button.

All inputs are Zod-validated before RPCs: UUIDs, trusted session values,
controlled enums, bounded rows, and decimal-string precision. Previews use
existing decimal-string utilities while SQL remains authoritative. Invalidate
only affected portfolio, leaf, and detail query keys.

## Implementation plan

1. Implement the committed, server-only NYSE table and fail-closed adapter;
   cover normal close, 13:00 ET early close, holiday, weekend, and
   post-coverage non-session outcomes. Do not add a queue, Cron, worker, or
   privilege elevation.
2. Extend the market-data Edge Function/provider contract with session outcomes
   and a server-built, fresh-after-close capture result. Preserve an explicit
   unavailable historical-close contract for a future provider. Credentials stay
   in Supabase secrets; provider JSON never reaches browser code.
3. Add owner-visible leaf header/detail repository/query code, preserving
   Phase 2b correction-chain semantics.
4. Add the narrow creation path: resolve session/prices server-side, detect
   state-after-close, build a complete Phase 2b payload, and call
   `create_portfolio_snapshot` once with its idempotency key.
5. Add the Snapshots route/list/detail and Holdings action only.

## Targeted files and tests

- `supabase/functions/market-data/` — additive XNYS-session and fresh
  post-close capture contract; unavailable historical-close contract retained
- `src/features/snapshots/` — schemas, owner queries/payloads, read-only
  workspace/detail, save dialog, and focused tests
- `src/features/portfolio/PortfolioPage.tsx` — secondary action only
- `src/lib/validation.ts`, `src/App.tsx`, `src/components/AppShell.tsx`, and
  `src/index.css` only where needed; focused migration/RPC and RLS test files
  only if Phase 2b lacks a safe required boundary

Test normal/early-close/DST/holiday/no-session/unavailable calendar outcomes;
after-close/before-next-open gating; cache bypass; unavailable price blocking;
decimal precision; state-after-close; duplicate/idempotency; fractional shares; zero basis;
owner-only leaf/detail reads; immutable children; and cross-user denial.
React tests cover loading, each failure state, duplicate readout, session copy,
details, and query invalidation. Playwright covers saving the latest completed
session, seeing it read-only, and isolation. Run `npm run build`, `npm run
lint`, `npm run test`, and `npm run test:rls` before handoff.
