# Threat Model

## Scope and status

This is a point-in-time model of the implemented Phase 0.5, 2a, 2b, 3b-1,
and 3b-2 application. It describes controls that are present in the checked-in
application and database migrations; it does not claim planned Phase 4+
controls as protection. In particular, no Supabase Edge Function and no market
data provider exist today.

The application is a browser-delivered, authenticated personal-wealth tracker.
It does not connect to banks or brokerages and contains no trading capability.

## Trust boundaries

| Boundary | What crosses it | Trust decision today |
| --- | --- | --- |
| Browser | User input, an authenticated Supabase session, and reads/writes through supabase-js | The browser is untrusted for identity, authorization, and financial input. It is trusted only to present UI and make requests. Client-side Zod validation improves input quality but is not an authorization boundary. |
| Cloudflare Pages | Static React/Vite assets and HTTP response headers | Cloudflare Pages serves the public application bundle. `public/_headers` provides transport and browser hardening headers; its CSP is report-only, so it observes rather than blocks violations. |
| Supabase Auth | Email/password and administrator-invite flows; JWT/session issuance | Supabase Auth is the identity authority. The application consumes the session and database policies/RPCs derive the caller from `auth.uid()`. The current repository configuration lists callback URLs, but production Auth dashboard settings remain an operational dependency. |
| Supabase Postgres / Data API | JWT-derived database role and `auth.uid()`, table queries, and RPC calls | The `app` schema is exposed through the Data API (`supabase/config.toml`) only to authenticated users. RLS, grants, foreign keys, constraints, and immutable-history triggers enforce ownership and data invariants. |
| SECURITY DEFINER RPCs | Authenticated caller input for atomic position/snapshot writes | Four narrowly granted RPCs cross an elevated privilege boundary: `app.create_position`, `app.edit_position`, `app.create_portfolio_snapshot`, and `app.correct_portfolio_snapshot`. They use `auth.uid()`, pin `search_path` to empty, validate/lock owned rows, and are documented in the migrations. Internal snapshot insertion is not executable by authenticated callers. |

There is no Edge Function boundary and no market-data-provider boundary yet. There are therefore no server-side provider credentials, quote-cache records, provider requests, or provider-response handling to assess.

## Assets and sensitivity

| Asset | Sensitivity | Why it matters |
| --- | --- | --- |
| Supabase sessions/JWTs and refresh tokens | Critical | A stolen session can act as the user within its remaining/refreshable lifetime. |
| Authentication identity and email address | High | Enables account takeover targeting, phishing, and correlation with financial records. |
| Current wealth records | High | Profiles, portfolios, accounts, positions, manual assets, liabilities, values, balances, account/institution names, and free-text notes reveal a detailed financial picture. |
| Immutable history | High | `position_events` and snapshot tables retain past holdings, values, timestamps, and correction reasons; exposure is durable even when current state changes. |
| Data integrity / audit trail | High | Incorrect positions, events, or snapshots can mislead the user about their wealth and undermine history. |
| Database schema, grants, policies, and RPC definitions | High | A privilege or function change can bypass application-level expectations for every user. |
| Supabase publishable key and project URL | Low / public by design | They are shipped to the browser. Their exposure must not grant data access; RLS and grants provide that protection. |

## Threats and controls by boundary

STRIDE labels identify the primary threat type. A cited test is evidence that
the listed behavior is exercised; it is not a guarantee against deployment
configuration drift or unknown implementation defects.

### Browser

