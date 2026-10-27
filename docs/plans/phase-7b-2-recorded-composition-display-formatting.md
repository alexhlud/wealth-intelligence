# Phase 7b.2 — Recorded Composition Display Formatting

## Objective

Correct the Portfolio Time Machine holdings table so immutable decimal strings
remain exact through the data layer but are presented as readable measurements
at the render boundary:

- quantities omit non-significant trailing fractional zeroes (`16.000000000000`
  becomes `16`, while `20.500000000000` becomes `20.5`);
- stored allocation fractions render as two-decimal percentages
  (`0.477030224746` becomes `47.70%` and `0.522969775254` becomes `52.30%`).

## Evidence and scope

- The Phase 7b.1 history contract deliberately preserves `quantity` and
  `portfolio_weight` as validated decimal strings in `src/features/history/data.ts`.
- `src/features/history/HistoryPage.tsx` is the only history render path that
  outputs either field without a display formatter. The dashboard history chart
  and selected-history views display only already-formatted currency and dates.
- This is presentation-only. It must not alter the RPC, Zod schemas, migrations,
  snapshot records, or financial calculations, and adds no dependency.

## Implementation

1. Add decimal-string display helpers beside the existing fixed-point helpers
   in `src/features/portfolio/prices.ts`:
   - a quantity formatter that removes only insignificant trailing zeroes and
     the decimal point when the fractional portion becomes empty, without a
     JavaScript `number` conversion;
   - a fraction-to-percent formatter that uses integer arithmetic, rounds to
     the nearest hundredth of a percent (including carry), and emits a fixed
     two-place `%` string.
2. Apply those helpers only to the Quantity and Allocation cells in the
   recorded composition holdings table. Keep the validated raw values intact
   everywhere before JSX rendering.
3. Extend focused tests to render a populated recorded composition fixture and
   assert a whole-number quantity, a fractional quantity, and the two-decimal
   allocation percentage. Add helper-level edge coverage for trailing-zero
   trimming and percentage rounding as appropriate.
4. Re-run the required gates: `npm run build`, `npm run lint`, `npm run test`,
   and `npm run test:rls`.

## Targeted files

- `src/features/portfolio/prices.ts`
- `src/features/portfolio/prices.test.ts`
- `src/features/history/HistoryPage.tsx`
- `src/features/history/HistoryPage.test.tsx`

## Safety and acceptance

- Financial decimal strings remain strings until the JSX render boundary; no
  binary floating-point conversion is introduced.
- The history table displays `16`, `20.5`, `47.70%`, and `52.30%` for the
  corresponding stored values.
- No other history view contains raw quantity or allocation rendering after the
  audit.
