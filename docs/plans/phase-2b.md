# Phase 2b — Immutable Portfolio Snapshots

## Objective and boundary

Phase 2b extends the completed Phase 2a schema with immutable net-worth
snapshots and their exact copied composition: `portfolio_snapshots`,
`snapshot_positions`, `snapshot_manual_assets`, and `snapshot_liabilities`.
It adds atomic creation/correction RPCs, correction-chain leaf semantics, XNYS
close validation, RLS, grants, immutability triggers, and the full test matrix
for those objects.

It does not add UI, charts, market-provider integration, a scheduled snapshot
job, or historical-price lookup. It requires a separate implementation review
after Phase 2a and has no new dependency.

## Accepted design decisions

### Snapshots are as-of-date raw, not split-adjusted

Each snapshot stores the quantity, average cost, and price true at that market
close. A later split never rewrites an earlier snapshot: a pre-split snapshot
can remain 10 shares at its contemporaneous raw price while a later snapshot
shows 20 shares, with the Phase 2a split event explaining the transition.

This preserves literal historical fact. A future chart may derive and label a
split-adjusted comparison series, but it must never replace raw history. Every
snapshot position therefore records price timestamp and source/kind. Adjusted
provider values cannot be silently stored as raw; a later approved workflow
must reject or explicitly mark them as estimates.

### History immutability uses privileges, RLS, and blocking triggers

All four snapshot tables are append-only. Authenticated clients receive
`SELECT` only. Inserts occur solely inside snapshot RPCs, and unconditional
`BEFORE UPDATE OR DELETE` triggers extend Phase 2a's database-level immutable
history invariant. The accepted account-erasure tradeoff remains unchanged.

### Corrections are appended as complete revisions

`correct_portfolio_snapshot` authenticates and locks the owned snapshot,
requires that it is the current correction-chain leaf, requires a bounded
non-empty reason, preserves the original portfolio/date/exchange/timezone/close
metadata, inserts a complete replacement header and complete replacement child
sets atomically, and links it through `corrects_snapshot_id` with source
`correction`.

Old revisions remain readable for audit/export. Normal consumers select only
leaves—rows for which no owned snapshot corrects their ID. A unique constraint
on `corrects_snapshot_id` prevents competing direct revisions. Full replacement
makes every revision independently intelligible and avoids inherited ambiguity.

### “As of date” is the XNYS market-session date

V1 fixes `exchange_mic = 'XNYS'` and `exchange_timezone =
'America/New_York'`. `as_of_date` is the XNYS civil session date, while
`market_close_at` is the actual close instant stored as UTC `timestamptz`.
Converting that instant through New York must yield `as_of_date`; weekends are
rejected. The actual instant supports both normal and early closes.

Holiday and early-close calendars are external market reference data and
remain outside this database phase. The RPC requires explicit close metadata;
a later market-calendar boundary must prove the session before calling it.
This is more honest than embedding an incomplete holiday calendar.

### Separate manual-asset and liability facts remain separate in history

The accepted current-table separation from Phase 2a continues in snapshot
children. Assets are non-negative values and liabilities are non-negative
balances subtracted from assets; they are never conflated through signs.

## Snapshot model

`portfolio_snapshots` stores owner/portfolio/request IDs; XNYS session
metadata; checked source (`manual`, `position_change`, `daily_close`,
`backfill`, `correction`); USD valuation currency; derived investment value,
cost basis, unrealized gain, cash subset, included manual-asset value, included
liability value, and total net worth; optional correction link/reason; and
creation time. Checks enforce non-negative components and aggregate identities.
Cash is a disclosed subset of manual assets and is not added twice. One
original per portfolio/close is allowed; corrections link around that partial
uniqueness.

`snapshot_positions` copies identifying/account labels and raw quantity, cost,
price, price timestamp/source/kind, derived market value/cost basis/gain,
nullable gain percentage for zero basis, weight, traceable nullable source
position, and creation time. It never joins mutable present-day labels to
render a historical fact.

`snapshot_manual_assets` and `snapshot_liabilities` copy name, category,
account label, value/balance, inclusion flag, currency, optional source-row ID,
effective timestamp, and creation time. These two accepted child tables are
required to explain and correct exact net-worth composition; aggregates alone
would preserve only an opaque total.

All financial fields follow Phase 2a's bounded `NUMERIC`, USD, and UTC rules.

## Atomic snapshot write boundaries

`create_portfolio_snapshot(...)` and `correct_portfolio_snapshot(...)` accept
complete, bounded typed JSON line-item arrays. They authenticate via
`auth.uid()`, validate ownership and references, compute—not trust—totals in
SQL, and insert the header and all children in one transaction. Identical
request retries return the committed ID; different normalized intent with the
same request ID fails.

Both are narrowly justified `SECURITY DEFINER` functions because clients lack
direct history inserts. Each pins `search_path = ''`, fully qualifies every
reference, never accepts `user_id`, documents the elevation, revokes `PUBLIC`
and `anon`, and grants only `authenticated` execution. Future callers must
also validate with Zod before invoking them; this database-only phase has no
client call site.

## RLS, grants, and migration

RLS is enabled and forced on every snapshot table with owner-only `SELECT`
policies and composite keys preventing duplicated ownership fields from
disagreeing with parents. Required timeline and correction-leaf indexes are
added. No direct history mutation grant exists. Phase 2a's catalog-wide anon
revocations/default privileges are reaffirmed after every new object.

The migration creates the header and three child tables, aggregate and XNYS
validation, ownership-preserving keys/indexes, creation/correction RPCs,
immutable triggers, RLS policies, comments, authenticated read/execute grants,
and final `PUBLIC`/`anon` revocations. It does not create current-wealth
objects already owned by Phase 2a.

## Database test matrix

Tests prove owner reads and cross-user zero-row reads for all four tables,
denial of direct insert/update/delete even to owners, rejection of cross-user
parenting, and trigger-enforced immutability under a privileged test role.

Snapshot behavior tests cover complete line-item copies and exact aggregates;
zero basis and fractional quantities; normal and early XNYS closes;
local-date mismatch and weekend rejection; atomic rollback; idempotent retry
and mismatched request reuse; full correction with byte-for-byte preservation
of originals; foreign and non-leaf correction rejection; unique correction
edges; and leaf selection returning only the latest revision.

Every `SECURITY DEFINER` RPC receives explicit adversarial tests. Snapshot
creation is attempted with another user's portfolio and every source-row ID
capable of crossing ownership, plus nonexistent equivalents. Correction is
attempted with another user's snapshot and foreign source rows in replacement
children, plus nonexistent equivalents. All attempts fail without partial
writes. Foreign and nonexistent IDs must have the same SQLSTATE and public
error text, so existence is not disclosed. No JSON field or scalar parameter
may cause a write outside the caller's ownership.

Catalog-driven anon privilege inventory is rerun across every table/view,
sequence, function overload, and application-defined type, including all four
snapshot tables, both RPCs, and shared validation/trigger functions.

## Targeted implementation files

- `supabase/migrations/<timestamp>_phase_2b_snapshots.sql`
- `supabase/tests/rls.sql` or narrowly split SQL test files if needed

## Completion gate

Phase 2b is complete only after separate approval, clean migration application
over Phase 2a, verified correction/snapshot behavior, and passing build, lint,
unit, and RLS suites.
