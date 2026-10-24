# Market data licensing

## Provider

Finnhub (finnhub.io), free tier. 60 API calls per minute.

## License status

Finnhub's published plans, including paid tiers, are all licensed for
personal use. Their terms require written approval before sharing data
with third parties.

Written approval was requested and granted on 2026-10-14. Finnhub
confirmed that use with friends and family, with no monetization, is
permitted.

## Conditions this approval depends on

- Invite-only. No public registration.
- No monetization of any kind.
- Users are people known personally to the operator.

If any of these change, the approval no longer applies and Finnhub must
be contacted again before continuing.

## Implementation requirements

- The API key lives only in Supabase Edge Function secrets. It never
  reaches the browser, logs, the recovery export, or the repository.
- Quotes are cached server-side. A long-horizon tracker does not need
  frequent refreshes; one refresh per symbol per trading day is the
  baseline.
- Stale data is labelled with its true last-updated time and is never
  presented as current.
- Finnhub is credited as the data source in the application.

## Phase 4 decision record

- Plan: free tier, no add-ons recorded; 60 provider calls per minute.
- Audience: personally known friends and family, invited by the operator;
  no monetization or public signup. The operator owns renewal and must obtain
  new written approval before changing those conditions.
- Scope: USD US stocks and ETFs supported by Finnhub. Other asset types and
  non-USD accounts are excluded from quote-dependent values. Finnhub's empty
  quote is reported as not found; this does not prove exchange eligibility.
- Delay: no specific delay is established in the recorded approval; the UI
  displays a delay only if supplied, and does not describe quotes as live.
- Attribution: the holdings page credits Finnhub.
- Cache retention: no maximum was specified in the recorded approval; the
  implementation has no automatic expiration or deletion. The operator must
  confirm an applicable retention limit with Finnhub and implement it if needed.
- Quota: the endpoint accepts at most 25 symbols and attempts to limit each
  user to 10 requests per UTC minute. It reuses a same-day cache and cached
  weekend quotes; it does not implement a global 60-call limiter, atomic
  rate increments, per-symbol refresh locks, or an exchange holiday calendar.
  These are material limits on the intended daily refresh and quota protection.

## Historical-close verification — 2026-10-24

The manual verification script queried Finnhub's `stock/candle` endpoint for
NVDA's pre-split June 7, 2024 daily close. The approved key returned HTTP 403;
the same script returned HTTP 401 with an intentionally bad key. This verifies
that the key is valid but historical candles are unavailable on the project's
free tier. No historical close was stored or classified as raw.

Alpha Vantage was also considered and declined use for this project. There is
therefore no provider of historical closes in V1. Snapshots of the latest
completed session use a fresh Finnhub current quote obtained after that session
has closed, during the bounded before-next-open capture window. Historical
backfill requires user-supplied prices, explicitly labelled `manual` or
`estimate`; it makes no provider-price request.

Snapshot positions record these values as `current_quote_close`: a Finnhub
current quote captured after the named XNYS session close, with its distinct
quote-fetch timestamp. It is not `raw_close`, which means an
exchange/provider-supplied unadjusted official close for that session. The
values often agree, but the application preserves their different provenance.
Nothing writes `raw_close` in V1.

The provider abstraction keeps a historical-close result unavailable by default
so a future approved source can be added behind that contract. It must identify
an unadjusted/raw close before any snapshot path may label its value `raw_close`.
