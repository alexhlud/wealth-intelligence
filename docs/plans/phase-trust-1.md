# Phase trust-1 — Batch B: money as text, worker-only snapshots, archive

Status: approved 2026-11-24 (see "Decisions made"). No code, migration,
grant or test changes ship with this document. Each numbered item below
becomes its own pull request, in the order given under "Delivery order".

## Objective and boundary

Close the remaining trust gaps found in the November 2026 read-only audit
that need schema, RPC, grant or worker changes. AGENTS.md requires a plan
before any of those.

In scope:

1. Money travels as text from Postgres to every reader and writer.
2. Snapshots are recorded only by the scheduled worker.
3. One original snapshot per portfolio per trading date.
4. Accounts, manual assets and liabilities are archived, never deleted.
5. The after-close check sees closed positions and archived items.
6. A stale quote makes capture unavailable instead of being recorded.

Out of scope: historical backfill behavior, corrections UI design, the
Finnhub provider contract, portfolio deletion (see "Noted, not planned").

App-only fixes (zero values, USD rounding, milestones, CSS classes) are in
Batch A, PR #47, and are not repeated here.

## Facts confirmed in the repository

These were checked on `main` at `c1cc45b`. Two of them differ from the audit
summary and change the plan. They are marked **differs**.

| Fact | Source |
| --- | --- |
| `positions.quantity` is `numeric(28,12)`; `average_cost` is `numeric(24,8)` | `20260831000000_phase_2a_current_wealth.sql:127-128` |
| Open position needs `quantity > 0`, closed needs `quantity = 0` and `closed_at` | same file, `:161-164` |
| `manual_assets.current_value`, `liabilities.outstanding_balance` are `numeric(24,8) >= 0` | same file, `:181`, `:210` |
| Snapshot uniqueness is `(portfolio_id, market_close_at) where corrects_snapshot_id is null` | `20260831010000_phase_2b_snapshots.sql:63-65` |
| `portfolio_snapshots.source` is one of `manual`, `position_change`, `daily_close`, `backfill`, `correction` | same file, `:22-24` |
| `authenticated` has DELETE on `accounts`, `manual_assets`, `liabilities` | `…phase_2a_current_wealth.sql:771-774` |
| **differs:** `authenticated` has only SELECT on `positions` since Phase 2a | `…phase_2a_current_wealth.sql:765`, `:772` |
| `create_portfolio_snapshot` is granted to `authenticated` | `20260903000000_phase_mfa_1.sql:148` |
| **differs:** the worker never calls `create_portfolio_snapshot` | see below |
| No browser code issues a DELETE on any table | `grep` of `src` for `.delete(` |
| `docs/ARCHITECTURE.md` still lists a user "Save Snapshot" trigger | "WHEN SNAPSHOTS SHOULD BE CREATED", item 4 |

### Positions DELETE

Phase 0.5 granted DELETE on `positions` (`20260829000000_phase_0_5.sql:61`).
Phase 2a then revoked all table privileges from `authenticated` and granted
back only SELECT on `positions`. No later migration grants it again.

The plan therefore treats positions as already correct in the migrations.
It adds a pgTAP assertion that keeps it that way, and an optional read-only
production check (query d) to confirm production matches the migrations.

### The worker's snapshot path

The scheduled worker runs as `service_role` and calls
`app.create_scheduled_portfolio_snapshot`
(`20261103000000_phase_6b_snapshot_capture.sql:96-116`). That function calls
`app.create_portfolio_snapshot_mfa1_inner` directly. It never calls
`app.create_portfolio_snapshot`.

So "the worker keeps it" needs no grant. Revoking EXECUTE on
`create_portfolio_snapshot` from `authenticated` does not touch the worker.

`app.create_historical_backfill` is `SECURITY DEFINER` and calls
`app.create_portfolio_snapshot` as its owner
(`20261112010000_correct_xnys_2027_early_closes.sql:25`, `:57`). The revoke
does not affect it either, because the owner keeps EXECUTE. Item 2 adds a
pgTAP test that proves backfill still works after the revoke.

## Delivery order

