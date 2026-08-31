# Phase 0.5 — Thin Vertical Slice Plan

## Objective

Prove the smallest secure production path across the React client, Supabase
Auth/Postgres, Row Level Security, automated tests, and Cloudflare Pages:

1. An invited user accepts an administrator-provisioned Supabase Auth invite,
   sets a password, verifies their email if required by the invite flow, signs
   in, and signs out. The existing sign-up UI remains available but, with
   Supabase public sign-up disabled, gives a single non-enumerating access
   message to uninvited visitors.
2. The user's single primary portfolio is created automatically.
3. The user adds one investment position containing a symbol, quantity, and
   average cost.
4. The protected portfolio view renders its market value from a deliberately
   hard-coded, clearly labeled USD price source. No market-data API, caching,
   quote table, account model, editing, or history UI is included.
5. Automated RLS tests prove one authenticated user cannot read another user's
   position rows, and that `anon` has no application-table privileges.
6. The built client is deployed to the configured Cloudflare Pages production
   URL and the production flow is smoke-tested.

This is intentionally a narrow slice. It does not begin later roadmap work
such as public demo data, market-data providers, accounts, position edits,
position-event history, snapshots, MFA, or dashboard breadth.

## Current repository findings

- The repository already contains a Vite + React + TypeScript scaffold and a
  small Supabase browser client using only the publishable key.
- Supabase, React Router, TanStack Query, Zod, Tailwind, and Lucide are already
  installed. No production dependency is needed for the slice.
- Cloudflare Pages configuration and `public/_headers` and
  `public/_redirects` already exist. This phase extends only the existing
  headers file with a report-only CSP.
- The design guide is at the repository root as `DESIGN.md`, as required by
  the current `AGENTS.md`.

## Proposed implementation boundaries

### Client

Targeted files to create or update:

- `src/main.tsx` — install router and TanStack Query providers.
- `src/App.tsx` — replace the connection probe with route composition only.
- `src/lib/supabase.ts` — retain the browser client using only
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; document the
  accepted localStorage-session risk in the threat-model work when that phase
  begins.
- `src/lib/validation.ts` — Zod schemas for trimmed, uppercase ticker symbols;
  positive finite decimal strings for quantity and average cost; and bounded
  display names. Values will remain strings at the browser/database boundary
  so JavaScript floating-point values are not persisted.
- `src/features/auth/*` — sign-up, sign-in, verification-pending, and sign-out
  UI plus a session hook. Auth error copy will not disclose whether an email
  exists.
- `src/features/portfolio/*` — protected portfolio query, empty state, and one
  add-position form. The view will calculate display value from an explicit
  `HARDCODED_USD_PRICE_BY_SYMBOL` map/constants module and identify it as a
  temporary fixed price.
- `src/routes/*` — public auth routes, an email-confirmation callback route,
  and a protected portfolio route. Route protection is UX only; database RLS
  remains the authorization boundary.
- `src/index.css` — only the small set of shared tokens and accessible focus,
  loading, error, and empty states needed for this slice, using the documented
  restrained lavender/white design direction.

No user-controlled content will be rendered as HTML or used as a URL/style.
Financial values will be formatted only at the rendering boundary.

### Database migration

Create one deterministic migration under `supabase/migrations/` that:

1. Creates an application schema and revokes privileges from `anon` on its
   tables, sequences, functions, and views.
2. Creates `portfolios` with UUID primary key, non-null `user_id`, non-null
   name, `is_primary`, and UTC timestamps. It adds a unique constraint that
   permits one primary portfolio per user and a user lookup index.
3. Creates `positions` with UUID primary key, non-null `user_id` and
   `portfolio_id`, uppercase bounded `symbol`, `quantity NUMERIC`,
   `average_cost NUMERIC`, USD currency constraint, and UTC timestamps.
   Constraints reject non-positive quantities/costs and protect the intended
   numeric precision. A foreign key establishes the portfolio relationship;
   a composite ownership check/constraint strategy will ensure a position
   cannot point to another user's portfolio.
4. Enables and forces RLS on both application tables. Policies derive identity
   only from `auth.uid()` and permit authenticated users to select, insert,
   update, and delete only their own rows. Insert policies require
   `user_id = auth.uid()` and require the referenced portfolio to belong to
   the caller. No policy is granted to `anon`.
5. Adds a narrowly scoped, `SECURITY INVOKER` initialization RPC that derives
   the caller from `auth.uid()`, creates that caller's primary portfolio with
   `INSERT … ON CONFLICT`, and returns it. It accepts no `user_id`; the
   function is granted only to `authenticated` after revoking public and anon
   access. The client calls it after a verified session is established, then
   queries the resulting portfolio.

