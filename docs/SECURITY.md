# SECURITY

# SECURITY PHILOSOPHY

This application contains financial information.

Treat all user-specific data as private by default.

Security cannot depend solely on frontend logic.

Frontend UI restrictions are NOT authorization controls.

Authorization must be enforced at the database/backend level.

---

# AUTHENTICATION

Use Supabase Auth.

Do not implement custom password storage.

Support email/password authentication initially.

Require secure passwords.

Require verified email before any financial data is accessible.

Design authentication so additional providers can be introduced later.

---

# SIGNUP ENFORCEMENT

Invite-only must be enforced server-side, not in the UI.

Implement one of:

- An `allowed_signups` table plus a database trigger or Supabase Auth hook that rejects account creation for non-listed emails.
- Disable public signup in Supabase Auth settings and provision users by admin invite only.

Frontend route guards are UX, not access control.

Enable leaked-password protection in Supabase Auth.

Enforce minimum password length and complexity server-side.

Design so MFA (TOTP) can be added later without schema changes.

---

# AUTHENTICATION HARDENING

Enable Cloudflare Turnstile on sign-in, sign-up, and password reset.

It is free, natively supported by Supabase Auth, and blocks credential-stuffing and automated signup abuse.

Password reset and sign-in responses must be identical whether or not the email exists.

No user enumeration.

Rate limit auth endpoints.

## MFA-3 operational configuration and release gate

Cloudflare Turnstile is enabled in Supabase Auth for sign-up, password sign-in,
and password reset. The browser receives only `VITE_TURNSTILE_SITE_KEY`; its
matching secret is entered directly in the Supabase dashboard and is never a
repository value or `VITE_*` secret. The application sends each short-lived
Turnstile response only as Supabase Auth's `options.captchaToken`.

Before enabling public registration, two reviewers must record the following
dashboard evidence together: Turnstile enabled with its secret; exact local and
production widget origins; Supabase Site URL and redirect URLs; email
confirmation enabled; password length/complexity and leaked-password protection;
auth rate limits; MFA/TOTP API availability; and public registration still
disabled. Exercise sign-in, sign-up, reset, verified-email callback, MFA
challenge, factor enrollment, factor removal, and recovery export against the
production candidate. Only after both reviewers approve that evidence may the
operator enable public sign-up in Supabase Auth. This code change does not and
must not enable that dashboard setting.

Password reset always confirms with the same text for existing and
non-existing email addresses. Other Auth failures are generic. Verified-email
registration and password recovery both return through `/auth/callback` to set
a password. TOTP users should maintain a separately stored second factor; no
recovery codes or support-mediated factor reset exist. Removing the final
verified factor requires a fresh challenge and deliberately returns future
password sessions to AAL1.

## Recovery export

The Data & recovery settings section creates an immediate versioned JSON
**recovery export** through paginated RLS-protected reads. It includes every
current and immutable owned collection, validates each response before use,
renders numeric values as decimal strings, and aborts rather than producing a
partial file. The export exists only in browser memory long enough to download;
it is not cached, logged, uploaded, emailed, or retained, and its object URL is
revoked after the download begins. Users should keep it encrypted in private
local storage. The monthly setting is a user-operated reminder shown when the
settings page is opened; it never creates an unattended export.

Use Supabase's built-in limits and do not raise them.

Provide a visible "sign out of all sessions" action.

Set a short JWT expiry and rely on refresh-token rotation.

---

# MULTI-FACTOR AUTHENTICATION

Implement MFA using Supabase Auth's built-in TOTP support.

It is available on the free plan and requires no third-party service.

Requirements:

- Enrollment flow: generate a factor, display the QR code, verify a code before the factor is marked verified.
- Challenge flow on sign-in for any user with a verified factor.
- Store no secrets client-side. Supabase manages the factor secret.
- Provide recovery: allow enrolling a second factor. Document what happens if a user loses their authenticator.
- Allow unenrolling, but require a valid challenge first.

Prefer TOTP over emailed one-time codes.

Email OTP is weaker (mailbox compromise defeats it, delivery is unreliable, and free-tier email sending is rate-limited) and is not simpler to build.

Enforce MFA at the database layer, not only in the UI.

Supabase exposes the session's Authentication Assurance Level in the JWT.

