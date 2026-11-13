# Phase 6b repair — Local date-time inputs and current-state time bounds

## Objective and boundary

Prevent a UTC clock value from being interpreted as local time by
`datetime-local` controls, and prevent present/future fact timestamps from
making the completed-session capture worker permanently record a gap.

This repair covers only current position events, manual-asset values, and
liability balances. It preserves immutable event and snapshot history, does
not alter the snapshot worker's deliberate fail-closed behavior, and does not
repair production data: production verification found no future-dated rows and
no capture-gap rows.

## Evidence and audit

The complete `toISOString().slice(...)` audit finds six source uses:

| Location | Use | Change |
| --- | --- | --- |
| `src/features/portfolio/PositionDialog.tsx` | `datetime-local` default | Replace. |
| `src/features/assets/ValueItemsPage.tsx` | `datetime-local` create default and UTC edit prefill | Replace. |
| `src/features/market-data/xnys-calendar.ts` | UTC market-calendar date (`YYYY-MM-DD`) | Leave unchanged. |
| `src/features/export/recoveryExport.ts` | Download filename date | Leave unchanged. |
| `src/features/projections/FuturePage.tsx` | UTC year-month projection baseline | Leave unchanged. |
| `src/features/history/data.ts` | UTC historical date arithmetic | Leave unchanged. |

The defect is confined to the two datetime-local controls. A local control
must receive local calendar fields, while the RPC/PostgREST payload continues
to be an ISO UTC instant. Position editing currently defaults to a new current
time because its list query and response schema omit `last_event_at`; that
would still move the event timestamp when the field is untouched.

## Design decisions

1. Add one client helper for a `Date` or validated UTC instant that emits the
   exact `YYYY-MM-DDTHH:mm` local-clock representation required by
   `datetime-local`. It will use local date getters with explicit zero padding,
   not a shifted UTC ISO string. Both blank-form defaults and stored-value
   prefills call this helper.
2. Extend the open-position read projection and its Zod response schema with
   `last_event_at`, then prefill a position edit from that instant. An
   untouched position edit therefore sends the existing event instant instead
   of silently advancing it. Creating a position still defaults to the local
   current time.
3. Preserve client conversion of the chosen local clock value to a UTC ISO
   instant immediately before Zod validation and submission. No financial
   value changes representation or passes through JavaScript number math.
4. Use immutable lower-bound `CHECK` constraints for timestamps before
   `1970-01-01T00:00:00Z`. Do not put `now()` in a `CHECK` constraint: PostgreSQL
   assumes check predicates are immutable, and a clock-dependent check would
   not continuously protect old rows. Use server-side RPC validation for
   position events and a `BEFORE INSERT OR UPDATE` trigger for direct
   manual-asset/liability writes to apply the dynamic upper bound.
5. Use explicit, unique SQLSTATEs: `22008` (`datetime_field_overflow`) for
   timestamps later than `pg_catalog.now() + interval '5 minutes'`, and
   `P5001` for a chronological edit that precedes the stored event. `P5001`
   is a project-specific code, unlike default `P0001`; the code audit confirms
   neither `22008` nor `P5001` is raised elsewhere in this repository. The
   client maps codes, never text: `22008` explains that the date/time cannot
   be in the future and suggests checking the device clock; `P5001` explains
   the event cannot precede the most recently recorded event. Other failures
   retain the generic message.

## Implementation plan

1. Replace the two affected component files in full, keeping their existing
   behavior and copy outside this repair. Add the shared datetime-local helper
   under `src/lib/`; use it for PositionDialog's create default and edit
   `last_event_at` prefill, plus ValueItemsPage's create default and both
   `value_as_of`/`balance_as_of` edit prefills. Update the positions select and
   validation response contract so `last_event_at` reaches the dialog.
2. Add one forward-only migration (after
   `20261112010000_correct_xnys_2027_early_closes.sql`) that:
   - adds named `>= 1970-01-01T00:00:00Z` checks to `positions.last_event_at`
     and `position_events.occurred_at`, and to
     `manual_assets.value_as_of` and `liabilities.balance_as_of`;
   - replaces `app.create_position` and `app.edit_position` with otherwise
     equivalent `SECURITY DEFINER`, `search_path = ''` definitions that reject
     pre-1970 and more-than-five-minutes-future `p_occurred_at` before a write;
   - preserves identity from `auth.uid()`, existing ownership/idempotency and
     atomicity behavior, the explanatory SECURITY DEFINER comments, and all
     grants;
   - adds a narrowly scoped invoker trigger function and two table triggers
     that reject a future `value_as_of` or `balance_as_of` with the same
     distinct SQLSTATE; and
   - changes only the specific chronological edit rejection to a safe message
     stating that the effective date and time cannot be earlier than the most
     recently recorded position event.
3. In PositionDialog's existing mutation error handler, recognize only that
   chronological-edit database failure and show the same specific sentence.
   Retain the current generic message for all other RPC failures, including
   future-date failures, per the requested narrow error-copy scope.
4. Add focused browser-unit tests with `TZ=America/New_York` and a fixed
   `Date` clock. Cover winter and summer defaults, submit each form and assert
   the actual RPC/PostgREST timestamp is the fixed instant rather than a
   shifted instant; open each edit dialog without changing the date and assert
   the submitted/stored timestamp remains unchanged. Include the targeted
   chronological-position error copy and confirm unrelated failures remain
   generic.
5. Extend pgTAP coverage using values relative to the database transaction
   clock: `create_position` and `edit_position` accept exactly five minutes
   ahead and reject a later future instant with `P0001`; direct manual-asset
   and liability writes reject future as-of values; all four timestamp paths
   reject a pre-1970 instant. Assert rejected writes leave no added position
   event or changed current-state row.

## Targeted files

- `src/lib/<datetime-local helper>.ts` and its unit test
- `src/features/portfolio/PositionDialog.tsx` (full-file rewrite)
- `src/features/assets/ValueItemsPage.tsx` (full-file rewrite)
- `src/features/portfolio/PortfolioPage.tsx`
- `src/lib/validation.ts`
- focused portfolio and value-item dialog tests
- `supabase/migrations/<timestamp>_phase_6b_date_time_integrity.sql`
- `supabase/tests/rls.sql` (or the established focused pgTAP file, if one is
  already the correct execution target)

No new dependency, data migration, RLS policy, browser-visible date format,
or snapshot-worker change is required.

## Verification and acceptance

- In New York winter, a fixed `2026-01-15T16:30:00Z` clock presents `11:30`
  and submits `2026-01-15T16:30:00.000Z`; in summer, a fixed instant presents
  the corresponding UTC−04:00 local time and submits unchanged.
- Editing an existing position, asset, or liability without touching its date
  field sends its existing instant back unchanged.
- `1970-01-01T00:00:00Z` is permitted; earlier values are rejected.
- Exactly five minutes of server-clock skew is permitted; any later value
  produces `P0001`; the capture worker can therefore never receive this
  client-side UTC/local conversion defect as a future current-state fact.
- The specific older-than-last-position-event explanation appears only for
  that edit failure; other PositionDialog failures keep the generic message.
- Run `npm run build`, `npm run lint`, `npm run test`, and `npm run test:rls`.
