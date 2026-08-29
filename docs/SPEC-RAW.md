# MASTER BUILD PROMPT — PERSONAL WEALTH INTELLIGENCE PLATFORM

## ROLE

Act as a senior full-stack software engineer, product designer, security engineer, database architect, QA engineer, and technical lead.

You are helping build a real production-quality personal finance application.

Do not treat this as a throwaway tutorial, hackathon project, landing page, or simple CRUD demo.

The application will contain real personal financial information and will eventually be publicly accessible on the internet, although access to private financial data will require authentication.

Security, data isolation, maintainability, testing, accessibility, responsive design, and code quality are first-class requirements.

Do not introduce unnecessary engineering complexity simply to appear sophisticated.

The architecture should be appropriate for approximately 1–10 initial users while still being designed cleanly enough to scale later.

---

# PROJECT CODENAME

Use:

**Wealth Intelligence**

as a working product name.

Do not tightly couple the codebase to this name because branding may change later.

Store branding information in a central configuration/constants location.

---

# PRODUCT VISION

Build a secure personal wealth intelligence platform that answers four fundamental questions:

### Past

How has my financial position changed?

### Present

Where is my money today?

### Future

Where am I heading?

### Decisions

How will decisions I make today affect my financial future?

This should NOT feel like another generic investment tracker.

The product should combine:

- portfolio tracking
- net-worth tracking
- historical wealth analysis
- investment analytics
- financial goal tracking
- future wealth modeling
- scenario comparison
- long-term decision modeling

The ultimate long-term vision is a personal **financial digital twin**.

---

# PRODUCT PHILOSOPHY

Most financial dashboards answer:

> “What is my portfolio worth today?”

This application should eventually answer:

> “What exactly did my portfolio look like six months ago?”

> “Why did my wealth increase?”

> “How much came from contributions versus investment returns?”

> “How quickly is my wealth currently growing?”

> “When am I projected to reach $500K or $1M?”

> “How has that projected date changed over time?”

> “What happens if I invest another $500 per month?”

> “What would purchasing an expensive car cost my future net worth?”

> “What are my true underlying exposures through ETFs?”

> “At what point will investment growth exceed my annual contributions?”

---

# ABSOLUTE COST REQUIREMENT

The first production version should be designed to operate for approximately:

# $0/month

Do not introduce paid infrastructure when a reliable free alternative satisfies the requirements.

If any proposed feature genuinely cannot be implemented safely or legally without a paid service, DO NOT silently add that service.

Instead:

1. Explain the limitation.
2. Identify the free alternative.
3. Explain what functionality would be lost.
4. Isolate the paid-dependent functionality behind an abstraction or feature flag.
5. Continue building everything that can remain free.

No paid APIs should be required for V1.

---

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

# SECURITY PHILOSOPHY

This application contains financial information.

Treat all user-specific data as private by default.

Security cannot depend solely on frontend logic.

Frontend UI restrictions are NOT authorization controls.

Authorization must be enforced at the database/backend level.

---

# SECURITY REQUIREMENTS

Implement the following principles.

### Authentication

Use Supabase Auth.

Do not implement custom password storage.

Support email/password authentication initially.

Require secure passwords.

Use email verification where practical.

Design authentication so additional providers can be introduced later.

---

# USER DATA ISOLATION

Every private user-owned record must contain or inherit ownership from a user ID.

Every relevant Supabase table must have Row Level Security enabled.

Policies must prevent:

User A from reading User B's information.

User A from updating User B's information.

User A from deleting User B's information.

User A from creating records on behalf of User B.

Never trust a user_id provided by the browser.

Use authenticated user identity from the JWT/database context.

---

# DATABASE PRIVILEGES

Follow least privilege.

Do not assume RLS alone is enough.

Configure grants appropriately for:

- anon
- authenticated
- service/backend access

Only allow anonymous access to explicitly public resources.

---

# SECRET MANAGEMENT

Never put secrets in:

- React code
- repository files
- public environment variables
- VITE_* environment variables
- committed configuration files

The following must remain server-side:

- market-data secret keys
- Supabase secret/service credentials
- future AI API keys
- privileged tokens

The Supabase publishable key may be used in the browser as designed, but security must rely on correctly configured RLS.

Include:

`.env.example`

but never commit actual `.env` files.

---

# INPUT SECURITY

Validate all client-provided values.

Use Zod or equivalent validation.

Validate:

- ticker symbols
- numeric values
- shares
- prices
- dates
- goals
- contribution values
- scenario assumptions
- user-generated names

Reject:

- negative share quantities where inappropriate
- NaN
- Infinity
- impossible dates
- malformed UUIDs
- unexpected enum values
- oversized strings

---

# MARKET DATA SECURITY

Market API requests must NOT expose provider credentials to the browser.

Create server-side API endpoints / Edge Functions for market-data access.

Enforce:

- authenticated requests where required
- request validation
- maximum symbol counts
- server-side caching
- sensible refresh limits
- provider rate-limit awareness

---

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

# USER MODEL

Initial target:

1–10 trusted users.

The app itself should be publicly reachable.

Private financial functionality requires authentication.

Initial registration should preferably be invite-only or access-controlled.

Do not assume completely open anonymous registration.

Provide architecture for:

- approved emails
or
- invitation codes

An administrator should eventually be able to invite someone.

---

# PUBLIC EXPERIENCE

A signed-out visitor should see a beautiful public landing page.

