# Phase 6b — Automated completed-session capture

## Objective and boundary

Phase 6b adds best-effort, no-cost automation around the exact snapshot
invariants and normalized boundaries reviewed in 6a. It queues meaningful
current-state changes, coalesces requests, and runs a private scheduled worker
after verified XNYS closes.

It does not add another payload format, browser scheduling, a public Cron
endpoint, Phase 7 UI, import, or reconstruction from later state. The 6a user
flows remain the recovery path after a missed automatic capture.

## Calendar decision — closed

The selected source is a committed, versioned NYSE annual table. It contains
2026 and 2027 full holidays and 13:00 ET early closes, cites NYSE's 2026--2028
Holiday and Early Closings Calendar PDF in a source comment, and expires on
`2027-12-31`. Weekends, holidays, and dates after that explicit coverage are
non-sessions; capture stops rather than guessing. The file and
`docs/ROADMAP.md` require annual review before coverage is extended.

When a Finnhub market-status response happens to be available during capture,
compare it against the table and log a generic operational mismatch warning.
Do not make an additional Finnhub call, wait for it, block capture, or use it
as a source of truth. It is a correctness canary only.

| Option | Coverage / terms | Tradeoff |
| --- | --- | --- |
| Finnhub | Documents `/stock/market-status` and `/stock/market-holiday`; public docs do not establish free-tier entitlement. Terms say listed plans are personal-use only and bar redistribution/shared derived results without written approval. | Existing secret is convenient, but entitlement and app use need written confirmation; do not assume either. |
| MarketCalendars JSON API | Free/read-only, no key, NYSE schedule/holiday endpoints include early closes and UTC-offset times. Published window: 2025-01-01 to 2028-12-31; informational only, reasonable polling requested. | Smallest integration, but no stated SLA/license commitment and finite coverage. Server-cache it; fail closed outside window/`unknown`; verify against NYSE. |
| Local NYSE table | NYSE annual calendar PDFs show full closures and 13:00 ET early closes; dates are stated as subject to change. | Authoritative/no runtime vendor, but annual review and no automatic extraordinary closures. Version with URL, retrieval/review date and bounds; expire/fail closed. |
| Open-source rules | MIT `pandas_market_calendars` supports NYSE holidays/late opens/early closes. It needs a TypeScript/Edge-compatible port or generated reviewed data. | No recurring service cost, but maintenance moves here; no Python runtime in Edge and no unreviewed generated data. |
| TradingHours.com | XNYS holiday/status data including partial sessions; developer/app offering is subscription-based. | Strong commercial data posture, but violates $0 V1; retain only behind the abstraction for future use. |

The prior options table is retained as decision history. The selected table is
the runtime source; its missing/expired/invalid coverage returns non-session,
so capture stops and directs the user to backfill.

## Capture policy

At most one original snapshot exists per portfolio/XNYS close; Phase 2b unique
original-close remains the final backstop.

| Trigger | Behavior | Source |
| --- | --- | --- |
| Meaningful position/included manual asset/liability change | Atomically enqueue/coalesce the next verified session; never capture intraday. | `position_change` when it wins |
| Refresh or schedule | Capture only after close and before the next XNYS open, with complete fresh current quotes/payload. | `daily_close` otherwise |
| Failure/outage | Retry only that close-settlement window; never infer earlier fact from later state. | none; use 6a |

Eligible means a position, included manual asset, or included liability exists.
Failure in calendar, fresh post-close quotes, capture window, current-state
timing, or payload completeness is only non-financial job status; stale/cache,
intraday, or later-session prices never fill a gap. A write after close requires
historical backfill instead. V1's worker cannot recover a missed window because
there is no historical-close provider.

## Scheduler and security design

A migration schedules Supabase Cron (`pg_cron`) every 15 minutes on weekdays to
call one private `snapshot-capture` Edge Function. It runs only after the
adapter's actual close plus settlement buffer, so DST and 13:00 ET early closes
are correct. This is within the free invocation budget but projects can pause;
it is not a financial-data SLA.

The function gets session/raw prices, locks a bounded pending/eligible batch,
checks state-after-close, builds the trusted complete payload, then calls a
private capture RPC. It caches bounded calendar/close results, returns generic
errors, and logs job/portfolio IDs plus result categories—not balances,
holdings, or prices.

Scheduled invocation uses a dedicated Supabase secret/Vault value and strict
authorization/origin validation. It accepts no user-supplied `user_id`. The
worker RPC has no anon/authenticated execute grant; any `SECURITY DEFINER`
function pins `search_path = ''`, documents scheduler-only elevation, and
verifies trusted worker context. User paths still derive identity from
`auth.uid()`.

## Implementation plan, files, and tests

1. Add private `snapshot_capture_requests`: dedupe, reason precedence, bounded
   errors/attempts, locking, worker-only access. Modify existing atomic
   current-state writes to enqueue/upsert in the same transaction.
2. Add internal worker functions that select stable eligible state and use the
   shared Phase 2b snapshot path, preserving aggregate/child/uniqueness and
   idempotency invariants.
3. Add `supabase/functions/snapshot-capture/`, Cron migration, bounded cache/
   batch/rate handling, and an operator procedure. Document selected source,
   terms, cache, failure, and trust boundary in `docs/THREAT-MODEL.md`.

Target files are `supabase/migrations/<timestamp>_phase_6b_snapshot_capture.sql`,
`supabase/functions/snapshot-capture/`, finalized narrow adapters under
`supabase/functions/market-data/`, targeted current-state RPC migrations,
focused SQL/RLS tests, and threat-model/runbook docs.

Prove queue/worker objects and execute privileges are private; coalescing is
atomic; concurrent manual/worker calls create one original; and cross-user
capture is impossible. Test normal/early/DST/holiday/unavailable/table-expiry,
settlement, precedence, retry/idempotency, batches, private Cron auth, generic
logging, and no stale/intraday fallback. Run `npm run build`, `npm run lint`,
`npm run test`, and `npm run test:rls`.
