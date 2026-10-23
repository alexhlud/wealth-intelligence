# Password recovery route-regression repair

## Goal

Restore the recovery flow's invariant: a session established by a recovery
link must remain inside recovery until its required TOTP challenge is complete
and a new password has been saved. It must never mount the ordinary
authenticated application merely because the browser lands on the default
authenticated route.

## Confirmed cause

Phase 5a changed the catch-all route from `/holdings` to `/`. The catch-all is
outside the authenticated route boundary and has no understanding of an Auth
recovery handoff. Once Supabase has established an AAL1 recovery session, any
landing that does not match the exact `/auth/callback` recovery route is
redirected into the ordinary `/` route and treated as a normal authenticated
session. `MfaGuard` does not know that the session was created for password
recovery, so this bypasses the callback's recovery-specific assurance check.

The existing tests do not exercise that router path. They mount
`AuthCallbackPage` directly, supply an explicit `flow=recovery`, and provide
only `/holdings` as the successful destination. They therefore prove the
callback component's local behavior but cannot catch a wildcard/default-route
escape introduced by Phase 5a.

## Scope

- Preserve recovery intent across the email-link handoff in a narrowly scoped,
  browser-local marker that is cleared only after a successful password update
  or explicit recovery failure/exit.
- Make the authenticated entry guard route a pending recovery session to the
  recovery callback/continuation before ordinary workspace routes can mount.
- Keep the recovery callback's existing AAL check and TOTP continuation;
  after a verified-factor challenge it must still withhold `updateUser` until
  verification succeeds.
- Make all normal successful destinations use the Phase 5a home route `/`.
  Signup confirmation and ordinary sign-in remain ordinary authenticated
  flows, not recovery flows.
- Add app-router-level regression coverage using the actual default and
  wildcard routing structure, in addition to the focused callback tests.

## Implementation targets

1. `src/features/auth/AuthPages.tsx` — introduce the minimal recovery-handoff
   state and clear it only at safe terminal states; ensure direct recovery
   processing establishes it before a session can be used as ordinary access.
2. `src/App.tsx` (or a small auth-routing helper) — place the recovery-aware
   gate ahead of the workspace routes so a pending recovery session cannot
   reach `/`, `/holdings`, or another private page. Keep unauthenticated
   routing behavior unchanged.
3. `src/features/auth/AuthPages.test.tsx` and/or a focused app-route test —
   render the real route tree with a recovery session and default/wildcard
   landing. Assert it renders the recovery MFA/password sequence, never the
   dashboard, and cannot call `updateUser` before challenge verification.
   Retain direct-reset, invalid-link, signup-confirmation, and normal sign-in
   coverage.

## Security constraints

- A route redirect must never substitute for recovery completion.
- Never infer recovery completion from session existence or AAL1 alone.
- Do not store tokens, TOTP codes, factor IDs, or user IDs in browser-local
  handoff state.
- On invalid recovery state, show the enumeration-safe request-new-link state
  rather than granting ordinary application access.

## Verification

Run after implementation:

1. `npm run build`
2. `npm run lint`
3. `npm run test`
4. `npm run test:rls`

## Out of scope

MFA enrollment/removal policy, Supabase dashboard redirect configuration,
database/RLS changes, and dashboard functionality.