Navigation could include:

- Product
- Demo
- Security / Privacy
- Sign In

Primary CTA:

**Explore Demo**

Secondary CTA:

**Sign In**

Do not expose real user information.

---

# DEMO MODE

Create a completely fictional portfolio.

Example demo persona:

“Demo Investor”

Use realistic but fictional values.

The demo should showcase:

- dashboard
- portfolio
- historical timeline
- goals
- projections
- allocation
- Portfolio Time Machine

The demo should require no authentication.

Demo data should be clearly labeled:

**Demo Data**

Do not use the real database records of any user.

Prefer bundled deterministic demo data where practical.

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

# SIMPLE POSITION EDITING

The user experience must remain extremely simple.

A user should be able to choose:

**Edit Position**

and see:

Ticker

Shares

Average Cost

The user changes shares and saves.

They should NOT have to understand the internal historical system.

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

The simple UI can default to:

`manual_adjustment`

while allowing the user to optionally select a more specific reason.

Do not delete historical events when a current position is changed.

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

# PORTFOLIO TIME MACHINE

THIS SHOULD BECOME ONE OF THE SIGNATURE FEATURES.

Create a dedicated experience called:

# Portfolio Time Machine

The user should be able to select a historical date.

Then display exactly what their portfolio looked like at that time.

Example:

**As of February 26, 2026**

Total Investments

$128,430

Cash

$14,200

Net Worth

$151,840

Holdings:

QQQ  
32 shares  
$X value  
28.3%

VOO  
8 shares  
$X value  
14.2%

etc.

---

# TIME MACHINE INTERACTION

Provide:

- timeline
- calendar/date picker
- range selection
- historical chart

Allow timeframes:

- 1M
- 3M
- 6M
- 1Y
- YTD
- ALL

Clicking or selecting a stored point should update the historical portfolio state.

---

# HISTORICAL CHART TOOLTIPS

Hovering a chart point should show useful information.

Example:

February 26, 2026

Portfolio: $128,430  
Net Worth: $151,840  
QQQ: 32 shares  
VOO: 8 shares  
Cash: $14,200

Include a button:

**View Snapshot**

---

# THEN VS NOW

Create a portfolio comparison mode.

User chooses:

Date A

and

Date B

Then show:

Total value difference.

Net-worth difference.

Holding-level changes.

Example:

QQQ

32 shares → 41 shares  
+9 shares

VOO

8 → 14  
+6

NVDA

15 → 10  
-5

Cash

$14,200 → $11,800

Highlight:

Added positions.

Removed positions.

Increased positions.

Reduced positions.

Allocation changes.

---

# HISTORICAL BACKFILL

Users should be able to add portfolio history that predates application usage.

Create:

**Add Historical Snapshot**

User chooses an as-of date.

Then enters:

- holdings
- share quantities
- average cost if known
- cash
- other assets

Where permitted and available, retrieve historical closing prices.

If unavailable, allow the user to enter an approximate or known historical price.

Clearly label manually supplied values.

This allows users to begin their wealth timeline before the application's creation date.

---

# FUTURE CSV IMPORT

Do not build complex brokerage integration in V1.

However, design historical-import code so CSV support can later be introduced.

Potential future workflow:

Upload brokerage statement CSV.

Map columns.

Preview.

Validate.

Import.

Do not make this a V1 blocker.

---

# MANUAL ASSETS

Users must be able to track assets other than securities.

Examples:

- cash
- savings
- real estate equity
- vehicle
- business equity
- collectibles
- other

Fields might include:

- name
- category
- current_value
- notes
- updated_at

---

# LIABILITIES

Support liabilities.

Examples:

- mortgage
- vehicle loan
- student loan
- credit balance
- personal loan

Net Worth:

Assets - Liabilities.

---

# MAIN DASHBOARD

The home dashboard should immediately communicate the user's financial situation.

Top-level cards:

## Net Worth

Large primary number.

Include:

- absolute change
- percentage change
- selected timeframe

## Investments

Total investment value.

## Monthly Change

Net-worth change during selected period.

## Next Milestone

Closest major financial goal.

---

# DASHBOARD HISTORY CHART

Make the primary chart visually important.

Display:

Net worth over time.

Support:

- 1M
- 3M
- 6M
- 1Y
- YTD
- ALL

Allow historical points to link into Portfolio Time Machine.

---

# WHAT CHANGED

Create a dashboard module:

# What Changed?

Example:

Since your last visit:

Net worth +$1,482

Investment portfolio +$1,120

New contributions +$500

QQQ +1.7%

Your projected $500K date moved 1 month closer.

This can initially be deterministic.

Do NOT require AI.

---

# PORTFOLIO PAGE

Create a clear investments dashboard.

Top metrics:

- market value
- cost basis
- total gain/loss
- daily change

Holdings table:

- symbol
- company/fund
- shares
- price
- market value
- average cost
- total return
- allocation

Provide:

- Add Position
- Edit Position
- Delete/Close Position
- Refresh Prices

Closing a position should preserve historical information.

---

# PORTFOLIO ALLOCATION

Visualize allocation.

Initially:

- by holding
- by account
- by asset class

Later:

- sector
- geography
- underlying ETF exposure

Use donut/pie charts sparingly.

Do not fill the interface with unnecessary pie charts.

---

# PORTFOLIO X-RAY — FUTURE

Design for a future feature that analyzes ETF overlap.