All ownership enforcement resides in the database. The browser never receives
or supplies a trusted user identity, and the service-role key is not used by
the client.

## Authentication and lifecycle

1. The sign-up screen validates email/password locally and can attempt the
   normal email/password sign-up flow, but the Supabase dashboard will have
   public sign-ups disabled. Its rejected result is mapped to one generic,
   non-enumerating message: "We couldn’t create an account with those details.
   If you have an invitation, use the link in its email." The client never
   decides who is eligible. Administrators provision allowed users through
   Supabase Auth invites; the invite redirect returns to the deployed callback
   route so the invited user can set a password and establish a session.
2. Supabase Auth configuration, not frontend logic, will require confirmed
   email before the portfolio route can initialize data. The confirmation
   callback exchanges/reads the session and redirects only an eligible session
   to the portfolio route; otherwise it displays a verification-pending state.
3. On a verified authenticated session, the client invokes the idempotent
   primary-portfolio initialization RPC. RLS protects all subsequent reads and
   writes even if a route guard is bypassed.
4. Sign-out calls Supabase Auth sign-out, clears client query cache, and returns
   to sign-in.

The Supabase dashboard will be configured by the project owner before
production testing to disable public sign-ups, configure invite/callback URLs,
enable email confirmation, password requirements and leaked-password
protection, short JWT expiry with refresh-token rotation, native rate limits,
and Turnstile. Invite-only enforcement is deliberately temporary for Phase
0.5: it uses Supabase Auth admin invites. The `allowed_signups` table plus
Auth hook approach is deferred to V1; it is not built in this phase.

## Tests and verification

Add development dependencies only because the repository currently has no test
runner: Vitest + React Testing Library + jsdom for client/unit tests, and the
Supabase CLI/test harness required to execute SQL RLS tests against a local
Supabase instance. Add `test`, `test:rls`, and any required coverage-free
support scripts to `package.json`.

Planned tests:

- Unit tests for Zod input validation and fixed-price market-value formatting,
  including fractional quantities and invalid/zero/non-finite input.
- Component tests for auth/portfolio loading, empty, validation-error, and
  signed-out states.
- SQL RLS tests with two authenticated test JWT contexts: User A can insert and
  read User A's primary portfolio and position; User B reads zero of User A's
  positions and cannot insert/update/delete rows as User A.
- Privilege test that `anon` has no table, sequence, function, or view access
  in the application schema.
- Build, lint, unit tests, and RLS tests before handoff. The production
  deployment receives a manual smoke test for sign-up/verification/sign-in,
  automatic portfolio creation, adding a position, reload persistence, and
  sign-out.

## Deployment

Use the existing Cloudflare Pages configuration, SPA fallback, and project
connected to `main`; do not add replacement hosting configuration. Extend the
existing `public/_headers` with a report-only CSP that includes the configured
Supabase origin in `connect-src`; move to enforcement only after the production
smoke test confirms legitimate auth/API traffic is not blocked. Cloudflare
environment variables already contain only the Supabase URL and publishable
key, never privileged credentials. Production is
`https://wealth-intelligence.pages.dev`.

## Owner-operated Supabase dashboard checklist

Before deployment smoke testing, the project owner must make these Supabase
Dashboard changes. This implementation stops before performing them.

1. **Authentication → Configuration → General**: disable **Allow new users to
   sign up**. Retain email/password sign-in; this is the server-side invite-only
   enforcement for this temporary phase.
2. **Authentication → URL Configuration**: set **Site URL** to
   `https://wealth-intelligence.pages.dev`; add
   `https://wealth-intelligence.pages.dev/auth/callback` to **Redirect URLs**.
   Add the local callback URL used for development only if needed.
3. **Authentication → Providers → Email**: enable **Confirm email**.
4. **Authentication → Configuration → Password Security**: set the required
   password-strength policy and enable **Leaked password protection** (this
   control requires the appropriate Supabase plan).
5. **Authentication → Configuration → Sessions**: retain refresh-token
   rotation/reuse protection and set the JWT expiry (one hour is the current
   Supabase recommendation for most applications).
6. **Authentication → Rate Limits**: set the production email, sign-in, and
   token-refresh rate limits appropriate for 1–10 trusted users.
7. **Project Settings → Authentication → Bot and Abuse Protection**: configure and enable
   Turnstile with its site key/secret held only in the dashboard and approved
   server-side configuration.
8. **Project Settings → Data API → Exposed Schemas**: add `app`, keep only
   required API schemas exposed, and save. The browser client is configured to
   use this dedicated application schema.
9. **Authentication → Users → Add user → Send invitation**: use this control to provision
   each permitted person. Never invite users through client code.

No Supabase dashboard changes, role concepts, administration views, or user
management UI are part of this phase.

