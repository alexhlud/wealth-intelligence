# Phase 0.5 — Thin Vertical Slice Plan

## Objective

Prove the smallest secure production path across the React client, Supabase
Auth/Postgres, Row Level Security, automated tests, and Cloudflare Pages:

1. A permitted user signs up, verifies their email, signs in, and signs out.
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
- There are no Supabase migrations, test scripts/frameworks, RLS tests,
  Cloudflare Pages configuration, or existing `docs/plans` directory.
- The design guide is at the repository root as `DESIGN.md`, rather than the
  `docs/DESIGN.md` path named in `AGENTS.md`.

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

1. Sign-up validates email/password locally, then calls Supabase Auth email/
   password sign-up with an email-confirmation redirect back to the deployed
   callback route.
2. Supabase Auth configuration, not frontend logic, will require confirmed
   email before the portfolio route can initialize data. The confirmation
   callback exchanges/reads the session and redirects only an eligible session
   to the portfolio route; otherwise it displays a verification-pending state.
3. On a verified authenticated session, the client invokes the idempotent
   primary-portfolio initialization RPC. RLS protects all subsequent reads and
   writes even if a route guard is bypassed.
4. Sign-out calls Supabase Auth sign-out, clears client query cache, and returns
   to sign-in.

The Supabase dashboard will be configured before production testing to enable
email confirmation, password requirements and leaked-password protection,
short JWT expiry with refresh-token rotation, native rate limits, and
Turnstile. Invite-only enforcement is a prerequisite decision listed below;
it cannot be honestly provided by client-side controls.

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

Add the minimum Cloudflare Pages configuration needed to build the Vite client
(`npm run build`, output `dist`) and SPA fallback behavior. Add `public/_headers`
with the required security headers, beginning CSP in report-only mode with an
explicit `connect-src` allowlist for the configured Supabase origin; move to
enforcement only after the production smoke test confirms legitimate auth/API
traffic is not blocked. Cloudflare environment variables will contain only the
Supabase URL and publishable key, never privileged credentials.

## Required decisions before implementation

1. **Invite-only versus open sign-up:** `SECURITY.md` requires invite-only
   enforcement at the server, while Phase 0.5 explicitly includes self-service
   sign-up. Please choose either (a) provision users through Supabase Auth
   admin invites with public sign-up disabled, or (b) an `allowed_signups`
   table plus Auth hook/trigger. The plan will implement the chosen server-side
   mechanism; it will not assume open registration.
2. **First sign-in semantics:** Supabase can reliably create the portfolio via
   the above idempotent authenticated RPC after a verified session. A trigger
   on `auth.users` would instead create it at sign-up, before first sign-in.
   This plan uses the RPC to meet the roadmap's stated first-sign-in behavior.
   Confirm that this is preferred.
3. **Production access:** deployment and email verification require the target
   Supabase project URL and a Cloudflare Pages project/account (or authority to
   create them), plus the final production URL for Supabase redirect allowlists
   and CSP. These values must be configured outside version control.

## Completion criteria

After the above decisions are approved and implementation is complete, the
slice is complete only when the production smoke test succeeds and
`npm run build`, `npm run lint`, `npm run test`, and `npm run test:rls` all
pass.
