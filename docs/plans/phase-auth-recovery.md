# Phase auth-recovery — reliable password-recovery callback

## Goal

Make a Supabase password-recovery link establish its recovery session before a
password update can be submitted, and give a safe, actionable outcome when a
link is missing, expired, or has already been used.

## Investigation finding

`src/lib/supabase.ts` enables Supabase's automatic URL-session detection.
That initialization consumes the recovery credentials from the URL fragment,
while `AuthCallbackPage` only observes a later `useSession()` value and treats
every `updateUser` failure as a generic retryable error. The callback has no
explicit recovery-token lifecycle or invalid-link state. A page can therefore
render its password form without the callback itself having established and
verified the recovery session that authorizes `updateUser`.

## Scope

- Make the recovery callback capture and process the Supabase recovery
  credentials before routing/UI code can clear the fragment. Establish the
  recovery session explicitly, and only enable/render the password form after
  that operation has succeeded with a usable session.
- Preserve the existing query-string `flow=recovery` routing contract; do not
  rely on a fragment remaining available after Supabase processes it.
- Add a distinct invalid-recovery-link state for a missing, expired, or
  already-used recovery credential. The state must not disclose whether an
  email address has an account.
- Provide a clear action from that state to request another recovery link,
  returning to the existing reset request flow whose confirmation remains the
  enumeration-safe `resetNotice` copy.
- Retain generic handling for unrelated Auth failures; do not surface provider
  error text or tokens.
- Add focused callback tests that prove:
  - a valid recovery token establishes the session and permits
    `updateUser({ password })`, then routes to `/holdings`;
  - missing recovery credentials render the request-a-new-link state and do
    not call `updateUser`;
  - expired/used recovery credentials render that same safe state and do not
    call `updateUser`.

## Implementation targets

- `src/lib/supabase.ts` — expose a recovery-safe, explicit callback-session
  handoff without weakening persistent-session behavior for normal auth.
- `src/features/auth/AuthPages.tsx` — own the recovery exchange state machine,
  gate submission on a verified session, and render the safe re-request path.
- `src/features/auth/AuthPages.test.tsx` — extend Supabase/Auth mocks and add
  success and invalid-link coverage.

No new dependencies, database migrations, RPCs, schema changes, RLS policy
changes, or dashboard-configuration changes are required.

## UX and security requirements

- The invalid-link message will explain that the link is no longer usable
  because recovery links expire and can be used once, without tying that fact
  to any email address.
- Its primary action will be **Request a new recovery link** and must lead to
  the existing reset form; the reset submission continues to say, “If an
  account matches that email address, a recovery link is on its way.”
- Keep password input at `autoComplete="new-password"`, retain Zod validation,
  prevent duplicate submission, and use the established auth-panel styles and
  accessible status/alert semantics.
- Recovery credentials never enter logs, visible copy, query strings, or
  application state beyond the Supabase Auth exchange.

## Verification

Run all required checks after implementation:

1. `npm run build`
2. `npm run lint`
3. `npm run test`
4. `npm run test:rls`

## Out of scope

- Changes to signup confirmation, sign-in, MFA, global sign-out, or protected
  route behavior.
- Supabase dashboard redirect URLs, email-template changes, token lifetime
  changes, and custom recovery-email delivery.