Each step is one PR with its own tests, and each leaves build, lint, unit
tests and `test:rls` green in CI (#46).

| Step | Item | Schema change | Depends on |
| --- | --- | --- | --- |
| B1 | 6. Stale quotes and worker `.error` checks; closed-position half of 5; Future zero-liability sign | none | — |
| B2 | 1. Money as text end to end | none (reads only) | — |
| B3 | 2. Remove manual snapshots, revoke EXECUTE | grant + UI + edge | — |
| B4 | 3. One original per `(portfolio_id, as_of_date)` | unique index | query b = 0 |
| B5 | 4. Archive, revoke DELETE | columns, grants, RPCs | — |
| B6 | 5. After-close check sees archives and restores | none | B5 |

B1 and B2 come first because they change no schema and stop new imprecise
or stale data from entering immutable history.

B1 also carries two small changes, by decision:

- The closed-position half of item 5, which needs no schema.
- A Future page display fix: the baseline line shows `Liabilities −$0.00`
  when liabilities are zero. A zero amount shows no minus sign.

## Rollback principle

Migrations are forward-only and history is immutable. Rollback is always a
new forward migration that restores the previous grant, index or function
body. It never rewrites snapshot or event rows. Each item lists its rollback.

---

## 1. Money as text end to end (B2)

### Problem

PostgREST returns `numeric` as a JSON number. Every value that goes through
JavaScript `Number` keeps about 15–17 significant digits:

- `12345678901234.12345678` (22 significant digits) reads back as
  `12345678901234.123`.
- The worker then writes it into an immutable snapshot through
  `String(value)` (`supabase/functions/market-data/snapshot.ts:11`).

Readers that still take numbers:

| Reader | File | Read |
| --- | --- | --- |
| Snapshot worker and preview | `supabase/functions/market-data/snapshot.ts:17-21` | `positions`, `manual_assets`, `liabilities` |
| Correction editor | `src/features/snapshots/CorrectionEditor.tsx:16` | `snapshot_positions`, `snapshot_manual_assets`, `snapshot_liabilities` |
| Snapshots list | `src/features/snapshots/SnapshotsPage.tsx:19` | `portfolio_snapshots` |
| Recovery export | `src/features/export/recoveryExport.ts:46` | `select('*')` on every exported table |
| Holdings, Overview, Future | `PortfolioPage.tsx:19`, `DashboardWithHistoryPage.tsx:16-18`, `FuturePage.tsx:86-88` | `positions`, `manual_assets`, `liabilities` |
| Assets, Liabilities | `ValueItemsPage.tsx:16` | `manual_assets`, `liabilities` |
| Backfill suggestions | `HistoricalValueItems.tsx:46-47` | `manual_assets`, `liabilities` |

The history and baseline RPCs already return text
(`20261027020000_phase_7b_1_history_detail_contract.sql`,
`20261103020000_phase_8a_projection_baseline_decimal_contract.sql`). They
are the reference pattern and are not changed.

### Approach

Use PostgREST casts in the select list: `quantity::text`,
`average_cost::text`, and so on. Each money column is named and cast. No
`select('*')` remains on a table that has a money column.

This keeps reads on the same tables, RLS policies and grants. A read RPC per
table would add functions without adding safety.

- **Worker.** Select `quantity::text`, `average_cost::text`,
  `current_value::text`, `outstanding_balance::text`, and pass the strings
  through unchanged. Delete the `decimal = (value) => String(value)` helper.
- **Correction editor.** Cast every money column of the three snapshot child
  tables. Corrections send the same text back to `correct_portfolio_snapshot`.
- **Snapshots list.** Cast `investment_value` and `total_net_worth`.
- **Recovery export.** Replace `select('*')` with an explicit column list per
  table, kept in one allowlist in `recoveryExport.ts`, with money columns
  cast. Bump `export_version` to 2 (decided), because the column set is now
  explicit.
  Remove `decimalString`'s number branch.
- **App reads.** Cast in the shared selects for positions, manual assets and
  liabilities. Then remove the `z.number()` branch from the read check in
  `src/lib/validation.ts`, so any number that arrives is a parse error.

Writes already send strings, because form values are strings. The plan adds
tests that assert it and changes no write path.

Finnhub quotes arrive as JSON numbers from the provider
(`finnhub.ts:98`). Those are an external float source and stay out of scope.
The quote validator already bounds them.

### Tests

The acceptance values are `0.000000123456` (quantity) and
`12345678901234.12345678` (money, the full 16.8 of `numeric(24,8)`).

- pgTAP, `supabase/tests/money_text.sql`: insert rows with both values. Then
  assert that `quantity::text` and `average_cost::text` equal the inserted
  text exactly, after a snapshot is recorded and after a correction.
- Vitest, worker (`snapshot-capture/index.test.ts`): a fake admin client
  returns the text values. Assert that the RPC payload carries them unchanged.
- Vitest, correction editor: load, change nothing, submit. Assert that the
  `correct_portfolio_snapshot` payload carries both values unchanged.
- Vitest, Snapshots list and recovery export: both values survive
  byte-for-byte. The export JSON contains `"12345678901234.12345678"` as a
  string.
- Vitest, read check: a JSON number for a money column is now rejected.

### Risk

- A select string typo returns a PostgREST error at runtime. Every changed
  select has a test that runs it through the mock builder, and the read
  check rejects the missing column.
- The export column allowlist can fall behind a future migration. A pgTAP
  test compares the allowlist, exported to a fixture, against
  `information_schema.columns`.

### Rollback

App and edge code only. Revert the PR. No data changed.

---

## 2. Remove manual snapshots (B3)

### Changes

- **UI.**
  - Remove `SaveSnapshotDialog` and its button from `SnapshotsPage.tsx`.
  - Remove the dialog, the `savingSnapshot` state and the button from
    `PortfolioPage.tsx`.
- **Edge function.**
  - Remove the `save_snapshot` and `snapshot_preview` operations from
    `supabase/functions/market-data/index.ts`.
  - Remove `saveSnapshot` and `previewSnapshot` from `snapshot.ts`.
  - Keep `buildSnapshot`, which the worker imports.
  - The operation schema rejects the removed names with a 400.
- **Grant.** A migration runs
  `revoke execute on function app.create_portfolio_snapshot(uuid, date,
  timestamptz, text, jsonb, jsonb, jsonb, uuid) from authenticated;`.
  `correct_portfolio_snapshot` stays granted, because corrections are user
  actions. No grant is added for the worker (see "The worker's snapshot
  path").
- **Empty state.** Before a user's first snapshot, Snapshots and History
  show: "Your first recorded reading arrives after today's close." On a
  non-trading day the copy names the next session, using the XNYS calendar
  already in the client.
- **Docs.** Remove item 4 ("When the user manually requests 'Save
  Snapshot.'") from `docs/ARCHITECTURE.md`. Update PRD and ACCEPTANCE where
  they mention saving a snapshot.
- **Existing rows.** Rows with `source = 'manual'` stay. History is
  immutable, and the check constraint keeps allowing `manual` for them.
  Query c shows how many exist.

### Tests

- pgTAP: as `authenticated`, `select app.create_portfolio_snapshot(...)`
  `throws_ok` with SQLSTATE `42501`.
- pgTAP: `has_function_privilege('authenticated',
  'app.create_portfolio_snapshot(uuid,date,timestamptz,text,jsonb,jsonb,jsonb,uuid)',
  'execute')` is false.
- pgTAP: as `authenticated` with aal2, `create_historical_backfill` still
  records a backfill snapshot.
- pgTAP: as `service_role`, `create_scheduled_portfolio_snapshot` still
  records a snapshot.
- **Required test migration.** `supabase/tests/snapshots.sql` calls
  `create_portfolio_snapshot` as `authenticated` 20 times to seed snapshots.
  Those calls move to a test-only seeding block that runs as `postgres` and
  calls the inner function. The assertions themselves don't change. This is
  the largest part of B3.
- Vitest: Snapshots and Holdings render no Save snapshot control. The empty
  state copy renders for a user with no snapshots.
- Vitest: `market-data` rejects `save_snapshot` with a 400.

### Risk

- A user who relied on manual saves loses that option. This is intended.
  The scheduled worker already captures every session.
- Deploy order: ship the UI and edge removal and the revoke in one release.
  If the revoke lands first, an old cached client gets a permission error
  on save. That is acceptable, but the edge function maps it to the generic
  "Snapshot unavailable" message, per the AGENTS.md error rule.

### Rollback

A forward migration re-grants EXECUTE to `authenticated`, plus a revert of
the UI and edge PR. No data changed.

---

## 3. One original snapshot per trading date (B4)

### Change

Replace `portfolio_snapshots_one_original_per_close` with:

```sql
create unique index portfolio_snapshots_one_original_per_date
  on app.portfolio_snapshots (portfolio_id, as_of_date)
  where corrects_snapshot_id is null;
drop index app.portfolio_snapshots_one_original_per_close;
```

Create the new index before dropping the old one, so no moment exists
without a uniqueness guard.

Today two originals can share a date if they have different close times:
13:00 on an early-close day and 16:00. That can happen after an XNYS
calendar correction (for example
`20261112010000_correct_xnys_2027_early_closes.sql`) or from a backfill.

Callers that look up "already recorded" by `market_close_at` switch to
`as_of_date`:

- `snapshot.ts:18`
- `snapshot-capture/index.ts:206-211`
- `snapshot-capture/index.ts:374-378`

The `22000` "already recorded" mapping in the inner writer is unchanged.

### Dependency: production duplicate check

`create unique index` fails if duplicates already exist. Before this
migration runs anywhere but local, Alex runs **query b** in production.

- If b = 0, ship as written.
- If b > 0, stop. Duplicates are immutable history, so they are not deleted.
  The choice between a different index predicate and a documented exception
  list comes back for review.

The migration itself starts with a guard. If duplicates exist, it raises an
exception naming the count, rather than letting index creation fail with a
less clear error.

### Tests

- pgTAP: two originals for the same portfolio and date with closes at 13:00
  and 16:00. The second throws `23505`.
- pgTAP: a correction for that date is still allowed, because the predicate
  excludes corrections.
- pgTAP: different portfolios on the same date are both allowed.
- Vitest (worker): an existing original for the date returns
  `already_recorded`, whatever its close time.

### Risk

- Locking: `create unique index` takes a write lock on the table while it
  builds. The table is small (query c gives the size), so it is not built
  `concurrently`, which can't run inside a migration transaction.

### Rollback

A forward migration recreates the `(portfolio_id, market_close_at)` index,
then drops the new one.

---

## 4. Archive instead of delete (B5)

### Schema

- Add `archived_at timestamptz null` and `restored_at timestamptz null` to
  `accounts`, `manual_assets` and `liabilities`. Both columns are additive.
  Existing rows stay `null`, which means active and never restored.
- Revoke DELETE on all three from `authenticated`. Keep positions SELECT-only
  (no change; already true).
- Replace the table-level UPDATE grant with column-level UPDATE grants on
  the editable columns plus `archived_at`. Leave out `restored_at`,
  `user_id`, `portfolio_id`, `created_at` and `updated_at`.
- Both timestamps are set only by the server. A `BEFORE UPDATE` trigger,
  `app.enforce_archive_state()`, runs on all three tables:
  - `archived_at` from null to any value: the trigger sets it to
    `pg_catalog.now()`, whatever the client sent. This is an archive, and a
    backdated or future timestamp can't be stored.
  - `archived_at` from a value to null: this is a restore. The trigger sets
    `restored_at = pg_catalog.now()`.
  - Any other change to `archived_at` (for example one timestamp to another)
    raises `42501`.
  - Any change to another column while the row is archived (old and new
    `archived_at` both set) raises `22023`, so archived rows are read-only.
  - `restored_at` is not granted to `authenticated`. The trigger sets it on
    `NEW`, and Postgres checks column privileges only for the columns named
    in the statement, not for columns a trigger changes.
- Add RPCs `app.archive_account(uuid)`, `app.archive_manual_asset(uuid)`,
  `app.archive_liability(uuid)` and the matching `app.restore_account(uuid)`,
  `app.restore_manual_asset(uuid)` and `app.restore_liability(uuid)`.
  - Each is `SECURITY INVOKER` and runs one `update … where id = p_id`.
  - Archive matches `archived_at is null`; restore matches
    `archived_at is not null`.
  - Ownership and the MFA restrictive policies come from RLS, as for any
    other owner write. Identity is never a parameter.
  - Each returns whether a row changed, so the UI can show a true message.
  - The RPCs exist so the client never sends a timestamp, and so the account
    rule below has one home.
- Design correction from the first draft: that draft paired invoker RPCs
  with a grant that left out `archived_at`. An invoker RPC runs as
  `authenticated`, so it could not write that column. Granting the column
  and letting the trigger set its value keeps the functions
  `SECURITY INVOKER`. No `SECURITY DEFINER` function is needed.
- An account can't be archived while it has an open position, an active
  manual asset or an active liability. `archive_account` raises `22023` with
  a safe message. The UI asks the user to close or archive those first.
- A manual asset or liability can't be restored into an archived account.
  The account must be restored first; otherwise the restore raises `22023`.

### Behavior

- Current reads (Holdings, Accounts, Assets, Liabilities, Overview, Future)
  add `archived_at is null`. Archived items leave current totals from the
  moment they are archived.
- Snapshots are copies, so past snapshots keep the item unchanged.
- The worker excludes items archived at or before the session close.
  Items archived after the close are handled in item 5.
- Item writes already enqueue a capture request through the existing
  `after update` triggers. Archiving needs no new trigger for that.
- The recovery export includes archived rows with `archived_at` and
  `restored_at`, so a restore from export is complete.

### Restore (decided: allowed in this phase)

- A restore clears `archived_at`. Current reads filter on
  `archived_at is null`, so the item rejoins current totals from the restore
  time onward.
- Past snapshots are copies. Neither archiving nor restoring changes them.
  Snapshots recorded while the item was archived don't include it, and that
  stays true.
- The restored item keeps the value it had when it was archived. The UI
  says so and links to Edit, because that value may be stale.
- The after-close check (item 5) treats a restore after the close like any
  other change. Two signals catch it:
  - `restored_at > market_close_at`.
  - The existing `set_updated_at` trigger also bumps `updated_at`, which the
    worker already checks.
- Only the latest archive and restore times are kept on the row. A full
  lifecycle log is not part of this phase.

### Tests

- pgTAP: as `authenticated`, `delete from app.manual_assets` (and from
  `accounts`, `liabilities`, `positions`) throws `42501`.
  `has_table_privilege(..., 'delete')` is false for all four.
- pgTAP: `update app.manual_assets set archived_at = now() - interval '1
  day'` stores the transaction's `now()`, not the backdated value.
  Changing one archive timestamp to another throws `42501`.
- pgTAP: `update … set restored_at = …` as `authenticated` throws `42501`.
- pgTAP: `archive_manual_asset` sets `archived_at`. A second call changes
  nothing and returns false. Updating any other column of an archived row
  throws `22023`.
- pgTAP: archiving an account with an open position throws `22023`.
- pgTAP: a snapshot recorded before the archive still contains the item.
- pgTAP, restore, for each of the three tables:
  - Owner only: user B calling `restore_*` on user A's archived item changes
    zero rows, and A's row stays archived.
  - MFA policy applies: with an aal1 JWT for a user who has a verified
    factor, `restore_*` changes zero rows (the restrictive policy); with
    aal2 it restores.
  - The item rejoins current totals from the restore time. Before the
    restore, the current-total read excludes it. After the restore, it
    includes it, `restored_at` equals the transaction `now()`, and
    `archived_at` is null.
  - Past snapshots are unchanged: the item's absence from a snapshot
    recorded while it was archived, and its presence in one recorded before
    the archive, are both identical after the restore.
  - Restoring into an archived account throws `22023`.
- Vitest (worker): an item restored one minute after the close returns
  `state_changed_after_close`. One restored before the close is captured.
- Vitest: archived items are absent from current totals on every page. The
  Archive and Restore actions call their RPCs.

### Risk

- Column-level grants are easy to get wrong when a later migration adds a
  column. Add a pgTAP test that lists the updatable columns per table and
  fails when a new column appears without a decision.
- The UI gains Archive and Restore actions on Accounts, Assets and
  Liabilities, and a way to see archived items. That is a visible change and
  needs a design check against DESIGN.md.

### Rollback

A forward migration re-grants table-level UPDATE and DELETE and drops the
trigger and RPCs. The `archived_at` and `restored_at` columns stay, because
dropping them would lose the archive history; their values keep their
meaning. The UI revert shows archived rows again, unless the read filters
are kept.

---

## 5. After-close check sees closes and archives (B1 and B6)

The closed-position half ships in B1 (decided). The archive and restore
half ships in B6, after B5.

### Problem

`buildSnapshot` reads only `status = 'open'` positions (`snapshot.ts:20`).
Take a position held at the close and sold at 17:00. It vanishes from the
read, nothing in the remaining rows is newer than the close, and the worker
records a snapshot that leaves out a holding the user owned at the close.

Today a deleted manual asset or liability has the same effect.

### Change

- Positions read becomes `status = 'open' or closed_at > :market_close_at`.
  If any row has `closed_at > market_close_at`, return
  `state_changed_after_close`, as an edit after the close already does.
- After B5 (in B6), manual assets, liabilities and accounts are read where
  `archived_at is null or archived_at > :market_close_at`. Any
  `archived_at > market_close_at` or `restored_at > market_close_at` returns
  `state_changed_after_close`.
- Rows archived at or before the close are excluded from the payload.

### Tests

- Vitest (worker, B1): a position closed one minute after the close returns
  `state_changed_after_close`. One closed one minute before is excluded and
  capture proceeds.
- Vitest (worker, B6): the same two cases for an archived manual asset, an
  archived liability and an archived account, and for a restore after the
  close.
- pgTAP is not needed, because this is worker logic over existing columns.

### Risk

- More sessions are marked `state_changed_after_close`, so more gaps. That
  is the honest result. The gap is already shown on History.

### Rollback

Revert the worker PR.

---

## 6. Stale quotes and worker error checks (B1)

### Stale quote

`buildSnapshot` records `price_at: session.marketCloseAt` for every quote,
whatever the quote's own `marketTimestamp` is (`snapshot.ts:39`). A symbol
that didn't trade that session, a halted symbol or a provider lag records an
earlier day's price as that session's close.

Change: if a quote's `marketTimestamp` is before the session open, return
`{ kind: 'unavailable', reason: 'price_unavailable' }` and record no
snapshot. This reuses the existing failure category, so the
`record_snapshot_capture_session` allowlist needs no migration.

**Decided: before the session open.** The original wording was "older than
the session close". Read literally, that would reject a normal closing print
stamped 15:59:59 and would make almost every capture unavailable. The rule
is therefore "before the session open (09:30 America/New_York on
`as_of_date`)". That means "the quote is from this session", and it still
accepts a thinly traded symbol whose last trade was earlier in the day.

### Worker `.error` checks

These lookups in `supabase/functions/snapshot-capture/index.ts` read `data`
and ignore `error`:

| Line | Lookup | Effect of a silent error |
| --- | --- | --- |
| `:351-358` | `previous` capture date | `null`, so the worker treats the portfolio as never captured and walks all sessions |
| `:359-365` | `pending` reason | `null`, so `position_change` becomes `daily_close` |
| `:374-379` | `existing` snapshot for a missed session | `null`, so the worker tries to write a duplicate |

Each one checks `.error`. On error it logs the error class, code and message
(the AGENTS.md server catch rule) and records the session as
`gap / storage_unavailable` for that portfolio. Then it continues with the
next portfolio. The lookups in `snapshot.ts` already check errors.

### Tests

- Vitest (worker): a quote stamped the previous session returns
  `price_unavailable` and the snapshot RPC is never called.
- Vitest (worker): a quote stamped 15:59:59 on the session date is accepted.
- Vitest (worker): each of the three lookups returning an error leads to a
  `storage_unavailable` gap, a log entry with code and message, and no
  snapshot write.

### Risk

- More `price_unavailable` gaps for symbols that rarely trade. These are
  honest gaps, and they show on History.

### Rollback

Revert the worker PR.

---

## Production checks for Alex to run

These are read-only. Alex runs them in the production SQL editor. Nothing in
this plan runs them. Table and column names are confirmed against the
migrations cited in "Facts confirmed in the repository".

The hosted SQL editor may run as a role that is subject to RLS. This table
uses `force row level security`. Run this first; it should return `true`:

```sql
select rolbypassrls from pg_catalog.pg_roles where rolname = current_user;
```

If it returns `false`, the counts below may be zero only because RLS hides
rows. In that case, run them as a role that bypasses RLS.

### a) Quantities with more than 15 significant digits

`app.positions.quantity`, `numeric(28,12)`. Its text always has 12 decimal
places, for example `2.500000000000`. The expression strips trailing zeros
(and the point), then strips leading zeros and the point, and counts what is
left. Integer trailing zeros, as in `100`, count as significant here. That
overcounts, which is the safe direction for this check.

```sql
select count(*) as positions_over_15_significant_digits
from app.positions p
where pg_catalog.length(
  pg_catalog.regexp_replace(
    pg_catalog.regexp_replace(p.quantity::text, '\.?0+$', ''),
    '^[0.]+|\.', '', 'g'
  )
) > 15;
```

### b) More than one original snapshot for a portfolio and date

`app.portfolio_snapshots`, columns `portfolio_id`, `as_of_date`,
`corrects_snapshot_id`. This is the precondition for item 3.

```sql
select count(*) as duplicate_original_groups
from (
  select s.portfolio_id, s.as_of_date
  from app.portfolio_snapshots s
  where s.corrects_snapshot_id is null
  group by s.portfolio_id, s.as_of_date
  having count(*) > 1
) as duplicates;
```

### c) Snapshots by source

`app.portfolio_snapshots.source`.

```sql
select s.source, count(*) as snapshots
from app.portfolio_snapshots s
group by s.source
order by s.source;
```

### d) Optional: browser DELETE grants as deployed

This confirms production matches the migrations for the "Positions DELETE"
finding. Expected result: `positions` false; the other three true until B5
ships.

```sql
select t.table_name,
  pg_catalog.has_table_privilege(
    'authenticated', 'app.' || t.table_name, 'delete'
  ) as authenticated_can_delete
from (values ('positions'), ('accounts'), ('manual_assets'), ('liabilities'))
  as t(table_name);
```

## Noted, not planned

- `authenticated` also has DELETE on `app.portfolios`
  (`…phase_2a_current_wealth.sql:770`). Foreign keys use `on delete
  restrict`, so deleting a portfolio that has children fails, but an empty
  portfolio can be deleted. This is outside the audit list; it is worth a
  decision in a later phase.
- Finnhub prices arrive as JSON numbers from the provider. Moving them to
  text would need a provider-side decimal parse and is a separate change.

## Decisions made

Approved by Alex on 2026-11-24.

1. **Stale-quote rule:** a quote stamped before the session open (09:30
   America/New_York on `as_of_date`) makes capture unavailable. See item 6.
2. **Restore after archive is allowed in this phase.** B5 adds additive
   `restore_*` RPCs that clear the archive. pgTAP covers owner-only access,
   the MFA policy, rejoining current totals from the restore time, and
   unchanged past snapshots. The after-close check treats a restore after
   the close like any other change. See items 4 and 5.
3. **Recovery export:** `export_version` becomes 2 with the explicit column
   list. See item 1.
4. **The closed-position half of item 5 ships early, in B1.**
5. **Also in B1:** the Future page shows no minus sign for a zero
   liabilities amount.

B4 waits for Alex's production query results (query b).

## Files in scope (across B1–B6)

- `supabase/functions/market-data/snapshot.ts`, `index.ts`
- `supabase/functions/snapshot-capture/index.ts`, `index.test.ts`
- `supabase/migrations/` — new migrations for B3, B4, B5 only
- `supabase/tests/snapshots.sql`, `rls.sql`, new `money_text.sql`
- `src/lib/validation.ts`
- `src/features/snapshots/SnapshotsPage.tsx`, `CorrectionEditor.tsx`,
  `HistoricalValueItems.tsx`
- `src/features/portfolio/PortfolioPage.tsx`
- `src/features/assets/ValueItemsPage.tsx`
- `src/features/history/DashboardWithHistoryPage.tsx`
- `src/features/projections/FuturePage.tsx`
- `src/features/export/recoveryExport.ts`
- `docs/ARCHITECTURE.md`, `docs/PRD.md`, `docs/ACCEPTANCE.md`,
  `docs/RUNBOOK-SNAPSHOT-CAPTURE.md`

No new dependencies are planned.
