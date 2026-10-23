# Phase 5 — Net worth and dashboard

## Goal

Make `/` the signed-in home page: a calm, evidence-led overview of the
user's **current** included net worth, included investments, selected-period
change, next standard milestone, and recorded net-worth history. It must not
manufacture completeness from partial market data. If an included open
position has no usable quote, the dashboard must say that net worth and every
dependent metric are unavailable rather than display a silently understated
amount.

This phase consumes current-state records and Phase 4 quotes. It does not
create snapshots, backfill history, add goals/projections, or change the
immutable snapshot model.

## Decisions and calculation contract

### Inclusion and valuation

- Current dashboard scope is the user's primary portfolio, in USD only.
  Read ownership remains entirely RLS/auth.uid()-enforced; the browser sends
  no user identifier.
- A position contributes only when it is open and its account has
  `include_in_net_worth = true`. Its value is `quantity × quote.price`.
- A manual asset contributes only when its own `include_in_net_worth` flag is
  true **and**, when it is associated with an account, that account is also
  included. An unassociated included manual asset remains included.
- A liability is subtracted only under the corresponding two-flag rule. Its
  stored non-negative `outstanding_balance` is never converted into a stored
  negative amount.
- Therefore: `net worth = included priced positions + included manual assets
  − included liabilities`. `Investments` is the included priced-position
  component only; it does not double-count cash/manual assets.
- The account rule above makes an excluded account a true exclusion boundary.
  It is the proposed resolution of the overlapping account/item flags and is
  deliberately called out for review before implementation.

### Missing, stale, and partial data

- `fresh`, `delayed`, and valid cached `stale` quotes are usable valuations.
  Delayed/stale data retain their explicit status and exact last-successful
  time; they are never called current.
- Any included open position that is non-USD, has an unavailable quote, a
  null price, or a failed quote request makes every affected current reading
  **incomplete**, not blank. Show the known-value net-worth, investments,
  total-assets, and milestone readings with an adjacent textual warning such
  as “Incomplete — 1 holding has no price,” name the affected holding(s), and
  link to Holdings to resolve it. The user may decide whether the clearly
  qualified value is useful for the task at hand.
- Never substitute zero, silently omit a holding, call an incomplete number
  complete, or render the known-value subtotal without its incompleteness
  status. The calculation retains the disclosed omission only so the dashboard
  remains useful during a transient provider failure.
- If no included positions exist, investments are exactly `$0.00`; manual
  assets and liabilities can still yield a complete net worth. If no included
  financial items exist, complete net worth is `$0.00` with clear empty-state
  guidance.

### Precision and comparison

- All database financial fields and quote values are parsed as canonical
  decimal strings. Extend the existing BigInt decimal utility with canonical
  signed addition/subtraction, comparison, absolute value, and fixed-place
  signed percentage helpers; do not use `number`, `parseFloat`, `Math`, or
  `toFixed` for financial calculations.
- Only final render helpers add currency separators/rounding. Display a signed
  directional marker and signed text for gains/losses (for example,
  `↗ +$1,240.00 · +1.06%`), in addition to the gain/loss colour.
- Chart geometry may derive non-financial screen coordinates from decimal
  strings with integer/BigInt scaling; values supplied to calculation and
  display boundaries remain decimal strings. Do not coerce snapshot values to
  JavaScript floats merely to satisfy a chart library.

## Dashboard behavior and visual direction

- Add a `DashboardPage` at `/`; authenticated unknown routes and successful
  sign-in/callback fall back to `/` instead of `/holdings`. Keep Holdings,
  Accounts, Assets, Liabilities, and Security intact. Make Overview the active
  home destination in the existing centered top navigation, preserving the
  current Midnight Scope shell rather than reviving the mockup's legacy
  “Observatory” brand or side rail.
- Translate `mockups/dashboard-overview.html` into the established Midnight
  Scope grammar: date/context and dashboard statement above a spacious main
  observation; a large Newsreader net-worth reading; mono metrics; sparse
  rules; a wide chart-led primary column and narrow evidence column; no KPI
  card grid, gradients, elevation, or ticker theatre. Use the current DESIGN
  tokens, 1240px field, responsive collapse below 780px, visible focus, and
  reduced-motion behavior.
- The top observation contains the net-worth reading and its selected-period
  change. The supporting evidence column contains included investments, next
  standard milestone, a concise data-freshness/incompleteness callout, and
  direct actions to Holdings/Assets/Liabilities as appropriate. A text label,
  icon/directional marker, and signed value always supplement semantic colour.
- Use the defined standard milestones (`$10K`, `$25K`, `$50K`, `$100K`,
  `$250K`, `$500K`, `$1M`, `$2M`) as a deterministic Phase 5 “next
  milestone”; it is not a user-created goal (Goals belongs to Phase 8). Show
  the next amount and remaining amount only with a complete current net worth.
  At/above the last standard milestone, say so plainly rather than inventing a
  future target.

## History and period behavior

