# Phase 8 — Wealth goals and future wealth projector

## Status

Planning only. Do not implement until this revised plan is reviewed.

## Purpose and scope

Deliver the app's first future-facing workspace: a deterministic,
composition-aware wealth projector plus persistent net-worth goals. The
projector starts from the user's own financial composition, rather than a
manually typed starting balance; it must never compound all net worth at one
blended return rate.

The default baseline is the same live current net worth shown on Overview,
including its as-of time and quote freshness. The user may select the newest
recorded snapshot instead. The active source is always named: `Live current
value` or `Recorded snapshot · YYYY-MM-DD`.

Phase 8 includes:

- A protected `/future` route and a **Future** destination in the primary
  navigation.
- Composition-aware projections: investments at an editable investment return,
  non-investment assets at a distinct editable conservative growth rate, and
  liabilities held flat. Projected net worth is recomposed each month; it is
  never treated as one compounded balance.
- Live current value as the default baseline, applying exactly Overview's
  account-inclusion, quote, and missing-price rules. A recorded effective
  snapshot is an explicit alternative baseline, not a prerequisite.
- Editable annual investment return (default **7%**), non-investment asset
  growth (default equal to annual inflation, so those assets hold their real
  value without making a directional nominal-price bet), annual inflation (default
  **2.5%**), and a whole-year horizon (default **30 years**). Nominal and
  inflation-adjusted values appear together.
- Two or three contribution paths selected from the presets appear together:
  Coast FIRE (`$0/month`), Max Roth (`$625/month`), `$1,000/month`,
  `$2,000/month`, and a validated custom amount.
- Clearly labelled annual projection points and baseline-derived milestone
  estimates. Use the existing standard milestone ladder and only show amounts
  above the active baseline; do not hard-code `$500K`, `$1M`, and `$2M`.
- User-created net-worth goals with a name, target amount, optional target
  date, current progress, amount remaining, and an estimated achievement date
  from the current stated projection when it reaches that amount.
- Calm, visible uncertainty language throughout: every result says
  **Projected** and **based on these assumptions**. No copy says or implies
  “you will have,” a guarantee, advice, or a recommendation.

Phase 8 does not add saved scenarios, historical projection drift, a FIRE
spending/withdrawal model, liability amortization schedules, retirement age,
salary modelling, investment-versus-net-worth goal types, Monte Carlo
analysis, financial advice, or automatic milestone celebrations. Coast FIRE is
a contribution preset here, not the V2 full FIRE model.

## Product and UX brief

This is an **Operate** surface for a long-term investor who needs to compare
contribution paths while seeing precisely which parts of their real financial
position are being modelled. Success is understanding an outcome's projected
investments, non-investment assets, and liabilities—not mistaking all wealth
for market investments.

- The primary reading is the selected-horizon projected value, with nominal
  and today-dollar values adjacent and the exact baseline immediately below:
  “Projected from recorded net worth of $… on …”. A short subtitle says the
  values are estimates based on the displayed assumptions.
- Keep assumptions and contribution choice in a bounded control region above
  or beside the projection—not a dashboard of equal-weight cards. Presets are
  an accessible segmented control; **Custom** reveals the currency input.
  Controls update an unsaved local path immediately after validation.
- The chart is the evidence field. It compares two or three selected nominal
  contribution paths, directly labelled and distinguished by line weight/dash
  before restrained color. Selecting a point pins its calendar date and both
  nominal and inflation-adjusted values for every visible path; hover never
  becomes required.
- A labelled Nominal / Inflation-adjusted segmented toggle switches the chart
  and annual table between those two modes. It renders the same selected paths
  in one mode at a time—never six lines—while the pinned composition preserves
  both readings in text.
- Under the chart, use a compact annual projection table rather than another
  visualizer. Each row identifies “Year N · Month YYYY” and both values,
  including Year 0. It is the accessible text equivalent of the chart.
- Milestones and goals form a supporting evidence column/section. A milestone
  says “Estimated to reach $1M in Month YYYY” or “Not projected within this
  horizon,” never a promise. Goal rows state progress and their projection
  estimate under the current unsaved assumptions.
- On desktop, use the existing 1240px evidence layout with the chart owning the
  main column and assumptions/milestones as a constrained companion; collapse
  to one ordered column below 780px. Preserve numeric tables in horizontal
  scrolling containers on narrow screens.
- Follow Midnight Scope without a new visual language: continuous canvas,
  rules and tonal separation instead of cards/shadows, Newsreader only for the
  page statement and decisive values, and IBM Plex Mono for dates and all
  monetary measurements. Projection lines use the existing 2.5px dashed
  uncertainty grammar and explicit text labels; no gradients, filled chart
  areas, celebratory effects, or color-only status.

### States

The primary reading is conditional on the active source: “Projected from live
net worth of … as of …” for the default live value, or “Projected from
recorded net worth of … on …” for a selected snapshot. Goal states use
“selected baseline,” never “recorded baseline,” for the same reason.

