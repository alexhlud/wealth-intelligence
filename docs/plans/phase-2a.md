# Phase 2a — Current Wealth Model and Position History

## Objective and boundaries

Phase 2a extends the Phase 0.5 database without discarding existing data. It
delivers profiles, portfolios, logical accounts, evolved current positions,
current manual assets and liabilities, immutable position events, atomic
position-create and position-edit RPCs, RLS, least-privilege grants, backfills,
and the complete database security test matrix for those objects.

This phase contains no snapshot tables or snapshot RPCs, React/UI work,
market-price provider, quote cache, dashboard, chart, scheduled job, historical
price lookup, or bank/brokerage integration. Snapshot work is deliberately
deferred to Phase 2b. No new dependency is required.

## Accepted design decisions in this phase

### History immutability uses privileges, RLS, and blocking triggers

`position_events` is append-only. Authenticated clients receive `SELECT` only,
with no direct `INSERT`, `UPDATE`, or `DELETE` grant or policy. Inserts occur
only inside the narrowly granted position RPCs. A `BEFORE UPDATE OR DELETE`
trigger raises unconditionally, making immutability a database property even
if a future grant or privileged maintenance query is too broad.

The tradeoff is deliberate: future full-account erasure cannot rely on normal
cascades through history. It requires a separately reviewed, tightly controlled
procedure. Phase 2a will not weaken history in anticipation of that work.

### Manual assets and liabilities use separate tables

`manual_assets.current_value` and `liabilities.outstanding_balance` are
non-negative `NUMERIC` values. Net worth is assets minus liabilities; a
liability is never represented as a negative asset. Separate tables prevent
double-negative errors, allow domain-specific categories and fields, and make
RLS and export semantics explicit. The small amount of duplicated ownership
and timestamp structure is worth the stronger model.

## Currency and numeric policy

V1 remains USD-only. Currency columns are constrained to `USD`. Quantities and
ratios use bounded `NUMERIC(28,12)` and money/unit costs use bounded
`NUMERIC(24,8)`; no financial value uses floating point. Values are formatted
only at render time. Quantities, costs, asset values, liability balances, split
ratios, and dividend amounts receive the appropriate non-negative or positive
checks. Zero average cost is valid. All instants are `timestamptz` and stored
as UTC.

## Relational model

### `app.profiles`

- `id uuid`, both primary key and foreign key to `auth.users(id)`;
- bounded nullable `display_name`;
- `preferred_currency char(3)` constrained to `USD`;
- a valid PostgreSQL/IANA `timezone`, default `UTC`; and
- `created_at`, `updated_at`.

Identity is the Auth user identity; there is no separate client-supplied owner.
The migration backfills a minimal row for existing Auth users, and portfolio
initialization creates one for the caller without copying unvalidated Auth
metadata.

### `app.portfolios`

The existing table retains its identity, ownership, name, primary flag, and
timestamps; gains a bounded nullable description and a profile-owner foreign
key; and retains the one-primary-per-user and composite ownership constraints.
`ensure_primary_portfolio()` remains `SECURITY INVOKER`, derives identity only
from `auth.uid()`, and first ensures the caller's profile exists.

### `app.accounts`

Accounts contain `id`, `user_id`, `portfolio_id`, bounded name and optional
institution name, checked logical account type (`brokerage`, `retirement`,
`savings`, `cash`, `crypto_wallet`, or `other`), `include_in_net_worth`, USD
currency, and timestamps. Composite foreign keys prove account and portfolio
share the owner. There are no connection, credential, sync, or external
institution fields.

### `app.positions`

The Phase 0.5 table retains its rows and gains a required same-owner account,
bounded security name, checked asset type, `open`/`closed` status, `closed_at`,
and `last_event_at`. Quantity becomes `NUMERIC(28,12)` and may be zero only for
a closed position. Average cost becomes `NUMERIC(24,8)` and may be zero.
Positions cannot be hard-deleted through the application.

Each existing portfolio receives one clearly named `Unassigned` account.
Existing positions are assigned to it, use their symbol as the temporary
security name, receive neutral asset type `other`, and remain open. The
migration does not guess a security classification.

### `app.manual_assets`

Manual assets contain `id`, `user_id`, `portfolio_id`, nullable same-owner
`account_id`, bounded name, checked category (`cash`, `savings`, `real_estate`,
`vehicle`, `business_equity`, `collectible`, or `other`), non-negative current
value, USD currency, inclusion flag, bounded notes, timestamps, and a UTC
`value_as_of` instant.

### `app.liabilities`

Liabilities mirror the ownership shape but store a non-negative outstanding
balance and checked category (`mortgage`, `vehicle_loan`, `student_loan`,
`credit_balance`, `personal_loan`, or `other`) plus `balance_as_of`. Interest
schedules and payment modeling are not introduced.

### `app.position_events`

Events contain owner/portfolio/position IDs, an owner-scoped idempotency
`request_id`, checked event type (`initial`, `buy`, `sell`, `correction`,
`transfer`, `reinvestment`, `manual_adjustment`, `split`, `dividend`, `close`,
or `reopen`), complete before/after identifying and financial state, quantity
delta, conditional split/dividend fields, bounded notes, checked source,
`occurred_at`, and audit `created_at`.

