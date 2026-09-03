# Phase 3b-3 — Registration callback and zero-data holdings remediation

## Goal

Repair two production failures in the first-run path without expanding the
Phase 3 application scope:

1. Route Supabase email-confirmation callbacks to confirmation completion,
   while retaining the password-setting screen exclusively for password
   recovery (and the pre-existing invite password flow, if its explicit
   callback type requires it).
2. Ensure an authenticated user with no existing records receives their
   primary portfolio and reaches the Holdings empty state, rather than a
   permanently pending loading screen.

## Findings

### Callback and password validation

- `AuthCallbackPage` currently branches only on the presence of a session.
  Both a signup confirmation and a recovery link establish a session, so a
  confirmed signup is incorrectly rendered as the recovery password form.
- The callback must instead retain and use Supabase's callback/event type.
  Recovery must be the only type that renders “Set a new password”; signup
  confirmation must continue into the authenticated workspace without asking
  for a replacement password.
- The sign-up form currently validates through `signInInputSchema`, while the
  callback validates through `invitationPasswordInputSchema`. They encode the
  same intended 8–128-character bounds but use different error-mapping paths.
  The broad mapper reports the range message for any password issue, including
  a valid-length password rejected by another constraint/path. This produces
  misleading copy and makes the two paths look inconsistent.

### Empty holdings never settles

- `app.ensure_primary_portfolio()` already provides the required idempotent,
  `SECURITY INVOKER` initialization path; the client Holdings query does not
  invoke it.
- With no primary portfolio, `getPortfolio` rejects. Its dependent accounts
  and positions queries are disabled, but TanStack Query represents disabled
  queries as pending before they have fetched. `HoldingsPage` checks the three
  pending flags before the portfolio error, producing a permanent “Loading
  your holdings” screen.

## Scope and implementation plan

### 1. Make callback intent explicit

- Update `src/features/auth/session.ts` with the smallest typed callback-state
  helper/hook necessary to retain the Supabase auth transition that established
  the callback session. It will recognize only the supported signup,
  recovery, and invite/password-setup cases, and will not log tokens, email
  addresses, or session contents.
- Update `src/features/auth/AuthPages.tsx` so `/auth/callback` shows the
  recovery password form only for a recovery callback. A successful signup
  confirmation will navigate to `/holdings`; an unknown, expired, or
  unauthenticated callback will receive the existing safe, non-enumerating
  email/sign-in guidance rather than a password form.
- Preserve the current `emailRedirectTo`/`redirectTo` callback URLs and all
  Turnstile handling. This change does not alter server-side sign-up policy,
  password policy, MFA, RLS, or introduce a client-supplied identity.

### 2. Establish one shared password rule and accurate messages

- Update `src/lib/validation.ts` to derive sign-in, sign-up, recovery-update,
  and invitation-password inputs from one named 8–128-character password
  schema. Its failures will distinguish an under-length password, an
  over-length password, and any future explicit policy rule rather than
  reporting a range failure indiscriminately.
- Update the auth submit branch to select the schema that matches its current
  mode. The client rule will match the documented 8–128-character constraint;
  Supabase remains the server-side authority for its configured password and
  leaked-password policies.

### 3. Make first-run portfolio initialization and query states deterministic

- Update `src/features/portfolio/PortfolioPage.tsx` so the primary-portfolio
  query calls the existing `ensure_primary_portfolio` RPC and parses its
  untrusted response before child account/position queries start. The RPC has
  no `user_id` input and derives identity from `auth.uid()`, so this does not
  weaken RLS or bypass authorization.
- Order Holdings state handling so an actual query failure renders the shared
  retryable error state before evaluating dependent loading flags. Child
  queries remain disabled until a validated portfolio exists.
- With a successful newly-created portfolio and zero accounts, retain the
  established Holdings empty state and its “Go to accounts” action. Initial
  loading, empty, error/retry, and background-refresh/stale states will remain
  separately represented.
- Apply the same primary-portfolio initializer deliberately only where this
  first-run bug proves it is required; do not broaden this patch into a
  refactor of unrelated data surfaces.

## Tests

- Add focused auth component tests (new `AuthPages.test.tsx`) that mock the
  safe session/callback intent boundary and prove a signup confirmation routes
  to Holdings rather than rendering recovery copy. Cover recovery separately
  so the password-update screen remains available only for its intended flow.
- Extend `src/lib/validation.test.ts` to prove the shared password rule accepts
  exactly eight characters (including `timmy123`), rejects fewer than eight
  and more than 128, and maps each failure to accurate copy.
- Extend `src/features/portfolio/PortfolioPage.test.tsx` with a zero-data
  response: the primary-portfolio initializer returns a valid portfolio while
  accounts and positions return empty arrays; assert the account-first empty
  state appears and the loading text disappears. Also cover initializer/query
  failure reaching the retryable error state, rather than a permanent loading
  state.

## Boundaries

- No database migration, RLS-policy change, dashboard configuration change,
  market-data work, financial calculation change, or new package.
- No raw Supabase error, token, email address, or financial value will be
  logged or surfaced.
- The work preserves exact decimal-string handling and formats money only at
  render time.

## Verification

Run, in order, `npm run build`, `npm run lint`, `npm run test`, and
`npm run test:rls`. The phase is complete only when all four pass and the new
auth and zero-data state tests are present.