The comparison selector is a labelled multi-select control with the five preset
rows and checkboxes. It requires two selections, allows at most three,
preselects Coast FIRE, Max Roth, and `$1,000/month`, and replaces the Custom
row amount only after its input validates.

- **Live baseline with missing price(s):** keep the same excluded-holding
  calculation as Overview, name the missing holdings, and say the baseline and
  projections exclude them. Never silently substitute a snapshot.
- **No recorded snapshot:** live projection remains available; the recorded
  option explains there is no stored baseline and links to save/add history.
- **Recorded baseline unavailable:** retain live selection or show the normal
  retryable error; never reconstruct a recorded value from mutable data.
- **No goals:** explain what a goal measures and offer “Create goal”; the
  projector remains usable.
- **Goal target already met:** show “Already reached by the recorded baseline”
  with that baseline date, rather than inventing a prior achievement date.
- **Goal/milestone beyond horizon:** retain the goal and state “Not projected
  within the selected horizon.”
- **Loading/error/save:** use existing loading and generic error components;
  retain valid local assumptions and form input on a failed goal mutation.

## Data, security, and calculation design

### Shared milestone policy

Extract the current Overview standard milestone ladder into one shared ordered
helper. `nextMilestone` returns the first amount strictly above supplied net
worth; Future filters the same ladder to amounts above its active baseline and
calculates first crossings from those amounts. This prevents two milestone
systems and avoids presenting a previously passed `$500K` as a future event.

### Goal persistence

Add a versioned migration for `app.wealth_goals` with:

- `id uuid` primary key and `user_id uuid not null default auth.uid()`;
- `portfolio_id uuid not null`, protected by the same composite owner chain as
  the financial tables;
- `name text` (trimmed, 1–120 characters), `target_amount` using the same
  canonical money precision/scale as existing current-wealth and snapshot
  columns (do not introduce `numeric(24,8)`), constrained greater than zero,
  `target_date date null`, and UTC
  `created_at` / `updated_at` timestamps;
- an index supporting a user's goals for a portfolio in created order; and
- the established update-timestamp trigger where appropriate.

Enable and force RLS. Use a single authenticated owner `FOR ALL` policy with
both `USING` and `WITH CHECK` deriving identity from `auth.uid()`. Revoke all
privileges from `public` and `anon`; grant only the necessary CRUD privileges
to `authenticated`. Do not accept `user_id` in any browser write. Goal writes
are single-table and do not need an RPC; the browser supplies only the
portfolio-scoped, Zod-validated goal fields.

### Baseline contracts

The live baseline reuses Overview's established current-state query, quote
contract, account inclusion rules, and exact decimal calculation helpers. It
returns investments, non-investment assets, liabilities, net worth, as-of and
freshness metadata, and unresolved holdings, preserving Overview's incomplete
value/warning behavior.

Add a narrow `SECURITY INVOKER` recorded-baseline RPC, for example
`app.get_newest_projection_snapshot_baseline(p_portfolio_id uuid)`. It derives
the caller from `auth.uid()` and returns only the newest effective
correction-chain leaf with its date/time and investment, manual-asset,
liability, and total-net-worth components as decimal strings. It returns no row
when no snapshot exists, never accepts a user id, and never mutates or
reconstructs history. Revoke `public`/`anon`, grant execute only to
`authenticated`, and test ownership, anonymous denial, and correction-leaf
selection.

### Exact projection engine

Build a pure TypeScript `src/features/projections/math.ts` module that consumes
and returns canonical decimal strings. Reuse/extend the established `BigInt`
fixed-scale helpers for all baseline money, contributions, compounding, and
outputs. Floating point is forbidden for history, holdings, current net-worth
aggregation, money values, contributions, and outputs.

The only permitted exception converts a user-supplied annual assumption to a
monthly rate: use one documented finite floating-point calculation of
`(1 + annualRate)^(1/12) - 1`, immediately quantize it to a canonical decimal
rate at a stated fixed scale, then use exact decimal arithmetic thereafter.
Code comments and tests must explain why an uncertain editable assumption makes
this sound, and why the exception must never be copied into recorded-fact or
holdings calculations.

Calculation rules, all explicit in code and copy:

1. Start with active-baseline investments, non-investment assets, and
   liabilities. For a live baseline, use Overview's current quote and account
   inclusion rules; for a recorded baseline, use those stored components.
2. Convert each annual investment, non-investment, and inflation assumption
   once by the documented exception. Compound investments independently and
   add the scenario contribution at month end; compound non-investment assets
   independently; hold liabilities flat and state that limitation plainly.
3. Calculate internally every month through `horizonYears × 12`; retain the
   month-zero baseline, each year-end chart/table point, the terminal point,
   and the first month each milestone/goal target is met.
4. Recompose net worth every month as investments plus non-investment assets
   minus liabilities; never compound total net worth. Deflate each nominal
   result by cumulative inflation into baseline-month dollars. Round only for
   display with documented fixed internal scale and deterministic half-up rules.