Write RLS policies on financial tables that require `aal2` for accounts that have a verified factor, so that a session which has not completed a challenge cannot read financial rows even if the frontend is bypassed entirely.

MFA is not a V1 blocker but must be delivered before the app holds real financial data for more than one user.

Design the auth flow in V1 so adding it later requires no schema change.

---

# SESSION STORAGE

The Supabase client stores the session in `localStorage` by default, which is readable by any script running on the page.

Make this an explicit decision and document it in the threat model.

For V1, `localStorage` is acceptable given a strict CSP, no third-party scripts, and no `dangerouslySetInnerHTML`.

Record that as an accepted risk with those three controls named as the mitigation.

Do not add third-party analytics, tag managers, chat widgets, or ad scripts to the authenticated application.

Any of them silently voids that mitigation.

---

# USER DATA ISOLATION

Every private user-owned record must contain or inherit ownership from a user ID.

Every relevant Supabase table must have Row Level Security enabled.

Policies must prevent:

User A from reading User B's information.

User A from updating User B's information.

User A from deleting User B's information.

User A from creating records on behalf of User B.

Never trust a user_id provided by the browser.

Use authenticated user identity from the JWT/database context.

---

# DATABASE PRIVILEGES

Follow least privilege.

Do not assume RLS alone is enough.

Configure grants appropriately for:

- anon
- authenticated
- service/backend access

Only allow anonymous access to explicitly public resources.

---

# ANONYMOUS ACCESS SCOPE

The public demo uses bundled deterministic data, not database rows.

Therefore the anonymous role requires no table access whatsoever.

Explicitly revoke all privileges on all tables, sequences, functions, and views in the application schema from the `anon` role, and grant nothing back.

Assert this in a test so a future migration cannot quietly widen it.

Do not enable Supabase Realtime unless a feature requires it.

If it is enabled, verify that RLS applies to Realtime subscriptions and test it the same way as direct reads.

Restrict which schemas are exposed through the Data API to only what the application needs.

---

# DATABASE FUNCTION SECURITY

Default all Postgres functions to `SECURITY INVOKER`.

Any function that genuinely requires `SECURITY DEFINER` must:

- Pin `SET search_path = ''` and fully schema-qualify every reference.
- Be documented with a comment explaining why elevation is required.
- Validate that the caller owns the affected rows using `auth.uid()`.

Never accept `user_id` as a function parameter for authorization.

Derive identity from `auth.uid()` inside the function.

Explicitly `REVOKE ALL ON ALL FUNCTIONS FROM PUBLIC, anon` and grant back only what is needed.

Enabling RLS does not restrict function execution.

Do the same for views.

Views can leak past RLS if defined carelessly.

---

# SECRET MANAGEMENT

Never put secrets in:

- React code
- repository files
- public environment variables
- VITE_* environment variables
- committed configuration files

The following must remain server-side:

- market-data secret keys
- Supabase secret/service credentials
- future AI API keys
- privileged tokens

The Supabase publishable key may be used in the browser as designed, but security must rely on correctly configured RLS.

Include:

`.env.example`

but never commit actual `.env` files.

Never commit the Supabase service role key.

If it is ever exposed, rotate it immediately and document the incident.

---

# INPUT SECURITY

Validate all client-provided values.

Use Zod or equivalent validation.

Validate:

- ticker symbols
- numeric values
- shares
- prices
- dates
- goals
- contribution values
- scenario assumptions
- user-generated names

Reject:

- negative share quantities where inappropriate
- NaN
- Infinity
- impossible dates
- malformed UUIDs
- unexpected enum values
- oversized strings

---

# CROSS-SITE SCRIPTING (XSS)

React escapes rendered values by default.

Do not defeat that.

Hard rules:

- Never use `dangerouslySetInnerHTML`. If a case seems to require it, stop and raise it rather than implementing it.
- Never render user-supplied strings into an `href`, `src`, or `style` attribute without validating the scheme. A value beginning with `javascript:` or `data:` is executable. Allow `https:` and relative paths only.
- Never use `eval`, `new Function`, or dynamic `import()` on any string derived from user input or API responses.
- Do not inject user-supplied text into SVG or chart tooltips as raw markup. Pass it as a text node.
- Treat market-data provider responses as untrusted input. A provider returning an unexpected string is the same risk class as user input.