| STRIDE | Threat | Current control and evidence | Residual exposure |
| --- | --- | --- | --- |
| S — Spoofing | A visitor bypasses a React route guard or submits a forged `user_id`. | `ProtectedRoute` is only UX; database policies and all elevated write RPCs derive ownership from `auth.uid()`, not a browser `user_id`. `20260831000000_phase_2a_current_wealth.sql` defines the ownership policies and RPC checks. `supabase/tests/rls.sql` covers cross-user reads/writes and forged ownership attempts. | A stolen authenticated session is still the user at this boundary. |
| T — Tampering | Malformed or out-of-range form data reaches financial writes. | Phase 3b schemas in `src/lib/validation.ts` validate position, account, asset, and liability input before client queries/RPCs. Database constraints and the RPC validation remain authoritative in `20260831000000_phase_2a_current_wealth.sql`; `supabase/tests/rls.sql` exercises invalid position intents and rollback. | Direct API callers can bypass Zod. The database protects the represented constraints, but UI schemas are not independently server-enforced. |
| T — Tampering | A client directly edits `positions`, `position_events`, or snapshot history. | Authenticated grants are read-only for positions/events and snapshot tables. Position changes require `create_position`/`edit_position`; snapshots require the two snapshot RPCs. `reject_history_mutation` triggers in the Phase 2a/2b migrations reject update/delete even in privileged test paths. RLS/snapshot tests explicitly assert direct writes fail and privileged history mutations fail. | Manual assets and liabilities are intentionally direct owner writes; they represent current state and do not yet have an append-only change history. |
| R — Repudiation | A user retries a request and creates duplicate financial events or snapshots. | The four write RPCs use caller-scoped `request_id` plus a request fingerprint for idempotency. `supabase/tests/rls.sql` and `supabase/tests/snapshots.sql` assert identical retries do not duplicate history and changed intents cannot reuse a request ID. | This is an integrity/deduplication control, not an external audit identity or non-repudiation system. There is no durable application audit log for profile, account, manual-asset, or liability edits. |
| I — Information disclosure | XSS or a malicious script reads the persisted session and financial data. | React’s default escaping is used and repository rules prohibit raw HTML/eval. `public/_headers` has a report-only CSP limited to self and the project’s Supabase origin, plus `X-Content-Type-Options`, `Referrer-Policy`, frame denial, and a restrictive `Permissions-Policy`. | Report-only CSP does not block XSS. `persistSession: true` in `src/lib/supabase.ts` uses Supabase’s browser localStorage default, so any successful same-origin script execution can steal the session. |
| D — Denial of service | Repeated client submissions create duplicate records or leave partial financial writes. | Atomic database RPCs and idempotency keys reduce duplicate/partial writes; tests cover rejected write rollback. | There is no application-level rate limiting, bot protection, or request quota enforcement in the browser layer. |
| E — Elevation of privilege | A browser invokes a privileged RPC beyond its intended scope. | Only the four approved public atomic-write RPCs are granted to `authenticated`; internal helpers are revoked. Catalog assertions in `supabase/tests/rls.sql` and `supabase/tests/snapshots.sql` verify the grants. | Correctness depends on the SECURITY DEFINER functions continuing to validate every path and on future migrations preserving the grant model. |

### Cloudflare Pages

| STRIDE | Threat | Current control and evidence | Residual exposure |
| --- | --- | --- | --- |
| T — Tampering | Content is altered in transit or interpreted as another MIME type. | `public/_headers` sets HSTS and `X-Content-Type-Options: nosniff`. | There is no documented deployment-integrity, SRI, or release-attestation control. HSTS only helps after a browser has received the header. |
| I — Information disclosure | Another site frames the app or receives overly detailed referrers. | `public/_headers` sets `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'` (report-only), and `Referrer-Policy: strict-origin-when-cross-origin`. | The CSP frame control is non-enforcing while report-only; X-Frame-Options remains the effective anti-framing control. |
| D — Denial of service | The static origin or deployed application becomes unavailable. | Cloudflare Pages supplies the hosting boundary; the code has query/error states rather than treating the UI as an availability guarantee. | No application-specific DDoS/rate-limit configuration, availability monitoring, or recovery runbook is implemented in this phase. |
| E — Elevation of privilege | An injected script broadens what it can load/connect to. | The report-only policy records the intended allowlist: `default-src 'self'` and `connect-src 'self'` plus the Supabase project origin. | CSP is not enforced, and it permits `style-src 'unsafe-inline'`. It is useful telemetry, not a blocking control today. |

### Supabase Auth

| STRIDE | Threat | Current control and evidence | Residual exposure |
| --- | --- | --- | --- |
| S — Spoofing | An unauthenticated caller accesses financial rows, or an unverified browser identity is treated as an owner. | Database access is granted to `authenticated`, RLS compares `auth.uid()` to owned rows, and all elevated RPCs reject a null `auth.uid()`. `app.ensure_primary_portfolio()` also rejects unauthenticated calls. `supabase/tests/rls.sql` covers anonymous schema/function denial and user isolation. | There is no MFA/AAL policy, so password compromise and session theft remain single-factor account takeover paths. |
| S — Spoofing | An arbitrary person creates an account despite invite-only messaging. | The intended operational control is public sign-up disabled in Supabase Auth with administrator-created invites; Phase 0.5 documents administrator provisioning and the UI uses invitation-oriented messaging. `supabase/config.toml` constrains configured callback URLs. | Invite-only is a Supabase dashboard setting, not a database mechanism. The repository cannot prove it is enabled in production, and the client still calls `supabase.auth.signUp()`. This is a material configuration risk. |
| I — Information disclosure | Sign-in errors reveal whether an account exists. | `AuthPages.tsx` maps sign-in failure to generic authored copy rather than rendering Supabase errors. | This only controls UI copy; the actual Auth service response behavior and email delivery are configuration/provider behavior not tested here. |
| D — Denial of service | Credential stuffing or automated signup/reset abuse exhausts Auth resources. | Supabase Auth offers platform controls, but no checked-in Turnstile, explicit rate-limit configuration, or app-level throttle exists. | This threat is not adequately mitigated by application code today. |
| R — Repudiation | A disputed authentication/session event cannot be reconstructed. | Supabase Auth is the identity issuer. | No application-level authentication audit log or “sign out of all sessions” control is implemented. Free-tier platform-log retention must not be treated as a durable audit trail. |