5. Date labels derive from the active baseline's live as-of or snapshot month. A horizon
   is a whole number of years; a 10-year horizon ends exactly 120 projection
   months later. The returned model contains ISO year-month labels and decimal
   strings only.

The implementation must define bounded accepted ranges in Zod: horizon `1–60`
whole years, contribution `0–100,000` at the existing money scale, investment
and non-investment rates `-100%–100%`, and inflation `-100%–100%`. Defaults
are confirmed: **7% investment return, 0% non-investment growth, 2.5%
inflation, and 30 years**. Add a known composition-aware projection-to-the-cent
regression test, plus tests proving total net worth is never compounded as one
balance.

## Implementation sequence

1. **Shared facts, database, and security.** Extract only the non-visual live
   baseline/milestone helper necessary for Overview and Future to agree. Add
   the recorded-baseline RPC; add `wealth_goals`, RLS, and grants in 8b. Test
   owner access, cross-user denial, anonymous denial, function grants, and
   correction-leaf selection.

   Sharing Overview's baseline calculation is required because two live
   net-worth calculations drifting is a financial-correctness bug. The
   historical and projection charts remain separate in 8a because their
   duplication is visual/interaction untidiness, not a second calculation
   contract; their extraction belongs in a later isolated change.
2. **Contracts and exact math.** Add Zod schemas for baseline composition,
   assumptions, comparison paths, outputs, and goals. Test the documented
   annual-rate conversion exception, cent-level known result, composition,
   contribution timing, inflation, dates, milestones, and negative/zero rates.
   Name the never-blended regression for its intent and use a realistic
   `$23,000` investment / `$500,000` non-investment composition over 30 years;
   assert the composition-aware result and reject the materially larger blended
   net-worth-compounding result.
3. **Projection data hooks and goal mutations.** Add a focused
   `features/projections` data module using TanStack Query for the baseline and
   goals, plus create/edit/delete mutations that validate first and invalidate
   only projection/goal keys. Surface generic true failures; do not translate
   unrelated server failures into a specific false explanation.
4. **Standalone projection chart.** Build `ProjectionComparisonChart` inside
   the Future feature with Midnight Scope axes, sparse grids, direct labels,
   keyboard point selection, pinned text reading, and responsive overflow. Do
   not modify or refactor `RecordedNetWorthChart` in Phase 8. A later dedicated
   extraction can proceed only when both chart suites are green.
5. **Future workspace.** Build `FuturePage` from the approved UX brief:
   live/recorded selection and provenance, incomplete-live disclosure,
   composition-aware assumptions, two/three path controls, chart, selected
   point composition, annual table, milestone estimates, and honest states.
   Add the route/navigation under the existing protected/MFA guard.
6. **Goals UI and integration.** Add a bounded create/edit goal dialog and a
   measurable goals section on the Future page. For each goal, derive current
   progress from the same baseline and calculate its estimated date from the
   in-memory current projection; do not store calculated outputs. Link the
   dashboard's “Next milestone” only if it can use a real persisted goal
   without displacing existing Phase 5 content; otherwise leave dashboard
   changes out of this phase.
7. **Verification and documentation.** Add component tests for presets,
   custom validation, no baseline, point selection, direct labels/accessible
   table, assumptions copy, milestones, goal states, and generic errors. Add
   focused E2E coverage for a user with a recorded snapshot creating a goal and
   viewing an estimated date, plus the no-snapshot state. Update the Phase 8
   trust boundary in `docs/THREAT-MODEL.md`. Run `npm run lint`, `npm run test`,
   `npm run test:rls`, and `npm run build` before handoff.

## Deferred and recorded for 8b or later

- Optional current age, session-only and never stored, so each point can show
  calendar year and age.
- A **Your pace** contribution preset from immutable `position_events`, with
  separately reviewed inclusion/exclusion and historical-period rules.
- An inverse projection for unreached goals: solve for the monthly contribution
  required by the goal's optional target date with the same composition and
  assumption disclosures.
- Actual liability amortization inputs/schedules, saved scenarios, projection
  drift, full FIRE modelling, and additional goal types.

## Size and proposed split

This is too large and too security/math-sensitive for one implementation
session if completed to the project standard. Split it as follows:

- **Phase 8a — Composition-aware projector:** shared live-baseline and
  milestone helpers; recorded-baseline RPC/RLS tests; exact-decimal composition
  engine with the narrow documented annual-rate conversion; standalone
  comparison chart; live/recorded selection; assumptions; multi-path presets;
  nominal/real/composition outputs; and baseline-derived milestones.
- **Phase 8b — Persistent goals:** `wealth_goals` migration/RLS tests, goal
  CRUD and progress UI, derived dates based on a selected comparison path,
  empty/met/out-of-horizon states, optional dashboard integration, E2E
  coverage, and the Phase 8 threat-model increment.

The split intentionally keeps goal persistence out of 8a so it cannot delay
the centerpiece. Neither part refactors `RecordedNetWorthChart`; shared chart
extraction is a later dedicated change after both chart suites are green.