- The period control offers `1M`, `3M`, `6M`, `1Y`, `YTD`, and `ALL`, with an
  accessible selected label. Selection determines the stored-snapshot query
  window and the selected-period comparison when records exist; it never
  changes current valuation or constructs a historical value from today's
  holdings/prices.
- Read only correction-chain leaves from `portfolio_snapshots`, ordered by
  their stored XNYS `as_of_date`; validate every result with a dedicated Zod
  response schema. The line represents stored `total_net_worth` values,
  explicitly labelled “Recorded net worth”, not interpolation or a
  reconstruction. When records exist, selection is click/keyboard-pinned and
  exposes its exact recorded date/value in text; chart hover is supplementary.
- There are currently no snapshots because snapshot generation is Phase 6.
  Until Phase 6 creates the first record, render the chart region as an
  intentional empty state: “No recorded net-worth history yet. History begins
  when snapshot generation is enabled in Phase 6.” The selected-period change
  reads “Unavailable — no recorded starting snapshot.” Do not draw a line,
  infer a prior value, or place today's live total into history.
- Once two stored points fall within the selected period, change is latest
  recorded net worth minus the period's earliest applicable stored net worth;
  percentage is null and shown as “—” when the starting value is zero. With
  one point, show the point as recorded but state that no comparison is
  available. A current live total is not compared to a snapshot in this phase.
- Do not add “View Snapshot”, portfolio-time-machine navigation, comparison
  mode, projection, backfill, or charted future values; those belong to Phases
  6–8. The empty and populated chart copy must make that boundary clear.

## Implementation plan

1. Add a focused `src/features/net-worth/` boundary for validated current
   dashboard reads, decimal-string net-worth calculation, standard milestone
   selection, and snapshot-history response parsing. Reuse the Phase 4 quote
   contract and existing `useQuotes`; extract only the primary-portfolio and
   account/position reads that are genuinely shared with Holdings. Query
   manual assets and liabilities in parallel, validate all PostgREST responses
   before calculation, and give each query a stable portfolio-scoped TanStack
   key.
2. Expand the exact decimal utilities and their unit tests before wiring UI.
   Calculate inclusion, completeness, component totals, liability subtraction,
   comparison deltas, and percentages from strings/BigInt. Keep presentation
   formatting at the page/component boundary.
3. Build `DashboardPage` and a small accessible period control/chart component
   using the existing design tokens and custom SVG path/inspection treatment.
   Implement loading, retryable error, no-financial-data, excluded-account,
   unavailable-price, stale/delayed-price, no-snapshot, one-snapshot, and
   populated-history states. Avoid any new dependency: Recharts is not needed
   for this single exact decimal chart.
4. Update routes and `AppShell` so `/` is the default authenticated landing
   page and Overview is visible/active, without altering the existing feature
   forms or account-selection behavior. Invalidate dashboard query keys after
   successful writes to positions, accounts, manual assets, and liabilities,
   and after quote refreshes, so the dashboard cannot show an avoidably stale
   current-state result.
5. Add only the CSS/components required for the dashboard, retaining the
   established shell and responsive layout. No migration, Edge Function,
   RLS-policy, or dependency change is expected; document any exception for
   review before making it.

## Tests and verification

- Unit-test decimal calculation with fractional shares, manual assets,
  liabilities, excluded accounts, excluded item flags, unassociated items,
  zero totals, zero comparison baseline, positive/negative comparison, and
  values beyond JavaScript safe integers.
- Prove an unavailable/non-USD/null-price included position makes the primary
  totals incomplete rather than treating it as zero; prove stale/delayed valid
  quotes remain counted and visibly labelled. Cover quote-query failure with
  and without retained quotes.
- Component-test loading/error/retry, complete dashboard, inaccessible-next-
  milestone, signed non-colour change cues, action links, period selection,
  keyboard-pinned historical point, no snapshot, one snapshot, correction-leaf
  filtering, and the explicit Phase 6 history copy. Assert no fabricated line
  or comparison is rendered before snapshots exist.
- Extend route/auth tests to prove a signed-in default route reaches Overview
  while unauthenticated users still cannot access private dashboard data.
- Run `npm run build`, `npm run lint`, `npm run test`, and `npm run test:rls`.
  Visually inspect desktop and narrow dashboard states once against
  `mockups/dashboard-overview.html`, including missing-price and no-history
  states.

## Boundaries and recommended split

This is too large to safely implement as one review/implementation session:

1. **Phase 5a — current net worth and dashboard:** decimal calculation
   boundary, inclusion policy, current quotes/assets/liabilities, complete and
   incomplete dashboard states, default route, milestones, and tests.
2. **Phase 5b — recorded-history dashboard:** snapshot-leaf query, period
   semantics, chart/keyboard inspection, no-snapshot state, and history tests.

Phase 5b remains display-only. It must not begin snapshot generation,
backfill, Time Machine, goals, or projections; Phase 6 owns producing the
first records it will display.