### Supabase Postgres, RLS, and SECURITY DEFINER RPCs

| STRIDE | Threat | Current control and evidence | Residual exposure |
| --- | --- | --- | --- |
| S — Spoofing | User B reads or changes User A’s rows by changing IDs in a Data API request. | All user-owned tables are RLS-enabled and forced. Owner policies include `portfolios_owner_access`, `positions_owner_access`, `profiles_owner_*`, `accounts_owner_access`, `manual_assets_owner_access`, `liabilities_owner_access`, `position_events_owner_select`, and the four snapshot `*_owner_select` policies. The Phase 0.5/2a/2b migrations define them. `supabase/tests/rls.sql` and `supabase/tests/snapshots.sql` exercise cross-user reads and writes. | RLS controls database paths, not a legitimately stolen JWT or privileged service-role/database credentials. |
| T — Tampering | A caller re-parents a child object to another user/portfolio or violates financial invariants. | Composite foreign keys carry ownership through portfolios/accounts/positions/snapshots; `CHECK` constraints bound types, strings, USD currency, amounts, and event shape. The RLS and snapshot tests assert cross-user reparenting and malformed snapshot parenting fail. | Constraints model only implemented USD/current-state rules. They do not provide approval workflows or protection from a legitimate owner deliberately entering incorrect values. |
| T — Tampering | A partial multi-table write creates a position without an event, or a snapshot header without its full composition. | `app.create_position` and `app.edit_position` atomically write current position plus event; snapshot creation/correction use `app.insert_snapshot_revision` internally for header and child rows. RPC tests cover rollback after rejected input and rejected foreign-resource attacks. | Snapshot behavior is database-capable but has no delivered UI or scheduler that creates real snapshots in normal use. |
| T — Tampering | History is silently rewritten or a correction overwrites its original. | `position_events_reject_mutation` and the four snapshot `*_reject_mutation` triggers call `app.reject_history_mutation`. Snapshot corrections append a linked revision and cannot branch from a non-leaf. `supabase/tests/snapshots.sql` verifies byte-for-byte preservation and rejects privileged update/delete attempts. | Database owners/superusers and out-of-band operational access are outside RLS and can still alter data. There is no tamper-evident external ledger or backup-based forensic control. |
| R — Repudiation | A writer disputes a position change/snapshot. | Immutable position events retain previous/new facts, source, time, request ID, and caller-owned record; snapshots preserve composition and correction reasons. Tests verify immutability/idempotency. | `auth.uid()` identifies the account, not a human with MFA or cryptographic non-repudiation. Current-state table edits (accounts/assets/liabilities) are not historically recorded. |
| I — Information disclosure | The anonymous role reads tables, sequences, types, or invokes app functions. | Each migration revokes app-schema privileges from `public`/`anon`; only `authenticated` receives narrowly scoped usage/grants. Catalog checks in `supabase/tests/rls.sql` and `supabase/tests/snapshots.sql` assert anon has no app relation, function, sequence, or type privilege. | This assumes the deployed migrations and API schema exposure match source. It does not assess Auth schema, storage, logs, or any future Realtime configuration. |
| I — Information disclosure | An RPC leaks whether a foreign row exists. | Elevated write RPCs use owned-row lookups and return the same `Resource unavailable` result for foreign and missing relevant resources. RLS and snapshot tests explicitly compare those cases. | Timing, broader service errors, and future endpoints have not been evaluated as side channels. |
| D — Denial of service | A caller sends oversized/invalid RPC JSON or creates repeated writes. | RPCs validate required values, bounds, enum values, decimal scales, array shape, ownership, and idempotency before writes; rejected-input tests cover atomic rollback. | No explicit per-user database/API rate limit, payload-size policy beyond validation, or queueing exists. Complex valid snapshot payloads can still consume resources. |
| E — Elevation of privilege | SECURITY DEFINER code is exploited through `search_path` manipulation, public function execution, or caller-supplied ownership. | All four approved SECURITY DEFINER RPCs have `SET search_path = ''`, schema-qualified references, comments explaining elevation, and `auth.uid()` ownership checks. Grants revoke public/anon access; `insert_snapshot_revision` is not executable by authenticated users. Tests assert exactly four definer functions, empty search paths, comments, and allowed execution. | SECURITY DEFINER remains a high-impact code boundary: a future bug or migration change can bypass RLS. The guarantees apply to these four functions only, and their security depends on continued code review and tests. |

