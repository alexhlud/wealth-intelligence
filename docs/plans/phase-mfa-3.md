# Phase MFA-3 — open registration and recovery export

## Goal

Complete the remaining open-registration prerequisites after MFA-1 and MFA-2:
Supabase-native Cloudflare Turnstile for Auth flows, public registration and
password reset UX, and a user-operated recovery export.

## Boundary

MFA-3 changes public Auth entry points and recovery behavior only after the
database layer and MFA challenge UX are accepted. It does not alter MFA-1 RLS
or privileged RPC enforcement.

## Scope

- Create a Cloudflare Turnstile widget restricted to production/local origins.
  Enable Supabase Auth CAPTCHA protection and store the Turnstile secret only
  in the Supabase dashboard. Supply the public site key as deployment
  configuration; it is not a secret and no secret enters `VITE_*`, code, or
  the repository.
- Render/reset an accessible widget for sign-up, password sign-in, and password
  reset; forward the response as `options.captchaToken` to `signUp`,
  `signInWithPassword`, and `resetPasswordForEmail`. Keep errors generic and
  reset responses identical for existent/non-existent email addresses.
- Replace invitation-only copy with verified-email open registration and
  recovery-link password reset handling. Keep public sign-up disabled until
  the final operational checklist passes, then enable it through the reviewed
  Supabase dashboard procedure.
- Add a Data & recovery settings section with immediate download of a versioned
  JSON **recovery export** and a configurable monthly user-operated reminder.
  It is never called a backup: no unattended automated backup is built. The
  existing no-automated-backup risk remains accepted in the threat model.
- Build the export from RLS-protected, paginated reads of every owned current
  and immutable collection. Validate untrusted responses with Zod, preserve
  NUMERIC values as decimal strings and UTC timestamps/UUIDs exactly, include
  export/schema version and generated-at UTC time, reject incomplete exports,
  and do not cache, log, email, or otherwise retain financial data. Revoke its
  object URL after download and explain secure local storage to the user.
- Update security/threat-model/deployment documentation with dashboard-only
  secret handling, CAPTCHA/MFA configuration evidence, recovery-factor and
  last-factor-removal behavior, recovery-export limits, retained accepted
  no-automated-backup risk, and the final open-registration checklist.

## Implementation targets

- `src/features/auth/*`, `src/features/export/*`, settings UI, auth/export
  tests, `src/lib/validation.ts`, only required styling, `.env.example`, and
  `docs/SECURITY.md` / `docs/THREAT-MODEL.md`.

No new package or Edge Function is planned; Supabase Auth natively verifies
Turnstile response tokens.

## Acceptance

- Tests cover CAPTCHA token/reset behavior, generic Auth failures, verified
  email registration/reset, complete recovery-export shape and cleanup,
  response rejection, pagination/no partial success, and reminder behavior.
- A documented two-person dashboard checklist proves CAPTCHA, secrets, exact
  origins, password/email policy, rate limits, MFA APIs, and pre-release
  closed registration; only then is public sign-up enabled.
- Build, unit tests, RLS tests, and lint pass.

## Out of scope

Automated/unattended backups, storage/email delivery of exports, recovery
codes, phone/SMS MFA, support-mediated factor reset, and unrelated roadmap
work.
