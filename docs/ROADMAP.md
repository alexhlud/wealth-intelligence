# ROADMAP

## Completed

### Phase 0.5 — Thin vertical slice (done)
Auth, one portfolio, one position, RLS, deployed and verified in
production. Proved every layer works together end to end.

### Phase 2a — Current-state data model (done)
profiles, accounts, positions evolution, manual_assets, liabilities,
position_events. Atomic create_position and edit_position RPCs.
Immutability triggers. RLS and grants on every object.

### Phase 2b — Immutable history (done)
portfolio_snapshots, snapshot_positions, snapshot_manual_assets,
snapshot_liabilities. create_portfolio_snapshot and
correct_portfolio_snapshot RPCs. Append-only correction chain. XNYS
market-close date semantics.

189 database security tests pass. The full private schema exists and is
proven. No UI reads it yet beyond the Phase 0.5 slice.

---

## Remaining

### Phase 3 — Application UI
Design tokens and layout shell. Centered top navigation and mobile navigation.
Screens for what Phase 2a built: accounts, holdings table, add/edit
position flows, manual assets, liabilities. Loading, empty, error, and
stale states throughout. First phase where visual design matters.

Likely needs splitting: 3a for tokens and shell, 3b for screens.

### Phase 4 — Market data
MarketDataProvider abstraction with normalized internal types. Supabase
Edge Function so provider credentials never reach the browser. Quote
cache. Honest stale-price display. Replaces the hard-coded prices.

### Phase 5 — Net worth and dashboard
Net worth calculation from positions, assets, and liabilities. Home
dashboard: net worth, investments, monthly change, next milestone.
Net-worth history chart.

### Phase 6 — Snapshot generation and backfill
Wire Phase 2b to real behavior. Decide and implement when snapshots are
created. Add historical snapshot backfill so users can enter portfolio
history predating the app.

### Phase 7 — Portfolio Time Machine
Flagship feature. Select a historical date, see exact holdings as
recorded. Timeline, scrubber, chart tooltips. Then-vs-Now comparison.

### Phase 8 — Goals and projections
Wealth goals and milestones. Future wealth calculator with nominal and
inflation-adjusted toggle. Projection language must never imply
guarantees.

### Phase 9 — Public surface
Landing page. Fictional demo portfolio using bundled deterministic data,
never real user rows. Privacy mode. Responsive polish.

### Phase 10 — Hardening and release
Enforced CSP after report-only validation. Threat model document.
Accessibility pass. Performance. README with architecture and security
documentation. Final security review.

---

## Cross-cutting, not a phase

**MFA.** TOTP via Supabase Auth, enforced at the database layer using
Authentication Assurance Level in RLS policies. Land this by Phase 5,
before the app holds real financial data for more than one user.

**Threat model.** docs/THREAT-MODEL.md is written incrementally, one
trust boundary per phase, not at the end.

**Repository goes public** at the end of Phase 3, once there is
something worth showing. Branch protection rules activate then.

---

## Not V1

Plaid, brokerage OAuth, bank integrations, real-money trading, tax
filing, automated financial advice, complex budgeting, crypto wallet
connections, advanced AI, Monte Carlo simulation, complete ETF X-Ray,
public portfolio sharing, real estate APIs, native mobile apps,
Kubernetes, microservices, Redis, Kafka.

## V2

Wealth Velocity. Wealth Attribution. Projection Drift. Compounding
Crossover. Advanced goals. Scenario Lab. FIRE and Coast FIRE. Decision
Simulator. ETF overlap and Portfolio X-Ray. Investment thesis journal.
Activity timeline. Read-only sharing links.

## V3

AI Wealth Review. Ask My Wealth. Monte Carlo simulation. Household
accounts. Partner sharing. Brokerage integration. Real estate modeling.
Income forecasting. Financial digital twin.
