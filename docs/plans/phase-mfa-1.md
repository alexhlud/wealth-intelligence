# Phase MFA-1 — database AAL enforcement

## Goal

Make database authorization enforce TOTP MFA independently of the frontend.
This is the first of three deliberately separated prerequisites for open
registration. It owns only PostgreSQL enforcement and its test proof; it adds
no routes, MFA screens, CAPTCHA, registration changes, export, or dashboard
configuration.

## Boundary

The boundary is where authorization is authoritative: `app` tables, RLS, and
the four approved `SECURITY DEFINER` financial-write RPCs. It is separate from
MFA-2 because UI challenge/enrollment cannot secure a handcrafted Data API
request, and separate from MFA-3 because public registration must not open
before this database proof exists.

## Scope

- Add one forward-only migration with an `AS RESTRICTIVE` policy on every
  user-owned table: `profiles`, `portfolios`, `accounts`, `positions`,
  `manual_assets`, `liabilities`, `position_events`, `portfolio_snapshots`,
  `snapshot_positions`, `snapshot_manual_assets`, and `snapshot_liabilities`.
- Each policy evaluates the session JWT's `aal` claim with
  `(select auth.jwt() ->> 'aal')` (treating an absent claim as `aal1`) and the
  caller's verified rows in `auth.mfa_factors`. A user with no verified factor
  may use AAL1 or AAL2, preserving new-account bootstrap. Once any factor is
  verified, that user's AAL1 session cannot read or write and only AAL2 is
  sufficient. Unverified factors never activate the gate.
- Apply the gate to `USING` and `WITH CHECK`; restrictive composition preserves
  existing ownership policies, forced RLS, grants, and anonymous revocations.
- Put the same predicate at the entry of all four `SECURITY DEFINER` RPCs:
  `create_position`, `edit_position`, `create_portfolio_snapshot`, and
  `correct_portfolio_snapshot`. These functions must not bypass the new rule
  just because their elevation bypasses caller RLS. Any narrowly scoped helper
  remains `SECURITY INVOKER`, pins `search_path` to empty, is not executable by
  browser roles, derives identity/AAL from Auth only, and is called before a
  financial read or write.
- Extend the pgTAP suite. For a user with a verified factor, prove an AAL1 JWT
  reads zero owned financial rows and cannot use either direct writes or all
  four elevated RPCs; changing only the JWT AAL to AAL2 restores permitted
  owner access. Cover current-state and immutable snapshot tables, no-factor
  AAL1 bootstrap, unverified-factor behavior, AAL2 cross-user isolation, and
  retained anon denial.

## Implementation targets

- `supabase/migrations/<timestamp>_phase_mfa_1.sql`
- `supabase/tests/rls.sql`
- `supabase/tests/snapshots.sql`

No new packages, tables, frontend code, or Auth dashboard settings are part of
this phase.

## Acceptance

- All listed tables have forced RLS and the restrictive MFA policy.
- All four elevated RPCs reject AAL1 for a verified-factor owner before their
  normal logic can read or alter financial rows.
- The required AAL1/AAL2 test matrix passes with the existing isolation,
  privilege, history, and atomicity tests.
- `npm run test:rls`, `npm run build`, `npm run test`, and `npm run lint` pass.

## Out of scope

Enrollment/challenge/factor UI, Turnstile, registration, password reset,
exports, reminders, documentation updates, and opening registration.