Example:

User owns:

VOO

QQQ

AAPL

The application estimates true underlying exposure.

Example:

Apple — 11.4%

Microsoft — 10.2%

NVIDIA — 8.1%

This is a future feature, not necessarily V1.

---

# WEALTH GOALS

Users should create financial goals.

Examples:

$250K invested

$500K net worth

$1M net worth

$2M net worth

Financial Independence

Fields:

- name
- target amount
- goal type
- target date optional
- created_at

Display:

Current amount.

Target.

Progress percentage.

Remaining amount.

Estimated achievement date where projection data exists.

---

# MILESTONE SYSTEM

Support meaningful milestones.

Examples:

$10K

$25K

$50K

$100K

$250K

$500K

$1M

$2M

Allow custom milestones.

Display achieved date.

Do not turn this into casino-style gamification.

The tone should be motivational and calm.

---

# FUTURE WEALTH VISUALIZER

Build a future wealth modeling page.

Inputs:

- starting investments
- monthly contribution
- annual expected return
- years
- salary optional
- salary growth optional
- inflation optional
- desired retirement age

Outputs:

- projected future values
- milestone dates
- chart
- annual table

---

# FUTURE WEALTH CHART

Show a clean long-term curve.

Example points:

Age 25

Age 30

Age 35

Age 40

Age 45

Age 50

Allow toggle:

Nominal dollars

Inflation-adjusted dollars

Clearly display assumptions.

Never imply projections are guaranteed.

---

# PROJECTION LANGUAGE

Use wording like:

“Projected”

“Based on these assumptions”

“Estimated”

Never:

“Guaranteed”

“You will have”

---

# SCENARIO LAB — FUTURE

Design so users can eventually save multiple future scenarios.

Examples:

Current Path

Aggressive Investing

Higher Salary

Real Estate

Early Retirement

Coast FIRE

Store assumptions independently.

Allow side-by-side comparison.

---

# WEALTH VELOCITY — SIGNATURE FEATURE

Create a future metric:

# Wealth Velocity

Measure how quickly net worth has recently been changing.

Possible displays:

Last 3 months

+$4,800/month

Last 12 months

+$3,900/month

Break down into components when sufficient data exists.

---

# WEALTH GROWTH ATTRIBUTION — SIGNATURE FEATURE

Eventually determine why wealth changed.

Example:

New contributions  
+$12,000

Investment appreciation  
+$7,830

Dividends  
+$1,120

Debt reduction  
+$3,400

Withdrawals  
-$4,000

Net wealth change  
+$20,350

Design the schema to make this future analysis possible.

---

# CONTRIBUTION VS COMPOUNDING CROSSOVER

Future feature.

Calculate the approximate point where projected annual investment growth becomes greater than annual user contributions.

Example:

“At your current assumptions, investment growth may exceed your annual contributions around age 31.”

---

# PROJECTION DRIFT — SIGNATURE FEATURE

Historical projections should eventually be stored.

Example:

January projected $1M date:

June 2038

August projected $1M date:

November 2037

Display:

“Your projected $1M date has moved approximately 7 months earlier.”

This requires storing past projection outputs rather than overwriting them.

Plan for this in the schema.

---

# DECISION SIMULATOR — FUTURE SIGNATURE FEATURE

Allow users to model financial decisions.

Examples:

Vehicle purchase.

Home down payment.

Higher rent.

Career raise.

Extra monthly investment.

Large vacation.

Calculate:

Immediate cash impact.

Monthly cash-flow impact.

Investment opportunity cost.

Long-term projected impact.

Effect on milestone dates.

Do not tell users what they “should” purchase.

Show mathematical tradeoffs.

---

# WHAT DOES THIS COST FUTURE ME?

A simplified future calculator.

Example:

Purchase:

$5,000

Potential invested value after:

10 years

20 years

30 years

based on configurable return assumptions.

---

# FIRE FEATURES — FUTURE

Support:

Financial Independence number.

Traditional FIRE.

Coast FIRE.

Inputs:

Desired annual spending.

Withdrawal assumption.

Current investments.

Retirement age.

Expected return.

Display progress and estimated dates.

---

# AI PRINCIPLE

DO NOT make AI necessary for V1.

Financial mathematics should be deterministic.

AI must never invent portfolio numbers.

Future AI functionality should explain structured analytics produced by our system.

Correct architecture:

Database + calculation engine → trusted numbers

AI → explanation of those numbers

NOT:

AI → financial calculations from imagination.

---

# FUTURE ASK MY WEALTH

Possible future AI interface:

“Why did my net worth increase this month?”

“What changed in my portfolio?”

“How much faster would I reach $1M with another $500/month?”

“Which positions overlap most?”

“Compare my scenarios.”

AI should receive only authorized structured user data.

---

# PUBLIC SHARING — FUTURE

Design for secure public sharing.

Users may eventually generate read-only sharing links.

Users should explicitly select what is visible.

Examples:

Show:

- percentage growth
- goals
- allocation

Hide:

- exact net worth
- exact cash
- share quantities
- cost basis

Public share identifiers must not be guessable sequential IDs.

Use secure random tokens.

Sharing links should be revocable.

This is NOT the same as authentication.

---

# PRIVACY MODE

Create a user-facing privacy mode.

Button:

**Hide Values**

When active, financial amounts are visually obscured.

Example:

$187,420

becomes:

••••••

