# Phase auth-recovery-mfa — require an authenticator after password recovery

## Goal

Complete password recovery for accounts with verified TOTP factors by requiring
the second factor after the recovery email establishes AAL1 and before calling
`supabase.auth.updateUser`. Keep direct password reset intact for accounts with
no verified factor.

## Confirmed cause

The recovery link creates an authenticated, single-factor (AAL1) session. For
an account that has a verified MFA factor, Supabase Auth rejects password and
email updates unless the session is AAL2. This is the server-side cause of the
observed `401 /auth/v1/user`, not a missing recovery session or an empty URL
fragment.

The repository already contains the correct assurance test in `MfaGuard`:
`currentLevel === 'aal1' && nextLevel === 'aal2'`. Its existing challenge and
verify flow promotes the current session to AAL2. That exact pattern is the
recovery flow's required intermediate step.

## Scope

- After successful recovery-link session establishment, call
  `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` before rendering the
  new-password form.
- If the session is AAL1 and the next level is AAL2, render the existing TOTP
  challenge experience first. A successful verification promotes the recovery
  session to AAL2, then reveals the password form; `updateUser` remains
  unavailable until this succeeds.
- If the session is AAL1 with next level AAL1, render the password form
  directly. This preserves recovery for accounts without a verified factor.
- Reuse the MFA factor selection, challenge, code validation, and verification
  behavior rather than creating a second TOTP implementation. Refactor the
  existing challenge surface only as needed to let it invoke a recovery-specific
  continuation after successful verification, while preserving its current
  sign-in exit and `/holdings` behavior.
- On MFA lookup, factor-list, challenge, or verification failure, show the
  existing safe security-action error/retry experience. Do not expose provider
  messages, session data, factor identifiers, account existence, or recovery
  token details.
- If the recovery session is invalid, retain the existing enumeration-safe
  request-a-new-link state. Do not use an ordinary authenticated-route redirect
  that might send the recovery session into `/auth/mfa` or `/holdings`.
- Preserve signup confirmation handling: confirmed signup links establish a
  session and land in `/holdings` without rendering either the recovery
  password form or the recovery MFA screen.

## Implementation targets

- `src/features/auth/AuthPages.tsx` — add the recovery assurance checkpoint
  and state transitions: establishing recovery session, assessing AAL,
  challenging (when required), and setting the password.
- `src/features/auth/MfaPages.tsx` — extract or parameterize the present
  authenticator challenge UI so recovery can reuse it with a continuation,
  without changing the sign-in route's established exit behavior.
- `src/features/auth/AuthPages.test.tsx` — add recovery-AAL test coverage and
  retain signup and direct-reset regression coverage.
- `src/features/auth/MfaPages.test.tsx` — adjust/add coverage only if the
  extraction changes the existing challenge's public behavior, including its
  local sign-out exit and browser-back safety.

No dependencies, database migrations, RLS changes, RPCs, or Supabase dashboard
configuration changes are required.

## Required tests

- Recovery with `currentLevel: 'aal1'`, `nextLevel: 'aal2'` renders a TOTP
  challenge, calls `mfa.challenge` then `mfa.verify`, and does **not** call
  `updateUser` until verification succeeds. After verification, it renders the
  password form and a successful submission calls `updateUser`.
- Recovery with `currentLevel: 'aal1'`, `nextLevel: 'aal1'` renders the
  password form directly and calls `updateUser` successfully without any MFA
  challenge or verification call.
- Keep/reconfirm invalid or expired recovery-link handling, signup confirmation
  routing, normal password sign-in, and existing MFA challenge exit coverage.

## UX and security requirements

- Use the existing Midnight Scope auth-panel and accessible form/error patterns.
  The recovery challenge copy must explain that an authenticator code is needed
  to finish resetting the password; it must not imply the presence of a factor
  before the authenticated recovery session has been verified.
- Retain one-time-code autofill, focus handling, Zod validation, disabled
  double-submit protection, and `role="alert"` error messaging.
- The recovery email is the first factor and TOTP is the second; password
  updates are only enabled after both prove possession. The browser never logs
  or displays recovery tokens or TOTP values.

## Verification

Run after implementation:

1. `npm run build`
2. `npm run lint`
3. `npm run test`
4. `npm run test:rls`

## Out of scope

- MFA enrollment/removal policy, recovery codes, phone/SMS MFA, support-based
  account recovery, and changes to Supabase's AAL enforcement.
- General authenticated-route guard changes or unrelated sign-in/MFA redesign.