## Completion criteria

After the above decisions are approved and implementation is complete, the
slice is complete only when the production smoke test succeeds and
`npm run build`, `npm run lint`, `npm run test`, and `npm run test:rls` all
pass.

## RLS test remediation

### Objective

Repair the Phase 0.5 database test file so all planned RLS assertions execute,
and broaden its anonymous-role privilege coverage without changing the
application schema or weakening any authorization check.

### Targeted changes

1. Update `supabase/tests/rls.sql` so the update and delete assertions perform
   their data-modifying CTEs at the statement top level. Each assertion will
   still count the `RETURNING` rows and prove that User B affected exactly zero
   of User A's positions; neither assertion will be removed, skipped, or
   converted into an error-only check.
2. Replace the single combined `has_table_privilege` assertion with separate
   assertions for `select`, `insert`, `update`, and `delete` on
   `app.positions`, so no partial anonymous table grant can satisfy the test.
3. Add separate anonymous-role assertions for every requested additional
   surface: `app.portfolios` table privileges, `USAGE` on schema `app`, and
   `EXECUTE` on `app.ensure_primary_portfolio()`. The function check will use
   its exact zero-argument signature.
4. Set `plan(n)` to the exact number of assertions after the expansion. Do not
   restore an `ALTER DEFAULT PRIVILEGES ... ON VIEWS` statement: PostgreSQL
   uses table default privileges for views, and the migration already covers
   that object class.

### Verification

Run `npm run test:rls` against the local Supabase test database and inspect
the TAP output. This remediation is complete only when the command exits zero
and reports every planned test as passing.

## Portfolio numeric-boundary and render-containment remediation

### Objective

Repair the portfolio render crash caused by treating an unvalidated PostgREST
response as the browser's canonical decimal-string position model. Add a
React error boundary so an unexpected render failure is contained by a safe
fallback rather than blanking the application or exposing raw error details.

### Findings

- `getPositions` currently receives untyped Supabase data and uses
  `data as Position[]`. This is a TypeScript assertion only; it neither checks
  nor converts the JSON payload at runtime.
- `Position` consequently promises `quantity` and `average_cost` are strings,
  while the crash proves that the actual `quantity` value crossing this
  boundary is not a string. The unsafe assertion is therefore the fault line,
  not `marketValue`.
- The DOM/React boundary is not protected by an error boundary above
  `PortfolioPage`.

### Contract decision

The browser's canonical decimal representation will remain a validated decimal
string end-to-end after one explicitly named response-normalization boundary.
This preserves the existing exact `BigInt` decimal calculations and ensures
financial values are never converted to JavaScript floating-point numbers for
calculation or persistence.

`getPositions` will parse the untrusted PostgREST response with a dedicated
Zod response schema. The schema will explicitly accept the observed PostgREST
numeric JSON shape (JSON numbers for `quantity` and `average_cost`) as well as
the string form where supplied, then normalize either shape to the same
positive, precision-bounded decimal strings used by `positionInputSchema`.
Invalid, non-finite, unsafe, negative, zero, or over-precision values will
fail at this named boundary and will not reach `prices.ts` or rendering.

### Targeted implementation changes after review

1. Update `src/lib/validation.ts` with shared decimal normalization/validation
   for both form input and the PostgREST position-row response. Export the
   response parser/type so the data contract is visible and no `as Position[]`
   assertion remains.
2. Update `src/features/portfolio/PortfolioPage.tsx` to call that parser in
   `getPositions`, use its canonical position type, and preserve decimal
   strings in the insert payload. Query errors will continue to display only
   generic UI copy.
3. Update `src/features/portfolio/prices.ts` to declare its canonical decimal
   string input contract clearly and retain exact integer-based arithmetic;
   it will not perform implicit number coercion.
4. Add a reusable class-based React error boundary around the routed app in
   `src/App.tsx` (or a narrowly named shared component if the current files
   require it). Its fallback will be generic, contain no error object,
   financial values, database details, or stack trace, and offer only a safe
   recovery action. A portfolio render failure will therefore leave the rest
   of the shell/recovery UI available.
5. Extend unit coverage for `20.5`, a whole-number quantity, and representative
   PostgREST JSON rows whose numeric fields are JSON numbers. Include rejection
   cases that prove malformed response values never reach calculation. Add an
   error-boundary test that triggers a child render error and asserts generic
   fallback copy without the thrown message.

No dependencies, schema changes, RLS-policy changes, or migrations are
required for this remediation.

### Verification after implementation

Run `npm run build`, `npm run test`, and `npm run test:rls`. All three must
exit successfully. Inspect the changed tests to confirm the raw response shape
and the generic error fallback are covered without asserting or rendering
financial values in the fallback.