Splits require a positive ratio and the database derives post-split quantity
and average cost so total basis is preserved. Cash dividends require a
non-negative amount and do not change quantity or cost; reinvested dividends
use `reinvestment`. A dividend event does not silently alter a cash asset.

The migration creates exactly one deterministic `initial` event for every
existing position, using the position ID as request ID and its original state
and creation time as the event facts.

## Atomic position write boundaries

### `app.create_position(...)`

Direct authenticated inserts into positions are removed. The RPC authenticates
with `auth.uid()`, validates and locks a portfolio/account chain belonging to
that caller, inserts the position and mandatory initial event in one
transaction, and returns stable IDs for an identical request retry. Reusing a
request ID for different intent fails.

### `app.edit_position(...)`

The RPC accepts a position ID, complete intended state/reason metadata,
event-specific split/dividend values, event time, bounded notes, and a request
ID. It never accepts `user_id`. It authenticates, performs idempotency checks,
locks the position with both its ID and `auth.uid()` so missing and foreign IDs
are indistinguishable, validates any target account against the same owner and
portfolio, enforces event-specific invariants, updates current state, and
appends the complete immutable event in one transaction. Any failure rolls the
whole write back.

Both RPCs are narrowly justified `SECURITY DEFINER` functions because callers
intentionally lack direct position/event write grants. Each pins
`search_path = ''`, fully qualifies every object, derives ownership from
`auth.uid()`, has a comment explaining the elevation, revokes execution from
`PUBLIC` and `anon`, and grants it only to `authenticated`.

## RLS and privilege model

RLS is enabled and forced on every application table. Policies use only
`auth.uid()` and same-owner parent constraints.

- profiles: owner `SELECT`, `INSERT`, and `UPDATE`;
- portfolios, accounts, manual assets, and liabilities: owner CRUD;
- positions: owner `SELECT` only; all writes use RPCs;
- position events: owner `SELECT` only; insert uses RPCs and mutation is
  trigger-blocked.

`anon` receives no schema usage/create privilege, no table/view/sequence/type
privileges, and no function execution. `PUBLIC` and `anon` are explicitly
revoked before minimal authenticated grants are applied. Default privileges
remain closed. Realtime is not enabled.

## Migration and backfill sequence

1. Reaffirm schema and default-privilege revocations.
2. Create and backfill profiles.
3. Evolve portfolios and initialization.
4. Create accounts and one Unassigned account per existing portfolio.
5. Evolve positions in place and validate expanded constraints after backfill.
6. Create manual assets and liabilities.
7. Create position events and deterministic initial events.
8. Add RPCs, immutable/timestamp triggers, indexes, comments, RLS, and grants.
9. Repeat explicit `PUBLIC`/`anon` revocations for all new objects/signatures.

Delete behavior is `RESTRICT` wherever deletion could erase or orphan history.

## Database test matrix

Tests use two authenticated identities and an anonymous context, valid
same-owner fixture chains, and transaction rollback.

For profiles, portfolios, accounts, positions, manual assets, liabilities, and
position events, tests prove owner access, cross-user zero-row reads, rejection
of writes parented to another user, zero-row/denied cross-user updates and
deletes, inability to reparent owned data to a foreign object, and denial of
direct writes to RPC-owned or append-only tables. Privileged update/delete
attempts against events must also hit the immutable trigger.

RPC and invariant tests cover atomic create+initial-event behavior, edit plus
one before/after event, identical retries, mismatched request reuse, rollback
on invalid intent, split basis preservation, cash dividend invariants, zero
cost basis, fractional shares, close, reopen, and same-owner transfer.

Every `SECURITY DEFINER` RPC receives explicit adversarial tests. For
`create_position`, the caller supplies another user's account and portfolio in
every meaningful combination, plus nonexistent IDs; all attempts fail without
writes. For `edit_position`, the caller supplies another user's position ID,
another user's account ID for an owned position, and nonexistent equivalents;
all attempts fail without writes. Foreign and nonexistent IDs must produce the
same SQLSTATE and public error text, proving the RPC does not reveal existence.
No parameter may cause a write outside the caller's ownership.

Catalog-driven assertions enumerate every application table/view, sequence,
function signature, and application-defined type and prove `anon` has no
effective privilege through either direct grants or `PUBLIC`. Non-empty and
named-object assertions prevent vacuous coverage.

## Targeted implementation files

- `supabase/migrations/<timestamp>_phase_2a_current_wealth.sql`
- `supabase/tests/rls.sql`

No source/UI file, generated client type, dependency, market-data file, or
snapshot object belongs to Phase 2a.

## Completion gate

Phase 2a is complete only when its additive migration applies over the Phase
0.5 state, backfills are verified, and all of these pass:

- `npm run build`
- `npm run lint`
- `npm run test`
- `npm run test:rls`

Stop after this gate. Do not begin Phase 2b.
