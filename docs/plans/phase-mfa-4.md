# Phase MFA-4 — challenge exit safety

## Goal

Make every way of leaving the MFA challenge terminate the incomplete AAL1
session before routing to sign-in, so a person can switch accounts or restart
without clearing browser storage.

## Scope

- Add one challenge-exit operation in the MFA feature that, in order, prevents
  duplicate exits, clears transient challenge UI state, signs out the local
  Supabase session, clears the TanStack Query cache, and replaces the current
  history entry with `/auth`.
- Use that operation for the visible **Return to sign in** control.
- Handle browser Back while the MFA challenge is mounted as the same exit;
  after session termination it must land at `/auth`, not revisit a protected
  route that can redirect to the challenge.
- Audit challenge controls for cancellation behavior. The current challenge
  has no distinct cancel control; if one is present after implementation it
  must call the same operation. Retry remains in place because it does not
  leave the challenge.
- Add a focused component/router test using mocked Supabase Auth and a query
  client. It will prove the return action signs out, clears cached data,
  clears challenge-local state, and renders the sign-in page without a bounce
  back to `/auth/mfa`. Add a browser-history/back-path assertion to the same
  test suite.

## Implementation targets

- `src/features/auth/MfaPages.tsx`
- `src/features/auth/MfaPages.test.tsx` (new)

No dependencies, schema changes, RLS policy changes, or styling changes are
needed.

## Verification

Run `npm run build`, `npm run lint`, `npm run test`, and `npm run test:rls`.

## Out of scope

Changing the general authenticated-route guard, global sign-out confirmation,
MFA enrollment/removal behavior, or Supabase dashboard configuration.