Charts may continue displaying trends where appropriate.

---

# DESIGN DIRECTION

This application should look:

- modern
- premium
- calm
- simple
- clean
- sophisticated
- trustworthy

It should NOT look:

- overly corporate
- like a bank website from 2015
- like a crypto casino
- like Robinhood
- like Bloomberg Terminal
- overly futuristic
- cluttered
- AI-generated
- full of gradients everywhere

Think:

high-end modern financial software with excellent spacing and restrained visual design.

---

# COLOR SYSTEM

Primary visual identity:

# Lavender Purple + White

Use a restrained palette.

Suggested tokens:

Background:

`#FCFBFF`

Primary surface:

`#FFFFFF`

Secondary lavender surface:

`#F7F3FF`

Soft lavender:

`#EDE9FE`

Primary purple:

`#7C3AED`

Primary hover:

`#6D28D9`

Medium lavender:

`#A78BFA`

Light accent:

`#C4B5FD`

Primary text:

approximately `#211A2C`

Secondary text:

approximately `#6C6578`

Border:

approximately `#EAE4F2`

Positive:

restrained emerald/green

Negative:

restrained red

Warning:

restrained amber

Maintain accessible contrast.

---

# GRADIENTS

Gradients are allowed but should be uncommon.

Good places:

- primary Net Worth card
- landing-page hero detail
- subtle chart fill
- selected milestone

Do NOT put gradients on every card/button.

Potential primary gradient:

deep lavender → medium lavender → very soft purple.

Keep it tasteful.

---

# CARDS

Cards should have:

- generous padding
- subtle border
- modest corner radius
- extremely light shadow where useful
- clear hierarchy

Avoid extreme floating/glowing glass cards.

---

# TYPOGRAPHY

Use a clean modern sans-serif.

Candidates:

- Geist
- Inter

Prioritize legibility for financial numbers.

Use tabular numerals where possible so changing financial values remain visually aligned.

Large financial figures should feel confident but not oversized.

---

# SPACING

Use generous whitespace.

Do not crowd charts against card edges.

Use consistent spacing tokens.

Financial dashboards become difficult to understand when everything is dense.

---

# ANIMATION

Use restrained micro-interactions.

Examples:

- smooth chart transitions
- subtle card hover
- number transition where appropriate
- loading skeletons
- drawer transitions
- dropdown transitions

Animations should generally be around 150–250ms.

Do not use flashy bouncing effects.

Respect `prefers-reduced-motion`.

---

# CHART STYLE

Charts should be visually clean.

Use:

- lavender/purple primary line
- subtle gradient area fill
- lightweight grid lines
- high-quality tooltips
- responsive sizing

Avoid unnecessary chart borders.

Tooltips should contain meaningful financial context.

---

# DESKTOP NAVIGATION

Use a clean left sidebar.

Potential items:

Home

Portfolio

History

Goals

Future

Insights

Activity

Settings

Do not add pages that have no useful content.

---

# MOBILE NAVIGATION

The application must work extremely well on a phone.

Use a simplified bottom navigation or responsive compact navigation.

Prioritize:

Home

Portfolio

History

Future

More

Tables should become mobile cards where appropriate.

Do not simply shrink desktop tables until they become unreadable.

---

# DASHBOARD DESIGN

Potential desktop structure:

TOP:

Greeting / page title

Date / refresh state

Privacy toggle

Profile menu

ROW 1:

Net Worth — primary card

Investments

Monthly Change

Next Milestone

ROW 2:

Large Net-Worth History Chart

ROW 3:

Portfolio Allocation

Goal Progress

ROW 4:

What Changed?

Portfolio Summary

ROW 5:

Future Projection preview

Recent Milestones

Maintain hierarchy.

The dashboard should not feel like 20 equally important boxes.

---

# PORTFOLIO PAGE DESIGN

Top section:

Portfolio value

Total return

Daily change

Refresh time

Primary action:

Add Investment

Secondary:

Refresh Prices

Below:

Holdings table/cards.

Provide filtering by account.

Clicking a holding opens a detailed drawer/page.

---

# ADD INVESTMENT FLOW

Make this extremely easy.

User clicks:

**Add Investment**

Step 1:

Search ticker.

Step 2:

Enter:

Shares

Average cost

Account

Optional acquisition date

Step 3:

Preview.

Step 4:

Save.

Do not require unnecessary fields.

---

# EDIT INVESTMENT FLOW

Click holding → Edit.

Shares should be editable immediately.

Example:

Current:

38.71

New:

42.71

Optional reason:

Bought shares

Sold shares

Correction

Transfer

Other

Saving should atomically:

1. Update the current position.
2. Insert an immutable position event.
3. Trigger/recommend appropriate snapshot behavior.

Do not update one without the other.

---

# HISTORY PAGE

Make this a special page, not simply another line chart.

Header:

# Wealth History

Subnavigation / modes:

Net Worth

Portfolio

Time Machine

Comparison

---

# PORTFOLIO TIME MACHINE DESIGN

Large timeline at top.

Date control:

`< February 26, 2026 >`

Main historical total.

Then:

Historical Holdings

Allocation

Cash/assets

Historical goals if available

Provide:

**Compare to Today**

One click.

---

# TIMELINE SCRUBBER

Consider an interactive timeline scrubber.

Dragging through time should update the summary at useful intervals.

Do not make a database request for every pixel of movement.

Prefetch or debounce appropriately.

