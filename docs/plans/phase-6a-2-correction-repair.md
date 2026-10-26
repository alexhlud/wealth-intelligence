# Phase 6a-2 correction editor repair

## Objective and boundary

Repair two production defects in the already-delivered Phase 6a-2 correction
flow without widening the feature set:

1. A correction of a single, uncorrected snapshot is reported to the user as a
   stale-leaf conflict whenever the RPC returns *any* error. The displayed
   warning is therefore not evidence that the snapshot has a newer revision.
2. The exported correction editor loads snapshot positions but does not render
   them. It exposes only manual assets and liabilities, while the RPC requires
   a complete replacement composition.

No new dependency, price lookup, snapshot mutation, current-state mutation,
or history redesign is included. The correction remains one authenticated,
MFA-gated RPC that appends an immutable full revision.

## Investigation result

The database leaf check in `app.correct_portfolio_snapshot` rejects a target
only when another owner-visible snapshot has `corrects_snapshot_id` equal to
the target ID. A sole original row cannot satisfy that predicate.

The false production warning originates in
`src/features/snapshots/CorrectionEditor.tsx`: the mutation `onError` maps
every error, without examining its code or message, to “A newer revision may
already be recorded.” This hides the real failed-write reason and makes a
validation/composition problem look like a leaf conflict. The editor also
exports `CorrectionEditorV2`, whose data loader fetches positions but whose
form has no holdings state or holdings controls; it only passes the invisible
loaded positions back to the RPC.

## Implementation plan

1. Add one forward-only migration that preserves the existing owner/MFA and
   append-only boundaries, and make the correction RPC return a distinct,
   stable leaf-conflict error only for an actual child revision. Preserve other
   input, ownership, source-reference, and idempotency failures as their
   existing safe errors. Do not weaken the leaf check or rewrite history.
2. Replace the correction editor’s hidden position pass-through with typed,
   editable position form state populated from the immutable snapshot rows.
   Render a **Holdings** section before **Manual assets** and **Liabilities**;
   each holding retains account label, ticker/security identity/type, shares,
   basis, price, price provenance, and the recorded close timestamp required
   by the RPC. All three sections are submitted as one Zod-validated complete
   payload. Preserve decimal strings until submission and retain source IDs
   from the copied rows.
3. Make error handling truthful: show the refresh/latest-revision warning only
   for the stable leaf-conflict response, refetch the affected snapshot list
   in that case, and present a non-sensitive actionable validation/save error
   for all other failures. Keep the form open and preserve entered values.
4. Add focused React tests for an uncorrected single snapshot: opening the
   editor shows no conflict warning, shows QQQ/VOO holdings alongside Manual
   assets and Liabilities, and submits all three copied sections through
   `correct_portfolio_snapshot`. Cover the true conflict response separately
   from a generic/validation failure so the latter cannot regress into a false
   leaf warning.
5. Extend the RLS/RPC suite to prove a sole owner snapshot can be corrected,
   produces one immutable replacement with all position/manual-asset/liability
   children copied, and only a snapshot with an existing correction child is
   rejected as non-leaf. Retain cross-user and MFA denial coverage.

## Targeted files and verification

- `supabase/migrations/<timestamp>_phase_6a_2_correction_repair.sql`
- `supabase/tests/rls.sql`
- `src/features/snapshots/CorrectionEditor.tsx`
- `src/features/snapshots/CorrectionEditor.test.tsx` (new focused component
  test) and only narrowly adjacent snapshot tests if required

After implementation, run `npm run build`, `npm run lint`, `npm run test`, and
`npm run test:rls`.
