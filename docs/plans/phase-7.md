# Phase 7 — Portfolio Time Machine and recorded net-worth history

## Objective and boundary

Phase 7 turns the immutable snapshot records completed in Phase 6a into the
read-only historical experience promised by the product: a dashboard chart of
recorded net worth, and the dedicated **Portfolio Time Machine** for inspecting
and comparing exact recorded portfolio states.

This phase merges the roadmap's deferred Phase 5b chart work because both
surfaces consume the same correction-leaf snapshot series. It is deliberately
not a current-value chart, a reconstruction engine, a daily valuation service,
an attribution feature, or a snapshot authoring/capture change. It makes no
financial write and does not change any immutable snapshot or position-event
record. No new npm dependency is planned; use the existing React, TanStack
Query, Zod, Recharts, and shadcn/Tailwind stack.

## Decisions and data contract

- The only historical source of truth is an owner-visible **leaf** of the
  correction chain: a `portfolio_snapshots` row that no later snapshot
  `corrects_snapshot_id` references. Superseded revisions never appear in the
  chart, picker, detail, or comparison. The existing revision audit remains
  available in Snapshots, but Phase 7 does not expose it as history.
- A historical date means the snapshot's stored `as_of_date` and named XNYS
  market-close boundary, never the browser's local date or a reconstructed
  point. Detail always identifies its source/provenance and states “Recorded
  snapshot,” including manual/estimated price labels already captured by 6a.
- Historical aggregate values (`investment_value`, `total_net_worth`, assets,
  liabilities, holdings values, quantities, and weights) remain database
  `NUMERIC` values delivered and retained as decimal strings. Zod response
  schemas reject malformed values; formatting happens only at render. No
  client-side floating-point financial calculation is introduced. Existing
  decimal helpers may calculate only display deltas from decimal strings; the
  chart receives a separate presentation coordinate without becoming a source
  of displayed financial truth.
- **Chart implementation decision:** build the chart as a small, accessible
  hand-authored SVG, not with Recharts. The required connector is a visual-only
  dashed path with no hit target, while only discrete stored markers can be
  focused, clicked, or read; a custom SVG makes that rule direct and auditable.
  Recharts therefore is not part of Phase 7 and must not be half-used for this
  surface. The existing package is untouched because this phase does not add or
  remove dependencies.
- Add one narrow owner-scoped, `SECURITY INVOKER` read boundary (or the
  equivalent RLS-respecting query layer if it can make the same indexed query)
  for leaf history and a single leaf's complete detail. It derives ownership
  from `auth.uid()`, accepts only a validated portfolio UUID and bounded date
  range, returns no user ID, and selects the immutable child rows required for
  the selected snapshot. It must use the portfolio/date and
  correction-reference indexes needed for range reads. The client validates
  all route/query parameters and responses with Zod. Do not fetch every row
  merely to draw a 1M/3M/6M/1Y/YTD view; `ALL` is the explicit full-history
  request.
- The range endpoint must include a correction leaf whose historical date is in
  range even when its superseded predecessor is not. Date ordering is
  deterministic (`as_of_date`, then recorded timestamp/ID as a tie-breaker),
  while normal Phase 6 uniqueness means one current leaf represents a session.

## Experience and interaction design

The surface extends Midnight Scope's calm, evidence-led operating mode: one
principal selected reading, sparse rules, mono values and dates, and purple
only for the active inquiry. It is not a trading chart. Gain/loss always has a
signed number and directional label/icon in addition to any gain/loss color.

### Dashboard — recorded net-worth history

- Replace the Phase 6a history placeholder with a `Recorded net worth` module
  that reads the same leaf series. Its segmented period control is exactly
  `1M`, `3M`, `6M`, `1Y`, `YTD`, and `ALL`; the range is relative to the latest
  recorded leaf, with YTD beginning on January 1 of that leaf's as-of year.
  It is labelled “Recorded snapshots,” not “performance,” and links to the
  Time Machine with the pinned snapshot date.
