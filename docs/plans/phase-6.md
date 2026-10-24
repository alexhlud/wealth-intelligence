# Phase 6 — Snapshot generation and historical backfill

> **Superseded.** This original combined draft is retained only for history.
> Review the approved split plans: `phase-6a-1.md`, `phase-6a-2.md`, and
> `phase-6b.md`. The calendar selection gate in Phase 6b applies before any
> implementation that resolves an XNYS session.

## Objective and boundary

Phase 6 connects Phase 2b's already-tested immutable snapshot model to real
portfolio behavior. It adds deliberate capture policy, a user-operated current
snapshot action, historical backfill with provider-or-user prices, a visible
append-only correction flow, and a reliable daily capture worker.

It does **not** build the Portfolio Time Machine, a historical chart, range
selection, then-vs-now comparison, CSV import, brokerage import, or automatic
reconstruction of a past portfolio from current positions. Those remain Phase
7 (and later CSV work). The Phase 6 surface is for creating, checking, and
correcting recorded facts; it is not the reader for those facts.

No new npm dependency is planned. The implementation uses the existing
Supabase Edge Function/market-provider boundary, Postgres migrations/RPCs,
React, TanStack Query, and Zod.

## Accepted snapshot policy

### A snapshot is one completed XNYS session, never a browser-local moment

Every snapshot represents the latest or selected completed **XNYS** market
session. `as_of_date` is the New York exchange date and `market_close_at` is
that session's actual UTC close instant (16:00 ET normally, 13:00 ET on an
early close). The UI must show both in human terms — for example, “Recorded
for XNYS close · Feb 26, 2026 · 4:00 PM ET” — and must never offer a user-local
calendar day as its meaning.

All security prices stored in a snapshot are raw, as-of-date closes. They are
never split-adjusted. A provider result must explicitly identify a raw close;
adjusted values are rejected. A user-supplied value is allowed only as
`price_kind = manual` or `estimate`, with a truthful source label, never
silently recast as a raw close.

### Capture triggers and de-duplication

The policy deliberately creates at most one original snapshot per portfolio
and XNYS close. Phase 2b's unique original-close constraint is the final
backstop; the application also prevents needless attempts.

| Trigger | Concrete behavior | Snapshot source |
| --- | --- | --- |
| Meaningful portfolio change | A successful create/edit/close position or included manual-asset/liability change marks that portfolio pending for the next completed XNYS session. It does **not** snapshot an intraday quote. The daily worker captures it after that close. | `position_change` when this pending reason wins |
| Successful price refresh | Only a completed-session refresh with all required raw closes may create the session's missing snapshot. An intraday refresh, a stale cache result, a partial refresh, and repeated refreshes do not create one. | `daily_close` unless a pending meaningful change exists |
| Daily schedule | Once per eligible completed XNYS session, the worker captures portfolios that have an open/included fact set and no original snapshot for that close. It is the reliable catch-up mechanism, not a second snapshot stream. | `daily_close` or `position_change` |
| **Save snapshot** | The user explicitly records the latest completed XNYS session. The app obtains raw historical closes for that session, opens price entry only for unavailable symbols, then calls the existing creation RPC. If a snapshot already exists, it shows that recorded snapshot rather than creating a duplicate. | `manual` |
| Historical backfill | The user supplies the complete past composition for a chosen completed XNYS session. Available raw historical closes are proposed; unresolved prices require an explicit manual/estimate value and label. | `backfill` |

“Eligible” means there is at least one current position, included manual asset,
or included liability. A scheduled capture is skipped — and recorded in
operational, non-financial job status only — if the worker cannot validate the
session, obtain every required raw closing price, or assemble a complete
consistent payload. It must not snapshot stale/current/intraday prices just to
fill a date. A user can subsequently use the manual or backfill flow to enter
the missing price with its provenance.

Capture from current state is allowed only in the close-settlement window and
only when no tracked current-state write occurred after that session close. A
later edit means today's rows are no longer evidence of the prior close; the
app must direct the user to historical backfill rather than mislabeling current
composition as yesterday's fact. A free-tier pause or worker outage is
therefore surfaced as a missed capture requiring backfill, never silently
auto-filled from later current state.

An internal, deduplicated `snapshot_capture_requests` queue will record a
portfolio and trigger reason until the server has verified the applicable
session; it then records the target session under a unique portfolio/session
key. Repeated edits and refreshes coalesce. The worker locks and consumes it
only after successful capture; retryable failures remain pending only for that
same close-settlement window. This makes a position change, refresh, retry,
and scheduled run converge on the same one snapshot rather than racing browser
calls.

## Daily scheduler and $0-month operation

The scheduled component will be a Supabase Cron (`pg_cron`) job defined in a
versioned migration. It invokes one private `snapshot-capture` Edge Function;
that function obtains the XNYS session/close metadata, obtains historical raw
prices through the existing server-side `MarketDataProvider`, builds the
complete snapshot payload from trusted current records, and invokes a
service-only internal snapshot-capture RPC. It never exposes provider keys or
a service credential to the browser.