Bound and sanitize user-generated names (portfolio names, account names, goal names, notes) at the Zod layer: maximum length, allowed character set, and trimmed whitespace.

Reject rather than strip, so the failure is visible.

Ship a Content-Security-Policy that would contain an XSS even if one existed.

Target `default-src 'self'`, an explicit `connect-src` allowlist containing only the Supabase project origin, and `frame-ancestors 'none'`.

Avoid `unsafe-inline` and `unsafe-eval`.

Build the CSP in report-only mode first, verify no legitimate requests are blocked, then enforce.

---

# SQL INJECTION

The Supabase client parameterizes queries.

The injection risk in this project is in code we write ourselves, not in the ORM.

Rules:

- Do not build dynamic SQL by string concatenation inside plpgsql functions. If dynamic SQL is genuinely unavoidable, use `format()` with `%I` for identifiers and `%L` for literals, never `%s`.
- Do not interpolate user input into supabase-js raw filter strings such as `.or()`, `.filter()`, or `.textSearch()`. These accept a string expression and are injectable.
- Use typed builder methods (`.eq()`, `.in()`, `.gte()`) with parameters instead.
- Validate every input with Zod before it reaches a query, including values used for ordering, pagination, and column selection.
- Column and sort names must come from a server-side allowlist, never from a client string.
- Never accept a raw SQL fragment from the client under any framing.

---

# MARKET DATA SECURITY

Market API requests must NOT expose provider credentials to the browser.

Create server-side API endpoints / Edge Functions for market-data access.

Enforce:

- authenticated requests where required
- request validation
- maximum symbol counts
- server-side caching
- sensible refresh limits
- provider rate-limit awareness

---

# EDGE FUNCTION SECURITY

Every Edge Function that touches user data must:

- Verify the JWT and derive identity from it.
- Reject any user identifier supplied in the request body.
- Validate and bound all input (max symbols per request, max string length, allowed enum values).
- Use an explicit CORS allowlist. Never `Access-Control-Allow-Origin: *` on authenticated endpoints.
- Enforce a per-user rate limit backed by the database.
- Return generic error messages to the client. Never return provider errors, stack traces, or internal identifiers.

---

# HTTP SECURITY HEADERS

Ship a Cloudflare Pages `_headers` file configuring at minimum:

- Content-Security-Policy
- Strict-Transport-Security
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin
- X-Frame-Options: DENY (or CSP frame-ancestors 'none')
- Permissions-Policy disabling unused features

No `unsafe-inline` in production if achievable.

Explicitly allowlist the Supabase origin.

Document these in the security README section.

---

# LOGGING AND ERROR HANDLING

Never log balances, positions, net worth, quantities, tokens, or email addresses.

Log identifiers and event types only.

Use React error boundaries.

Never surface raw errors to the UI.

Do not send financial values to any third-party analytics or error reporting service.

---

# GITHUB SECURITY

Configure:

CodeQL.

Dependabot.

Secret scanning compatibility.

`.gitignore`

Security-conscious `.env.example`.

No credentials in commit history.

Use GitHub Actions where useful.

---

# CI AND SUPPLY CHAIN

Commit the lockfile.

Use `npm ci` in CI.

Pin GitHub Actions to commit SHAs, not floating tags.

Set explicit least-privilege `permissions:` in every workflow.

CI must run typecheck, lint, unit tests, and RLS tests on every PR.

Run `npm audit --audit-level=high` in CI and fail the build on high or critical findings.

Add a pre-commit secret scanner (gitleaks or equivalent) so a credential cannot reach a commit in the first place.

Enable GitHub secret scanning and push protection once the repository is public.

Enable branch protection on main.

---

# THREAT MODEL DOCUMENT

Produce `docs/THREAT-MODEL.md` covering:

- Trust boundaries (browser, Supabase Postgres, Edge Functions, market data provider, Cloudflare).
- Assets and their sensitivity.
- Enumerated threats per boundary using STRIDE or equivalent.
- The specific control mitigating each threat.
- Explicitly accepted risks and why.
- Known limitations of the current design.

This document is a deliverable, not optional.

Keep it current as features land.
