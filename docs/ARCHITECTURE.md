# ARCHITECTURE

# TECHNOLOGY STACK

Use the following unless there is a strong technical reason to deviate.

## Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui where appropriate
- Lucide icons
- React Router
- TanStack Query
- Zod
- Recharts

## Backend

Supabase:

- PostgreSQL
- Supabase Auth
- Row Level Security
- Edge Functions where server-side functionality is necessary
- Supabase Cron where scheduled jobs are appropriate
- Supabase Vault for appropriate server-side secret storage

## Hosting

Source code:

**GitHub**

Production frontend:

**Cloudflare Pages**

Do not use GitHub Pages for the authenticated application.

The GitHub repository should remain a major part of the portfolio project and contain:

- source code
- README
- architecture documentation
- setup instructions
- security documentation
- development history

## Testing

Use:

- Vitest
- React Testing Library
- Playwright for critical end-to-end flows

## Code Quality

Use:

- ESLint
- Prettier
- TypeScript strict mode

---

## Cost constraint

V1 must run at approximately $0/month. Do not introduce paid
infrastructure when a reliable free alternative exists.

If a feature genuinely requires a paid service: explain the limitation,
name the free alternative, state what functionality is lost, isolate the
paid dependency behind an abstraction or feature flag, and continue
building everything that can remain free.

No paid APIs are required for V1.

# MARKET DATA ABSTRACTION

Do not tightly couple application logic to one provider.

Create an abstraction similar to:

`MarketDataProvider`

with methods conceptually equivalent to:

- searchSymbols(query)
- getQuote(symbol)
- getQuotes(symbols)
- getPreviousClose(symbol)
- getHistoricalPrice(symbol, date)
- getHistoricalSeries(symbol, startDate, endDate)

Provider responses must be normalized into our own internal types.

Example normalized quote:

- symbol
- price
- previousClose
- change
- changePercent
- marketTimestamp
- fetchedAt
- source
- stale

The rest of the application should consume OUR normalized interface rather than provider-specific JSON.

This must make changing from Finnhub to Twelve Data or another provider straightforward.

---

# MARKET DATA LICENSING DESIGN

Do not assume free market data can legally be redistributed to unlimited public users.

V1 should support a PRIVATE / EDUCATIONAL usage mode.

The public demonstration environment must use fictional data and must not rely on redistributing live market prices.

Create the architecture so future options can include:

- administrator-owned provider credentials
- user-provided market API credentials
- different providers
- delayed market data
- licensed data

Do not hard-code a licensing assumption into application architecture.

---

# MARKET DATA UX

Users should see:

Price

Daily change

Daily %

Last updated time

If the price is stale, explicitly indicate:

“Last updated X minutes ago.”

Never silently present stale pricing as live.

If the API fails:

DO NOT make the entire portfolio disappear.

Use the last successfully cached price and visibly mark it as stale.

---

# MARKET DATA CACHING

Create a quote cache.

A quote record should contain approximately:

- symbol
- price
- previous_close
- change
- change_percent
- provider
- provider_timestamp
- fetched_at

Avoid making a new external API call every time a React component renders.

Prefer:

application cache

+

database/server cache

+

reasonable TanStack Query stale times.

Design cache duration so free API quotas are respected.

---

# CORE DATA MODEL

Design a proper relational schema.

At minimum consider the following entities.

## profiles

Associated with Supabase Auth user.

Potential fields:

- id
- display_name
- preferred_currency
- timezone
- created_at
- updated_at

---

# portfolios

A user may eventually have multiple portfolios.

Potential fields:

- id
- user_id
- name
- description
- is_primary
- created_at
- updated_at

---

# accounts

Represents logical financial accounts.

Examples:

- Fidelity Brokerage
- Roth IRA
- 401(k)
- Savings
- Crypto Wallet

Fields could include:

- id
- user_id
- portfolio_id
- name
- account_type
- institution_name
- include_in_net_worth
- created_at
- updated_at

Do NOT require banking integrations.

These are manually created logical containers.

---

# POSITIONS

Maintain the current state of an investment position.

Fields approximately:

- id
- user_id
- portfolio_id
- account_id
- symbol
- security_name
- asset_type
- quantity
- average_cost
- currency
- created_at
- updated_at

Use appropriate precision.

Do not use floating-point types where financial decimal precision is important.

Use PostgreSQL NUMERIC appropriately.

---

# POSITION EVENT HISTORY

Even though the UI is simple, every meaningful position change must create an immutable event.

Create something conceptually similar to:

`position_events`

Potential fields:

- id
- user_id
- portfolio_id
- position_id
- event_type
- occurred_at
- previous_quantity
- new_quantity
- quantity_delta
- previous_average_cost
- new_average_cost
- notes
- source
- created_at

Example event types:

- initial
- buy
- sell
- correction
- transfer
- reinvestment
- manual_adjustment
- split
- dividend

Do not delete historical events when a current position is changed.

A split changes quantity and average cost without changing value.

It must be recorded as an explicit event type, not as a manual correction, so that historical snapshots and cost basis remain interpretable.

Plan for stock splits and dividends in the schema even if V1 handles them manually.

---

# PORTFOLIO SNAPSHOTS

THIS IS A CRITICAL FEATURE.

Create immutable portfolio snapshots that capture a user's exact portfolio state at specific points in time.

A snapshot should store aggregate metrics such as:

- snapshot date/time
- total market value
- total cost basis
- total unrealized gain
- cash value
- investment value
- total net worth where appropriate
- source
- created_at

---

