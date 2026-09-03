# Phase MFA-2 — TOTP user experience

## Goal

Deliver Supabase Auth-native TOTP enrollment, challenge, recovery-factor, and
session-management UX on top of MFA-1's authoritative database gate.

## Boundary

MFA-2 owns browser interaction with Supabase Auth only. MFA-1 already decides
whether data access is allowed; this phase makes legitimate users able to
complete that path. CAPTCHA, public registration, password reset, recovery
export, reminders, and enabling registration belong to MFA-3.

## Scope

- Add an authenticated security/settings route and focused auth components.
  List factors and assurance level from Supabase; never infer either from UI
  state or store factor secrets locally.
- Enroll TOTP with `mfa.enroll`, render Supabase's QR code and manual setup
  value only for the active interaction, then challenge and verify the entered
  code. Clear QR/URI/challenge state on success, cancel, sign-out, route change,
  and unmount. Successful verification upgrades the current session to AAL2.
- After password sign-in and on session changes, route
  `currentLevel: aal1, nextLevel: aal2` to an MFA challenge before application
  content or financial queries load. AAL1/AAL1 users have no verified factor:
  offer enrollment but retain the MFA-1 bootstrap path. Handle stale level
  transitions by refreshing then routing to challenge/enrollment rather than
  rendering an authorization failure.
- Allow a second verified TOTP factor as recovery. Explain that it should live
  on another device/app; Supabase supplies no recovery codes and loss of every
  factor cannot be restored by this application.
- Permit factor removal only from an AAL2 session after a fresh successful
  TOTP challenge in the same management flow, including the final verified
  factor. Show an explicit warning that final-factor removal lowers protection
  and lets future password sessions use AAL1; require deliberate confirmation.
- Add confirmed global sign-out, clearing query cache and transient MFA state.
  Use generic authored errors, safe factor metadata only, accessible labels,
  focus management, status/error announcements, and no factor-code logging.

## Implementation targets

- `src/features/auth/*`, `src/App.tsx`, `src/components/AppShell.tsx`, targeted
  auth/session tests, and only required Midnight Scope styling.

No new package is planned; the existing Supabase client exposes the MFA APIs.

## Acceptance

- Unit/component coverage verifies enrollment QR/code lifecycle, challenge
  routing, valid/invalid verification, second factor enrollment, fresh
  challenge plus explicit warning before every removal (including the last),
  stale sessions, accessibility, and global sign-out/cache clearing.
- MFA-1's RLS suite continues to pass, along with build, unit tests, and lint.

## Out of scope

Turnstile, open registration, password reset, export/recovery reminder,
documentation enablement checklist, recovery codes, phone/SMS MFA, and support
MFA resets.