## Accepted risks

| Risk | Reasoning and current mitigation | Why it remains accepted only temporarily / conditionally |
| --- | --- | --- |
| Session stored in localStorage | `src/lib/supabase.ts` intentionally enables persisted sessions. React escaping, the prohibition on raw HTML/eval, no third-party scripts in the implemented app, and the report-only CSP reduce the likelihood of script injection. | localStorage is readable by any executing same-origin script. The security guidance calls this acceptable only with a **strict enforced** CSP and no third-party scripts; CSP is not enforced yet, so present mitigation is partial. |
| No MFA | The current personal app is early-stage and the schema/RLS design can be extended with Supabase TOTP/AAL later. | Password compromise or session theft can expose all current and historical wealth data. There is no `aal2` enforcement. This must be resolved before the app holds real data for more than one user, as required by `docs/SECURITY.md`. |
| No automated Supabase free-plan backups | The project has a $0 V1 constraint and the architecture documents that free-plan automated backups are unavailable. | JSON export/disaster-recovery scheduling has not been implemented. A destructive operational incident, project loss, or unrecoverable corruption can lose data/history. |
| CSP not yet enforced | `public/_headers` ships a report-only policy so expected asset and Supabase connections can be observed before breakage is enforced. | It does not contain an XSS today and includes `style-src 'unsafe-inline'`. The planned enforce-after-validation step is not delivered, so this is not a complete browser defense. |
| Invite-only is a dashboard setting, not a database mechanism | Admin invites and disabling public signup are a simple operational mechanism for the current small deployment. | It is not version-controlled, migration-tested, or self-verifying. Misconfiguration could allow public signup; client wording is not access control. |

## Known limitations

- No Edge Functions, market-data provider, quote cache, provider credential, or
  server-side market-data security boundary exists yet. The holdings UI’s
  temporary fixed prices are not live market data.
- No MFA, Turnstile, confirmed checked-in Auth rate-limit settings, password
  policy verification, leaked-password protection verification, or sign-out
  of all sessions is implemented in this repository.
- Browser route protection is not an authorization control. Security depends
  on Supabase Auth/RLS/RPC behavior and correct production configuration.
- CSP is report-only; there is no implemented security-header integration test
  or deployed-header verification.
- Database security tests are comprehensive for the checked-in migrations,
  but they do not prove Cloudflare or Supabase dashboard settings, service-role
  key handling, backups, logging, monitoring, or production deployment state.
- Current-state accounts, manual assets, and liabilities can be edited by their
  owner without an immutable application-level change event. Position and
  snapshot history is protected, but it is not a complete audit system.
- Snapshots are immutable once written, but the Phase 2b RPCs have no
  implemented user workflow or scheduled generation. Historical protection
  does not itself guarantee timely or complete snapshot coverage.
- No account/asset/liability deletion flow is delivered. This avoids unreviewed
  history destruction, but it also means data-retention and account-deletion
  requirements are not implemented.
- Availability and recovery controls are limited: no automated backups,
  documented restore exercise, application-level rate limiting, DDoS policy,
  health monitoring, or incident-response workflow is present.
- RLS does not constrain Supabase service-role, database-owner, or other
  privileged operational access. Those credentials/configurations require
  separate operational controls and are not represented by this threat model.

## Decision: open registration

Registration will be open to the public rather than invite-only, so the
project can be shown to anyone. This removes the justification for two
previously accepted risks, so the following are prerequisites, not
future work:

- TOTP MFA via Supabase Auth, enforced at the database layer through
  Authentication Assurance Level in RLS policies, not only in the UI.
- Cloudflare Turnstile on sign-up, sign-in, and password reset.
- A scheduled JSON export, since the free plan has no automated backups
  and an open service has more ways to lose data.

Until all three exist, registration stays closed.