---

# HISTORICAL EXACTNESS

Distinguish clearly between:

Exact stored portfolio state.

Estimated/interpolated chart value.

Historical market price.

Never represent an interpolated personal holding quantity as an exact recorded value.

---

# ERROR STATES

Every API-dependent component needs:

Loading state.

Empty state.

Error state.

Stale-data state.

Example:

“Latest market price unavailable. Showing last known value from Aug 25 at 3:58 PM.”

Much better than:

“Something went wrong.”

---

# EMPTY STATES

New accounts should look intentional.

Example:

“Your wealth timeline starts here.”

CTA:

Add your first investment.

Another:

Add historical snapshot.

Do not show broken empty charts.

---

# ACCESSIBILITY

Use semantic HTML.

Keyboard navigation.

Visible focus states.

ARIA labels where appropriate.

Accessible chart alternatives where possible.

Do not rely solely on color to convey gain/loss.

Meet reasonable WCAG contrast.

---

# DATABASE MIGRATIONS

All database schema changes must live in version-controlled migrations.

Do not manually create production tables without capturing the schema in migrations.

Keep migrations deterministic.

---

# TESTING REQUIREMENTS

Write tests for critical financial calculations.

Examples:

market value

cost basis

gain/loss

allocation

net worth

future value

goal progress

percentage change

Test edge cases:

zero cost basis

zero portfolio value

fractional shares

negative liabilities

missing quote

stale quote

API failure

---

# SECURITY TESTS

Test RLS.

Explicitly prove:

User A can access User A data.

User A cannot access User B data.

Anonymous users cannot access private portfolios.

A user cannot insert another user's user_id.

A user cannot update another user's snapshot.

Public demo data cannot access private data.

These are critical.

---

# E2E TESTS

At minimum eventually test:

Create account / login.

Create portfolio.

Add position.

Edit shares.

Reload application.

Confirm persistence.

Create historical snapshot.

View Time Machine.

Log out.

Confirm private route protection.

Log into another test user.

Confirm original user's portfolio is inaccessible.

---

# GITHUB SECURITY

Configure:

CodeQL.

Dependabot.

Secret scanning compatibility.

`.gitignore`

Security-conscious `.env.example`.

No credentials in commit history.

Use GitHub Actions where useful.

---

# README

Create a high-quality README.

Include:

Project overview.

Screenshots eventually.

Architecture.

Technology stack.

Setup.

Environment variables.

Security architecture.

Market-data architecture.

Historical portfolio architecture.

Testing.

Deployment.

Roadmap.

AI usage statement.

---

# AI DEVELOPMENT TRANSPARENCY

The project may be developed with AI assistance.

Do not hide this.

README can eventually explain that AI coding tools were used as engineering accelerators while architecture, testing, validation, security review, and product decisions remained deliberate engineering work.

This helps demonstrate responsible AI-assisted software development.

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

# TIME HANDLING

Store timestamps in UTC.

Render according to user timezone.

Market timestamps should retain source timestamps.

Historical snapshots require explicit timestamps/dates.

Avoid timezone-dependent date bugs.

---

# AUDITABILITY

For meaningful manual financial changes, preserve enough information to understand:

What changed?

When?

From what?

To what?

By whom?

This does not need to become enterprise-level audit software, but history should not mysteriously mutate.

---

# DELETION BEHAVIOR

Do not destroy historical truth when a current investment disappears.

If a user closes/removes a position:

Mark current position appropriately.

Historical snapshots remain intact.

Historical events remain intact.

---

# BACKUP / EXPORT

Eventually support:

Export My Data.

At minimum plan for export to:

JSON

CSV

This is important because users should not feel trapped in the application.

Not required for first implementation unless easy.

---

# V1 SCOPE

The first fully usable version should contain:

1. Public landing page.
2. Public fictional demo.
3. Authentication.
4. User profile.
5. Protected routes.
6. Portfolio creation.
7. Account creation.
8. Add/edit/remove investment positions.
9. Manual share quantities.
10. Average cost.
11. Latest market price integration.
12. Server-side market API protection.
13. Quote caching.
14. Investment value calculations.
15. Gain/loss.
16. Allocation.
17. Manual cash/other assets.
18. Liabilities.
19. Net worth.
20. Daily/historical snapshots.
21. Snapshot positions.
22. Net-worth chart.
23. Portfolio Time Machine.
24. Then-vs-Now comparison.
25. Historical snapshot backfill.
26. Basic goals.
27. Basic Future Wealth calculator.
28. Privacy mode.
29. Responsive desktop/mobile design.
30. RLS.
31. Security tests.
32. Core unit tests.
33. Public GitHub documentation.
34. Cloudflare deployment.

---

# NOT V1

Do NOT allow these to derail the initial build:

- Plaid
- brokerage OAuth
- bank integrations
- real-money trading
- tax filing
- automated financial advice
- complex budgeting
- crypto wallet connections
- advanced AI
- Monte Carlo simulation
- complete ETF X-Ray
- public portfolio sharing
- real estate APIs
- native mobile applications
- Kubernetes
- microservices
- Redis
- Kafka

These are later possibilities.

---

# V2

After V1 is stable:

Wealth Velocity.

Wealth Attribution.

Projection Drift.

Compounding Crossover.

Advanced goals.

Scenario Lab.

FIRE.

Coast FIRE.

Decision Simulator.

ETF overlap.

