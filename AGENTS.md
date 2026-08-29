# Wealth Intelligence

Personal wealth tracking and future modeling app. Real financial data,
multiple isolated users, public deployment.

Stack: React + TypeScript + Vite + Tailwind + shadcn/ui + TanStack Query
+ Zod + Recharts. Supabase (Postgres, Auth, RLS, Edge Functions).
Deployed to Cloudflare Pages. Vitest + Playwright.

## Commands

npm run dev          # local dev server
npm run build        # tsc -b && vite build  (must pass before done)
npm run test         # unit tests
npm run test:rls     # RLS policy tests
npm run lint

## Rules that apply to every task

- Money is Postgres NUMERIC. Never float. Format only at render.
- Identity comes from auth.uid(). Never trust a client-sent user_id.
- Every user-owned table has RLS enabled and tested.
- Postgres functions default to SECURITY INVOKER. SECURITY DEFINER
  requires SET search_path = '' and a comment explaining why.
- Multi-table financial writes go through one RPC in one transaction.
- Validate all client input with Zod before it reaches a query.
  Column and sort names come from a server-side allowlist.
- No dangerouslySetInnerHTML, eval, or new Function. Ever.
- No secrets in VITE_* vars, client code, or committed files.
- Timestamps stored UTC.
- History is immutable. Never rewrite a snapshot or position event.

## Working agreement

- One phase at a time. Do not start a later phase because it looks related.
- Write the plan to docs/plans/phase-N.md and stop for review before
  writing implementation code.
- Targeted edits to named files. Do not reformat or restructure files
  unrelated to the task.
- No placeholder or "future" files the current phase doesn't use.
- No new dependencies without justifying them in the plan.
- Every phase ends with build and tests passing.
- Ambiguity in the docs is a question, not a guess.

## Read before you work

- Feature behavior            -> docs/PRD.md
- Schema, migrations, calcs   -> docs/ARCHITECTURE.md
- Auth, RLS, MFA, secrets     -> docs/SECURITY.md
- Any UI or styling           -> DESIGN.md
- What to build next          -> docs/ROADMAP.md
- Tests and acceptance        -> docs/ACCEPTANCE.md