The cron entry runs every 15 minutes on weekdays. The function performs no
capture unless the New York time is after the selected session's actual close
plus a small provider-settlement buffer, and the session calendar confirms it
is a trading session. This avoids an incorrect fixed-UTC schedule across DST
and accommodates 13:00 ET early closes. It is idempotent at both the queue and
snapshot-original-close layers. The market-session boundary must supply
holidays and early closes; a weekday check alone is expressly insufficient.

Supabase Cron is Postgres `pg_cron`, can schedule database work or Edge
Function HTTP calls, and is available on hosted Supabase; the Free plan is
$0/month and includes 500,000 Edge Function invocations per month. At roughly
96 invocations on a weekday, this tiny workload is within that quota for V1.
The project can still pause after a week of inactivity, so the scheduler is
not a guaranteed always-on service on the free tier. Phase 6 will document
that limitation, surface missed sessions as requiring historical backfill after
wake, and retain the manual action. This is no-cost infrastructure, but not a
financial-data SLA.

Sources for this decision: [Supabase Cron documentation](https://supabase.com/docs/guides/cron)
and [Supabase pricing](https://supabase.com/pricing).

The implementation must use a dedicated internal invocation secret stored in
Supabase secrets/Vault and a strict expected-origin/authorization check. The
Edge Function validates its scheduled request, bounds work per run, uses no
user-supplied `user_id`, returns generic operational failures, and logs only
job/portfolio identifiers and result categories — never balances, holdings,
or prices. The internal database function is not granted to `anon` or
`authenticated`; it is narrowly `SECURITY DEFINER`, pins `search_path = ''`,
documents why scheduled server work needs elevation, and verifies the worker's
trusted invocation context. User-facing RPCs continue to derive ownership
from `auth.uid()`.

## Market-session and price boundary

Add a server-only `MarketSessionProvider` alongside `MarketDataProvider`.
For a requested XNYS date it returns either a verified closed session with
`as_of_date` and the precise UTC close, or a non-session result. It is the
single boundary for holidays, early closes, and DST; neither React nor SQL
infers them. The implementation must identify and document the no-cost
calendar source, its terms, cache/refresh period, and fallback behavior before
implementation review. If that source cannot make a verified determination,
the worker/backfill flow must stop instead of guessing.

Extend the server-side market data contract with a historical-close result
that carries value as a decimal string, provider/source, session timestamp,
and an explicit `raw_close`/unavailable outcome. Do not put provider JSON or
keys into the client. The existing current-quote cache is not evidence of a
past close and is never used as a substitute.

## User experience and correction workflow

Create a narrow authenticated **Snapshots** workspace (a capture/audit surface,
not Phase 7's Time Machine) and place a secondary **Save snapshot** action in
the Holdings header. It follows Midnight Scope's quiet instrument grammar:
one primary form/readout per screen, rule-delimited evidence tables, mono for
dates and numeric facts, violet only for the active action/selection, and
warning treatment plus text for incomplete or manually supplied data. The
mobile layout remains a linear sequence; tables expose row details without
hover dependency.

- **Save snapshot:** begin with the resolved latest XNYS close and a concise
  preview of positions, manual assets, liabilities, and totals. Resolve raw
  closes server-side, then show any symbol without one as a required price
  field with a choice of “Known close” (`manual`) or “Estimate” (`estimate`).
  Each manual row visibly states “Manually supplied” or “Estimated” before
  confirmation and afterward in the list. The final confirmation says exactly
  which session will be recorded. Existing session data becomes a link/readout,
  not a second save button.
- **Add historical snapshot:** open a complete, date-first wizard. Date
  selection only admits a verified completed XNYS session; the resolved close
  is displayed before data entry. The user enters accounts/labels, holdings,
  quantities, optional known average costs (zero when legitimately unknown),
  cash/manual assets, and liabilities as decimal strings. The app requests
  available raw historical closes after the composition is known; a returned
  value is labelled with provider and “raw close,” while unavailable values
  block submission until the user supplies and labels a manual/estimated one.
  Source IDs are null for facts that predate app records, preserving that they
  are entered history rather than a false link to today.
- **Recorded snapshots:** show only correction-chain leaves by default, with
  as-of session, source, totals, provenance warnings/counts, and an accessible
  detail view of every copied child line. “Manually supplied” and “Estimated”
  are textual badges/labels, not color alone. Empty, loading, retryable
  provider failure, already-recorded, partial-price, and no-session states
  have explicit copy; no browser-local date is displayed as an as-of date.
- **Correct snapshot:** an owner opens a leaf's complete copy in the same
  bounded editor and must provide a 1–500-character reason before submission.
  Save calls `correct_portfolio_snapshot`, appending a complete replacement
  revision; it never updates or deletes an old row. The detail view names the
  superseded revision, reason, and recorded time, and has an audit-expander
  for earlier revisions. A non-leaf has no correction action. Conflict/
  already-corrected responses refetch the leaf and explain that a newer
  revision is now recorded.

All client forms validate Zod inputs before queries/RPCs: UUIDs, market session
date/close result, bounded text, controlled enums, non-negative decimal
strings with the schema's precision, and bounded row counts. Decimal math for
display previews uses the existing decimal-string utilities; SQL remains the
sole authority for persisted totals. Forms generate one UUID idempotency key
per submission attempt and retain it through a retry.

## Database and server implementation plan

1. Add a Phase 6 migration creating the private capture-request queue and
   worker-facing state/indexes; defer target-session assignment until the
   server verifies it, then enforce per-portfolio/session deduplication,
   bounded error metadata, attempt tracking, and no user-writable access.
   Modify the Phase 2a atomic current-state write RPCs so successful meaningful
   changes enqueue (or upsert) an unresolved capture reason in the same
   transaction. The server — not SQL or the browser — resolves the next
   verified session. Do not introduce browser-side follow-up writes.

2. Add privileged, non-public worker functions that lock a small batch of
   pending/eligible portfolios, reject state that changed after the selected
   close, select a stable current composition, and write via the existing
   snapshot invariants or a shared validated internal path.
   Preserve Phase 2b's complete payload, aggregate computation, immutable
   child copies, original-close uniqueness, and error normalization. The worker
   must choose `position_change` only when its coalesced request caused the
   capture; otherwise it uses `daily_close`.

3. Implement the server-only market-session/historical-price adapters and the
   `snapshot-capture` Edge Function. Cache calendar outcomes and historical
   closes within appropriate bounded server storage, rate-limit work, process a
   bounded batch, and make retries safe. Add the Supabase Cron schedule and a
   documented operator procedure for enabling, observing, pausing, and
   backfilling missed runs. Do not schedule a public browser endpoint.

4. Add snapshot query/repository code that selects owner-visible leaf headers
   and complete children without joining mutable current labels. Add payload
   builders for: current capture, historical backfill, and correction. For a
   backfill, source IDs are optional and no current-state mutation or position
   event is fabricated.

5. Add the Snapshots workspace, Save snapshot confirmation dialog, historical
   wizard, and correction editor; wire the Holdings secondary action. Keep
   Phase 7 navigation/chart/time-machine UI out of this phase. Invalidate only
   affected portfolio, snapshot-leaf, and detail query keys after success.

## Targeted implementation files

- `supabase/migrations/<timestamp>_phase_6_snapshot_generation.sql`
- `supabase/functions/snapshot-capture/index.ts` and narrowly scoped support
  modules/tests beneath `supabase/functions/snapshot-capture/`
- `supabase/functions/market-data/` only for the additive server-side
  historical-close/session contract needed by capture
- `src/features/snapshots/` (schemas, query/payload helpers, workspace,
  dialogs, and tests)
- `src/features/portfolio/PortfolioPage.tsx` and its focused tests (the
  secondary Save snapshot entry point only)
- `src/lib/validation.ts` and tests (additive Zod schemas)
- `src/App.tsx`, `src/components/AppShell.tsx`, and `src/index.css` only as
  necessary to expose the new capture/audit route in the established design
  system
- `supabase/tests/rls.sql` or a focused adjacent SQL test file
- `docs/THREAT-MODEL.md` (scheduled worker/market-calendar trust boundary)

## Test matrix and completion gate

Database/RLS tests must prove queue and worker objects are inaccessible to
`anon` and ordinary authenticated callers; no caller can capture another
user's portfolio; scheduler-only elevation has no public execute grant; a
capture request is atomically coalesced with the current-state write; and
concurrent worker/manual attempts yield exactly one original snapshot per
portfolio/session. Preserve and rerun the Phase 2b adversarial RPC,
immutability, correction-leaf, idempotency, and anon catalog inventory tests.

Unit tests cover decimal-string schemas/payloads, XNYS normal/early-close/DST
and holiday/non-session decisions, session settlement gating, trigger-source
precedence, queue retry/idempotency, raw-close rejection, unavailable-price
blocking, manual/estimate provenance, zero basis/fractional shares, and
backfill source-ID nullability. Edge tests cover authentication of cron calls,
bounded batches, provider failure without financial logging, and no stale or
intraday fallback.

React tests cover all form errors, provider loading/failure, explicit manual
price labelling, duplicate-session readout, decimal preservation, correction
reason/leaf behavior, and query invalidation. Playwright covers: save latest
completed snapshot; create an historical snapshot with a manually supplied
price; observe its provenance; append a correction and retain the old revision;
and cross-user isolation. Run `npm run build`, `npm run lint`, `npm run test`,
and `npm run test:rls` before completion.

## Sizing and recommended split

This is too large for one implementation session if “session” means a single
reviewable coding pass: it crosses privileged scheduling/market-server work,
database changes, and three user flows. Split it after approval into:

1. **Phase 6a — deterministic manual capture and backfill:** snapshot
   workspace, historical-price/manual-price boundary, creation/correction UI,
   Zod/query code, and all user-facing tests. It delivers immediate value
   without unattended work.
2. **Phase 6b — automated capture:** market-session calendar adapter, capture
   queue/current-write integration, private Edge worker, Cron migration,
   operational documentation, and scheduler/security tests.

Phase 6b may begin only after 6a is reviewed; it must reuse 6a's exact payload
and provenance rules rather than creating a second snapshot path.
