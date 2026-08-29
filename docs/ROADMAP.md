# ROADMAP

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

# PHASE 0.5 — THIN VERTICAL SLICE

Before the full phase sequence, build the narrowest end-to-end path that touches every layer:

1. Sign up, verify email, sign in, sign out.
2. One portfolio, created automatically on first sign-in.
3. Add a single position with a symbol, quantity, and average cost.
4. Display market value using a hard-coded price. No market API yet.
5. RLS on the positions table, with passing tests proving a second user sees zero rows.
6. Deployed and working on the production URL.

The purpose is to prove auth, database, RLS, deployment, and testing work together before breadth is added.

Feature depth comes after this slice is green, not before.

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