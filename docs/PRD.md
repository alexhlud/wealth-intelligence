# PRODUCT REQUIREMENTS DOCUMENT

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

The simple UI can default to:

`manual_adjustment`

while allowing the user to optionally select a more specific reason.

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

# BACKUP / EXPORT

Eventually support:

Export My Data.

At minimum plan for export to:

JSON

CSV

This is important because users should not feel trapped in the application.

Not required for first implementation unless easy.

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

# UX PRINCIPLE

Every page should answer:

“What is the most important thing the user needs to understand or do here?”

Avoid dashboards filled with metrics merely because they can be calculated.

Prioritize meaningful information.

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
## Account filtering on holdings

Users can filter holdings by account. Not just one account or all
accounts, but any combination: select two of three accounts and see
the totals, allocation, and holdings for exactly that selection.

All aggregate figures respect the current selection. Selection persists
while navigating within the session. The default view is all accounts.

## History interaction

Reading a historical value must not depend on holding a cursor in
place. Selecting a date pins the reading until another is selected.
Provide explicit month-level navigation, not only chart hover. The
displayed value is the stored snapshot, labelled as recorded, not an
interpolated point on a line.