Portfolio X-Ray.

Investment thesis journal.

Activity timeline.

More advanced sharing.

---

# V3

Potential future features:

AI Wealth Review.

Ask My Wealth.

Monte Carlo simulation.

Household accounts.

Partner sharing.

Brokerage integration.

Real estate modeling.

Income forecasting.

Financial digital twin.

---

# ENGINEERING PRINCIPLE

Use:

# Simple UI + Sophisticated Internals

The user experience should make something like changing shares extremely easy.

Behind the scenes:

- maintain history
- enforce authorization
- preserve audit events
- calculate correctly
- snapshot data
- validate inputs

Do not expose engineering complexity to the user.

---

# UX PRINCIPLE

Every page should answer:

“What is the most important thing the user needs to understand or do here?”

Avoid dashboards filled with metrics merely because they can be calculated.

Prioritize meaningful information.

---

# DESIGN PRINCIPLE

Use the lavender identity consistently, but allow financial information to remain readable.

White should actually be the dominant visual surface.

Lavender should provide personality.

Purple should provide hierarchy.

Green/red should communicate financial movement.

Neutral colors should handle everything else.

---

# PRODUCT PERSONALITY

The application should feel:

Calm.

Ambitious.

Optimistic.

Analytical.

Private.

Trustworthy.

Modern.

It should feel like a tool designed for someone who enjoys watching long-term financial progress rather than short-term trading.

---

# ACCEPTANCE CRITERIA FOR V1

A new user should be able to:

Open the public URL.

Explore a fictional demo.

Create/sign into an authorized account.

Create a portfolio.

Add QQQ.

Enter 20.5 shares.

Enter average cost.

Have the application retrieve a current/latest supported market price.

See the calculated market value.

Add VOO.

See portfolio allocation.

Edit QQQ from 20.5 shares to 24.5.

Have that change preserved historically.

Return later.

See the updated portfolio.

Open History.

Select a prior stored date.

See that QQQ previously had 20.5 shares.

Compare that historical state with today.

Create a historical portfolio snapshot from before account creation.

See net worth history.

Create a $1M goal.

Run a future projection.

Log out.

Log in as another user.

Be completely unable to retrieve the first user's financial records.

---

# BEFORE WRITING SIGNIFICANT CODE

First inspect the repository.

If the repository is empty:

Produce an implementation plan containing:

1. proposed folder structure
2. architecture
3. database tables
4. RLS strategy
5. authentication flow
6. market-data architecture
7. snapshot architecture
8. design system
9. testing strategy
10. deployment strategy
11. implementation phases

Identify any security issue or technical assumption before implementation.

Do not create hundreds of files blindly.

---

# IMPLEMENTATION ORDER

Prefer approximately:

PHASE 1

Project scaffold.

Design tokens.

Routing.

Landing page shell.

Authentication shell.

Supabase configuration.

PHASE 2

Database migrations.

Profiles.

Portfolios.

Accounts.

Positions.

RLS.

RLS tests.

PHASE 3

Portfolio UI.

Add/edit holdings.

Calculation utilities.

PHASE 4

Market provider abstraction.

Server-side quotes.

Caching.

Stale/error handling.

PHASE 5

Assets.

Liabilities.

Net worth.

Dashboard.

PHASE 6

Position events.

Snapshots.

Snapshot positions.

Historical backfill.

PHASE 7

Portfolio Time Machine.

Historical comparison.

PHASE 8

Goals.

Basic wealth projections.

PHASE 9

Public demo.

Privacy mode.

Responsive polish.

PHASE 10

Security review.

Tests.

Performance.

Accessibility.

README.

Deployment.

---

# WHEN MAKING IMPLEMENTATION DECISIONS

Favor:

clear

testable

maintainable

secure

simple

documented

over:

clever

abstract

complicated

over-engineered.

---

# IMPORTANT FINAL INSTRUCTION

Do not merely create a visually attractive dashboard filled with hard-coded numbers.

This must become a real application.

Data must persist.

Users must be isolated.

Calculations must be tested.

History must be genuine.

Snapshots must preserve actual historical portfolio composition.

Market API keys must remain private.

The public demo must never expose private financial information.

The frontend must be polished enough to show recruiters.

The codebase must be clean enough to discuss in a software, cybersecurity, IT, cloud, or AI interview.

The Portfolio Time Machine should be treated as one of the flagship pieces of the product.

The finished application should demonstrate that AI-assisted development can still result in deliberate architecture, strong security, high-quality code, meaningful testing, and thoughtful product design.