- The selected snapshot is a durable text readout above/beside the chart
  (as-of date, XNYS close, net worth, and recorded status), not transient
  tooltip content. Clicking/tapping a rendered snapshot marker, using its
  keyboard-equivalent list/control, or choosing a date in Time Machine pins it
  until another stored snapshot is selected. Hover may preview a marker but
  never changes the pinned reading.
- Each snapshot is rendered as a clear recorded marker. A connector between
  markers is visually secondary/dashed and directly labelled “Connects
  recorded snapshots — no daily values are estimated between them”; it is not
  selectable or readable as an interpolated financial value. There are no
  invented dates, tooltips, values, or hit targets between markers. Sparse grid
  rules, direct legend text, visible focus, reduced-motion behavior, and the
  chart's text equivalent follow `DESIGN.md`.
- Empty state: “No recorded snapshots yet. Save or add a verified historical
  snapshot to begin your history.” Render no line or fabricated zero baseline.
  One point: render that one recorded marker and its pinned value, with “One
  recorded snapshot — a trend begins with a second recorded date.” Render no
  connector. Two points: render two recorded markers and the labelled dashed
  connector; show the selected stored value and permit either marker to be
  pinned. Three or more use the same rules, never implying unrecorded daily
  values.
- For deterministic 7a review, `?historyPreview=empty` and
  `?historyPreview=one` affect only the dashboard module's rendered data after
  the normal owner-scoped read: `empty` renders no points and `one` retains the
  first available leaf. Each shows a concise “Review preview” label so it
  cannot be mistaken for a real empty/one-point account. The parameter has no
  write path, does not change query results or snapshots, and is ignored unless
  it exactly matches one of those allowlisted values.

### Portfolio Time Machine

- Add a dedicated private `/history` route and primary navigation destination
  named **History** / page title **Portfolio Time Machine**. The route opens on
  the pinned date passed from the dashboard when valid; otherwise it selects
  the newest recorded leaf. Deep links accept only validated stored dates and
  fall back truthfully to the newest available leaf with an explanatory status,
  never a nearest reconstructed portfolio.
- Make date choice explicit and durable: a month navigator has labelled
  previous/next-month buttons, a visible `Month YYYY` heading, and a calendar
  or date list that exposes only recorded snapshot days as selectable facts.
  It can visit an empty calendar month and says so plainly. Selecting a stored
  day pins the complete historical reading until another day is chosen. The
  chart is a convenient second selection method, not the sole method and not a
  cursor-held scrubber.
- The selected-detail header reads `As of <date>`, `Recorded snapshot`, and
  its XNYS close/provenance. It shows recorded investments, manual assets,
  liabilities, and net worth with the stored source labels. The holdings table
  reads the immutable `snapshot_positions` rows exactly as recorded: account
  label, security, quantity, recorded price/value, cost basis where known,
  gain/loss where recorded, allocation, and manual/estimated provenance. It
  does not combine these with current quotes or current holdings. Preserve
  table semantics, horizontal scrolling on narrow screens, and textual
  missing/unknown values rather than substituting zeros.
- The Time Machine contains the same range chart and the same period controls
  as the dashboard so date, chart, and detail remain one selection model rather
  than two conflicting histories. On small screens, controls remain explicit,
  the selected reading precedes the chart, month navigation stays reachable,
  and the measurement table scrolls horizontally rather than compressing
  numbers into ambiguity.

### Recorded-date comparison

- Provide a `Compare recorded dates` mode on the Time Machine. It contains two
  independently labelled stored-date pickers (Earlier and Later), constrained
  to recorded leaves; defaults are the pinned date and the latest later leaf
  when one exists. The UI never calls a historic leaf “now” unless that stored
  date is explicitly named. If only one leaf exists, explain that comparison
  requires two recorded dates and keep the exact selected snapshot available.
