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