# ADDENDUM  A — HARDENING AND CORRECTNESS ## SIGNUP ENFORCEMENT Invite-only must be enforced server-side, not in the UI. Implement one of: - An `allowed_signups` table plus a database trigger or Supabase Auth hook that rejects account creation for non-listed emails. - Disable public signup in Supabase Auth settings and provision users by admin invite only. Frontend route guards are UX, not access control. Enable leaked-password protection in Supabase Auth. Enforce minimum password length and complexity server-side. Design so MFA (TOTP) can be added later without schema changes. ## DATABASE FUNCTION SECURITY Default all Postgres functions to `SECURITY INVOKER`. Any function that genuinely requires `SECURITY DEFINER` must: - Pin `SET search_path = ''` and fully schema-qualify every reference. - Be documented with a comment explaining why elevation is required. - Validate that the caller owns the affected rows using `auth.uid()`. Never accept `user_id` as a function parameter for authorization. Derive identity from `auth.uid()` inside the function. Explicitly `REVOKE ALL ON ALL FUNCTIONS FROM PUBLIC, anon` and grant back only what is needed. Enabling RLS does not restrict function execution. Do the same for views. Views can leak past RLS if defined carelessly. ## ATOMIC WRITES Multi-table financial writes must occur in a single database transaction, exposed as one RPC. Example: `edit_position(position_id, new_quantity, new_avg_cost, reason)` should, inside one transaction: 1. Verify ownership via `auth.uid()`. 2. Read the current row with appropriate locking. 3. Update the position. 4. Insert the immutable `position_events` row. Two sequential calls from the browser are not atomic and must not be used for this. Give write RPCs an idempotency key or client-supplied request ID so a retry after a network timeout does not double-record an event. ## EDGE FUNCTION SECURITY Every Edge Function that touches user data must: - Verify the JWT and derive identity from it. - Reject any user identifier supplied in the request body. - Validate and bound all input (max symbols per request, max string length, allowed enum values). - Use an explicit CORS allowlist. Never `Access-Control-Allow-Origin: *` on authenticated endpoints. - Enforce a per-user rate limit backed by the database. - Return generic error messages to the client. Never return provider errors, stack traces, or internal identifiers. ## HTTP SECURITY HEADERS Ship a Cloudflare Pages `_headers` file configuring at minimum: - Content-Security-Policy (no `unsafe-inline` in production if achievable; explicitly allowlist the Supabase origin) - Strict-Transport-Security - X-Content-Type-Options: nosniff - Referrer-Policy: strict-origin-when-cross-origin - X-Frame-Options: DENY (or CSP frame-ancestors 'none') - Permissions-Policy disabling unused features Document these in the security README section. ## LOGGING AND ERROR HANDLING Never log balances, positions, net worth, quantities, tokens, or email addresses. Log identifiers and event types only. Use React error boundaries. Never surface raw errors to the UI. Do not send financial values to any third-party analytics or error reporting service. ## CORPORATE ACTIONS Plan for stock splits and dividends in the schema even if V1 handles them manually. A split changes quantity and average cost without changing value. It must be recorded as an explicit event type, not as a manual correction, so that historical snapshots and cost basis remain interpretable. Add `split` and `dividend` to the position event type enum in V1 even if the automated detection comes later. Document explicitly whether stored historical snapshots are split-adjusted or as-of-date raw. Pick one and be consistent. ## CURRENCY If multi-currency is in the data model, define the FX policy now: where rates come from, whether historical snapshots store the rate used, and what currency aggregate values are denominated in. If V1 is USD-only, state that explicitly and enforce it with a check constraint rather than leaving it ambiguous. ## DATE SEMANTICS Define "as of date" as a market close date in a named exchange timezone, not the user's local calendar date. Snapshots must record which definition they used. ## ACCOUNT DELETION AND EXPORT Provide account deletion that removes or irreversibly anonymizes all user-owned rows, including snapshots and events. Document the deletion behavior. Implement JSON export earlier rather than later. It is also your disaster recovery story on infrastructure without automated backups. ## CI AND SUPPLY CHAIN - Commit the lockfile. Use `npm ci` in CI. - Pin GitHub Actions to commit SHAs, not floating tags. - Set explicit least-privilege `permissions:` in every workflow. - CI must run typecheck, lint, unit tests, and RLS tests on every PR. - Enable branch protection on main. ## THREAT MODEL DOCUMENT Produce `docs/THREAT-MODEL.md` covering: - Trust boundaries (browser, Supabase Postgres, Edge Functions, market data provider, Cloudflare). - Assets and their sensitivity. - Enumerated threats per boundary using STRIDE or equivalent. - The specific control mitigating each threat. - Explicitly accepted risks and why. - Known limitations of the current design. This document is a deliverable, not optional. Keep it current as features land. 