- The comparison header identifies both XNYS dates and shows decimal-string
  totals for investments and net worth plus signed/directional differences.
  Holdings are joined by their immutable recorded identity (account context and
  security identity, not a mutable current position), then grouped as Added,
  Removed, Increased, Reduced, and Unchanged. Changed rows show `quantity A →
  quantity B`, signed quantity/value change, and allocation-point change where
  both weights exist. Added/removed rows explicitly show an absent side rather
  than a made-up zero holding. Manual assets and liabilities have a separate
  recorded-value-change section so the net-worth comparison remains explainable
  without pretending they are securities.
- Comparison is between two facts, never causal attribution: copy says
  “Recorded change between these snapshots,” not gain, return, or performance.
  Positive/negative differences pair `+`/`−`, arrows, and text with color;
  zero/unknown values have their own textual state.

## Implementation plan

1. Inspect Phase 2b/6a indexes and correction-chain invariants, then add the
   smallest forward-only migration necessary for an indexed, RLS-respecting
   owner read of leaf-series ranges and complete leaf detail. Do not alter
   snapshot data, correction mechanics, grants beyond the narrowly required
   authenticated read boundary, or current-state tables.
2. Create a `history` feature with Zod schemas, decimal-string types,
   query-keyed range/detail loaders, period-to-date-bound computation, leaf
   selection state, and safe generic error handling. Keep all historical
   aggregation authoritative to stored snapshot values; isolate any chart
   coordinate conversion from displayed value formatting.
3. Replace Dashboard's recorded-history placeholder with the accessible
   period-controlled chart, durable selected readout, exact zero/one/two/many
   states, and history deep link. Preserve existing current-net-worth and quote
   behavior outside this module.
4. Add the `/history` route, navigation entry, month/date selector, selected
   leaf summary, provenance-aware holdings/value-item detail, and responsive
   chart/table layout. Reuse shared selection/chart components rather than
   drawing the chart a second time.
5. Add the two-recorded-date comparison workflow and decimal-safe comparison
   presentation, including added/removed/increased/reduced/unchanged holdings
   and manual-asset/liability explanations. It remains read-only.
6. Add focused SQL/RLS, unit, React, and Playwright coverage, then run the
   required build, lint, unit-test, and RLS-test gates.

## Targeted files and tests

- One additive `supabase/migrations/<timestamp>_phase_7_history_reads.sql` and
  focused `supabase/tests/` coverage for leaf-only range/detail reads, owner
  access, cross-user denial, anon denial, correction replacement visibility,
  date bounds, and no write privileges/regressions.
- `src/features/history/` for shared validated read models, period/date state,
  chart, picker, recorded detail, comparison, and focused unit/component tests.
- `src/features/dashboard/DashboardPage.tsx` and focused test for the history
  module only; `src/App.tsx`/the existing route and navigation files only as
  needed to expose `/history`; narrowly scoped styles only where incumbent
  tokens/components cannot express the accessible chart/table states.
- Unit tests cover range boundaries, YTD, selected-date persistence, leaf
  filtering, decimal-string display/delta behavior, zero/unknown facts, and
  one/two/many/empty chart semantics. React tests cover keyboard selection,
  hover not replacing the pinned reading, month navigation, provenance labels,
  no interpolated reading, comparison classifications, and non-color-only
  signed differences. Playwright covers a one-snapshot account, a corrected
  snapshot whose superseded revision is absent, a multi-date selection/deep
  link, and two-date comparison under an isolated owner session.

Before Phase 7a review, backfill and retain at least **three recorded leaf
snapshots** so the normal populated chart, range controls, selection, and
connector treatment can be evaluated against real history. The query-parameter
review previews above make the equally important empty and one-point states
available without deleting or correcting those records.

Run `npm run build`, `npm run lint`, `npm run test`, and `npm run test:rls` at
the end of implementation.

## Size and recommended split

This is too large and too cross-cutting for one implementation session if the
expectation is the normal full test gate and visual QA. Keep the shared
read/leaf contract and dashboard chart together as **Phase 7a**, because that
is the foundation that prevents a second chart implementation. Make the
dedicated Time Machine date/detail surface **Phase 7b**, and the two-date
comparison plus end-to-end polish **Phase 7c**. Each subphase can ship a
coherent, truthful read-only capability without reopening Phase 6a writes.