# SNAPSHOT POSITIONS

Each portfolio snapshot must contain the exact holdings that existed at that moment.

Store approximately:

- snapshot_id
- symbol
- security_name
- asset_type
- quantity
- average_cost
- market_price_at_snapshot
- market_price_timestamp
- market_value
- cost_basis
- unrealized_gain
- unrealized_gain_percent
- portfolio_weight

This is essential.

DO NOT try to reconstruct historical personal holdings using only today's holdings and historical market prices.

Historical portfolio composition must be preserved explicitly.

---

# SNAPSHOT IMMUTABILITY

Once created, historical snapshots should not silently change when current holdings change.

If a historical snapshot must be corrected, use an explicit correction workflow rather than transparently rewriting history.

Document explicitly whether stored historical snapshots are split-adjusted or as-of-date raw.

Pick one and be consistent.

---

# WHEN SNAPSHOTS SHOULD BE CREATED

Consider snapshot generation:

1. After meaningful portfolio changes.
2. After successful daily price refreshes.
3. Through an optional scheduled daily snapshot.
4. When the user manually requests “Save Snapshot.”
5. During historical backfill.

Avoid creating duplicate meaningless snapshots every few seconds.

---

# HISTORICAL EXACTNESS

Distinguish clearly between:

Exact stored portfolio state.

Estimated/interpolated chart value.

Historical market price.

Never represent an interpolated personal holding quantity as an exact recorded value.

---

# FINANCIAL PRECISION

Never casually use binary floating point for persisted financial values.

Use appropriate NUMERIC precision in PostgreSQL.

In frontend calculations, use disciplined numeric handling.

Format currency only at presentation boundaries.

Do not store:

`"$1,234.56"`

Store:

`1234.56`

and format in the UI.

---

# CURRENCY

If multi-currency is in the data model, define the FX policy now: where rates come from, whether historical snapshots store the rate used, and what currency aggregate values are denominated in.

If V1 is USD-only, state that explicitly and enforce it with a check constraint rather than leaving it ambiguous.

---

# TIME HANDLING

Store timestamps in UTC.

Render according to user timezone.

Market timestamps should retain source timestamps.

Historical snapshots require explicit timestamps/dates.

Avoid timezone-dependent date bugs.

---

# DATE SEMANTICS

Define "as of date" as a market close date in a named exchange timezone, not the user's local calendar date.

Snapshots must record which definition they used.

---

# ATOMIC WRITES

Multi-table financial writes must occur in a single database transaction, exposed as one RPC.

Example:

`edit_position(position_id, new_quantity, new_avg_cost, reason)`

should, inside one transaction:

1. Verify ownership via `auth.uid()`.
2. Read the current row with appropriate locking.
3. Update the position.
4. Insert the immutable `position_events` row.

Two sequential calls from the browser are not atomic and must not be used for this.

Give write RPCs an idempotency key or client-supplied request ID so a retry after a network timeout does not double-record an event.

---

# EDIT INVESTMENT WRITE BEHAVIOR

Saving should atomically:

1. Update the current position.
2. Insert an immutable position event.
3. Trigger/recommend appropriate snapshot behavior.

Do not update one without the other.

---

# DATABASE MIGRATIONS

All database schema changes must live in version-controlled migrations.

Do not manually create production tables without capturing the schema in migrations.

Keep migrations deterministic.

---

# PERFORMANCE

Avoid unnecessary re-renders.

Lazy-load larger routes where useful.

Do not load every historical snapshot when only recent history is required.

Paginate or window long activity timelines.

Index database fields used frequently.

Potential indexes include:

- user_id
- portfolio_id
- snapshot_date
- symbol
- created_at

Use composite indexes where query patterns justify them.

---

# TIMELINE SCRUBBER DATA BEHAVIOR

Dragging through time should update the summary at useful intervals.

Do not make a database request for every pixel of movement.

Prefetch or debounce appropriately.

---

# AUDITABILITY

For meaningful manual financial changes, preserve enough information to understand:

What changed?

When?

From what?

To what?

By whom?

This does not need to become enterprise-level audit software, but history should not mysteriously mutate.

Free-tier log retention is short.

Do not treat platform logs as an audit trail.

Application-level audit events (the immutable `position_events` table) are the durable record.

Design accordingly.

---

# DELETION BEHAVIOR

Do not destroy historical truth when a current investment disappears.

If a user closes/removes a position:

Mark current position appropriately.

Historical snapshots remain intact.

Historical events remain intact.

---

# ACCOUNT DELETION

Provide account deletion that removes or irreversibly anonymizes all user-owned rows, including snapshots and events.

Document the deletion behavior.

---

# EXPORT AND FREE-TIER RECOVERY

Implement JSON export earlier rather than later.

It is also your disaster recovery story on infrastructure without automated backups.

There are no automated database backups on the free plan.

Implement JSON export early and run it on a schedule.

This is a stated, accepted risk, not an oversight.

---

# FREE-TIER AVAILABILITY

Free Supabase projects pause after a period of inactivity.

Add a lightweight scheduled request to keep the project warm, or document the cold-start behavior as accepted.

---

# AI DATA FLOW

Financial mathematics should be deterministic.

Correct architecture:

Database + calculation engine → trusted numbers

AI → explanation of those numbers

Future AI should receive only authorized structured user data.

---

# FUTURE PUBLIC SHARING ARCHITECTURE

Public share identifiers must not be guessable sequential IDs.

Use secure random tokens.

Sharing links should be revocable.

This is NOT the same as authentication.