# ADDENDUM B — APPLICATION SECURITY, MFA, AND WORKING AGREEMENT ## CROSS-SITE SCRIPTING (XSS) React escapes rendered values by default. Do not defeat that. Hard rules: - Never use `dangerouslySetInnerHTML`. If a case seems to require it, stop and raise it rather than implementing it. - Never render user-supplied strings into an `href`, `src`, or `style` attribute without validating the scheme. A value beginning with `javascript:` or `data:` is executable. Allow `https:` and relative paths only. - Never use `eval`, `new Function`, or dynamic `import()` on any string derived from user input or API responses. - Do not inject user-supplied text into SVG or chart tooltips as raw markup. Pass it as a text node. - Treat market-data provider responses as untrusted input. A provider returning an unexpected string is the same risk class as user input. Bound and sanitize user-generated names (portfolio names, account names, goal names, notes) at the Zod layer: maximum length, allowed character set, and trimmed whitespace. Reject rather than strip, so the failure is visible. Ship a Content-Security-Policy that would contain an XSS even if one existed. Target `default-src 'self'`, an explicit `connect-src` allowlist containing only the Supabase project origin, and `frame-ancestors 'none'`. Avoid `unsafe-inline` and `unsafe-eval`. Build the CSP in report-only mode first, verify no legitimate requests are blocked, then enforce. ## SQL INJECTION The Supabase client parameterizes queries. The injection risk in this project is in code we write ourselves, not in the ORM. Rules: - Do not build dynamic SQL by string concatenation inside plpgsql functions. If dynamic SQL is genuinely unavoidable, use `format()` with `%I` for identifiers and `%L` for literals, never `%s`. - Do not interpolate user input into supabase-js raw filter strings such as `.or()`, `.filter()`, or `.textSearch()`. These accept a string expression and are injectable. Use typed builder methods (`.eq()`, `.in()`, `.gte()`) with parameters instead. - Validate every input with Zod before it reaches a query, including values used for ordering, pagination, and column selection. Column and sort names must come from a server-side allowlist, never from a client string. - Never accept a raw SQL fragment from the client under any framing. ## MULTI-FACTOR AUTHENTICATION Implement MFA using Supabase Auth's built-in TOTP support. It is available on the free plan and requires no third-party service. Requirements: - Enrollment flow: generate a factor, display the QR code, verify a code before the factor is marked verified. - Challenge flow on sign-in for any user with a verified factor. - Store no secrets client-side. Supabase manages the factor secret. - Provide recovery: allow enrolling a second factor. Document what happens if a user loses their authenticator. - Allow unenrolling, but require a valid challenge first. Prefer TOTP over emailed one-time codes. Email OTP is weaker (mailbox compromise defeats it, delivery is unreliable, and free-tier email sending is rate-limited) and is not simpler to build. Enforce MFA at the database layer, not only in the UI. Supabase exposes the session's Authentication Assurance Level in the JWT. Write RLS policies on financial tables that require `aal2` for accounts that have a verified factor, so that a session which has not completed a challenge cannot read financial rows even if the frontend is bypassed entirely. MFA is not a V1 blocker but must be delivered before the app holds real financial data for more than one user. Design the auth flow in V1 so adding it later requires no schema change. ## AUTHENTICATION HARDENING - Require verified email before any financial data is accessible. - Enable leaked-password protection in Supabase Auth. - Enable Cloudflare Turnstile on sign-in, sign-up, and password reset. It is free, natively supported by Supabase Auth, and blocks credential-stuffing and automated signup abuse. - Password reset and sign-in responses must be identical whether or not the email exists. No user enumeration. - Rate limit auth endpoints. Use Supabase's built-in limits and do not raise them. - Provide a visible "sign out of all sessions" action. - Set a short JWT expiry and rely on refresh-token rotation. ## SESSION STORAGE The Supabase client stores the session in `localStorage` by default, which is readable by any script running on the page. Make this an explicit decision and document it in the threat model. For V1, `localStorage` is acceptable given a strict CSP, no third-party scripts, and no `dangerouslySetInnerHTML`. Record that as an accepted risk with those three controls named as the mitigation. Do not add third-party analytics, tag managers, chat widgets, or ad scripts to the authenticated application. Any of them silently voids that mitigation. ## ANONYMOUS ACCESS SCOPE The public demo uses bundled deterministic data, not database rows. Therefore the anonymous role requires no table access whatsoever. Explicitly revoke all privileges on all tables, sequences, functions, and views in the application schema from the `anon` role, and grant nothing back. Assert this in a test so a future migration cannot quietly widen it. Do not enable Supabase Realtime unless a feature requires it. If it is enabled, verify that RLS applies to Realtime subscriptions and test it the same way as direct reads. Restrict which schemas are exposed through the Data API to only what the application needs. ## SUPPLY CHAIN AND SECRETS - Run `npm audit --audit-level=high` in CI and fail the build on high or critical findings. - Add a pre-commit secret scanner (gitleaks or equivalent) so a credential cannot reach a commit in the first place. - Enable GitHub secret scanning and push protection once the repository is public. - Pin GitHub Actions to commit SHAs. - Never commit the Supabase service role key. If it is ever exposed, rotate it immediately and document the incident. ## MONITORING AND LIMITS Free-tier log retention is short. Do not treat platform logs as an audit trail. Application-level audit events (the immutable `position_events` table) are the durable record. Design accordingly. There are no automated database backups on the free plan. Implement JSON export early and run it on a schedule. This is a stated, accepted risk, not an oversight. Free Supabase projects pause after a period of inactivity. Add a lightweight scheduled request to keep the project warm, or document the cold-start behavior as accepted. ## AGENT WORKING AGREEMENT To keep sessions efficient and reviewable: - Work one implementation phase at a time. Do not begin a later phase because it seems related. - Write a plan to `docs/plans/phase-N.md` and stop for review before writing implementation code. - Prefer targeted edits to named files over broad rewrites. Do not reformat or restructure files unrelated to the current task. - Do not create placeholder, scaffold, or "future" files that the current phase does not use. - Do not add dependencies without stating why in the plan. - Every phase must end in a state where `npm run build` and the test suite pass. Never leave the repository broken between phases. - When a requirement in these documents is ambiguous, ask rather than guessing and building on the guess. ## PHASE 0.5 — THIN VERTICAL SLICE Before the full phase sequence, build the narrowest end-to-end path that touches every layer: 1. Sign up, verify email, sign in, sign out. 2. One portfolio, created automatically on first sign-in. 3. Add a single position with a symbol, quantity, and average cost. 4. Display market value using a hard-coded price. No market API yet. 5. RLS on the positions table, with passing tests proving a second user sees zero rows. 6. Deployed and working on the production URL. The purpose is to prove auth, database, RLS, deployment, and testing work together before breadth is added. Feature depth comes after this slice is green, not before. 
