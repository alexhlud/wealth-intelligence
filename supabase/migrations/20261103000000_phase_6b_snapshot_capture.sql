-- Phase 6b: private, best-effort completed-session capture.  This records a
-- missed session as a gap; it never manufactures an earlier snapshot.

create table app.snapshot_capture_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.profiles(id) on delete restrict,
  portfolio_id uuid not null,
  as_of_date date,
  reason text not null default 'daily_close' check (reason in ('daily_close', 'position_change')),
  status text not null default 'pending' check (status in ('pending', 'captured', 'gap', 'skipped')),
  failure_category text check (failure_category is null or failure_category in ('calendar_unavailable', 'outside_capture_window', 'state_changed_after_close', 'price_unavailable', 'storage_unavailable')),
  attempts integer not null default 0 check (attempts between 0 and 12),
  last_attempt_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (portfolio_id, as_of_date),
  foreign key (portfolio_id, user_id) references app.portfolios(id, user_id) on delete restrict
);

create unique index snapshot_capture_requests_pending_portfolio_idx
  on app.snapshot_capture_requests (portfolio_id) where as_of_date is null and status = 'pending';
create index snapshot_capture_requests_user_gap_idx
  on app.snapshot_capture_requests (user_id, portfolio_id, as_of_date) where status = 'gap';

alter table app.snapshot_capture_requests enable row level security;
alter table app.snapshot_capture_requests force row level security;
revoke all on app.snapshot_capture_requests from public, anon, authenticated;

create function app.enqueue_snapshot_capture_request()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid; v_portfolio_id uuid;
begin
  v_user_id := coalesce(new.user_id, old.user_id);
  v_portfolio_id := coalesce(new.portfolio_id, old.portfolio_id);
  if v_user_id is null or v_portfolio_id is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  insert into app.snapshot_capture_requests (user_id, portfolio_id, reason)
  values (v_user_id, v_portfolio_id, 'position_change')
  on conflict (portfolio_id) where as_of_date is null and status = 'pending'
  do update set reason = 'position_change', updated_at = pg_catalog.now();
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
comment on function app.enqueue_snapshot_capture_request()
is 'SECURITY DEFINER permits a current-state write to atomically enqueue a private capture request; no browser role can read or write the queue.';

create trigger positions_enqueue_snapshot_capture
after insert or update or delete on app.positions
for each row execute function app.enqueue_snapshot_capture_request();
create trigger manual_assets_enqueue_snapshot_capture
after insert or update or delete on app.manual_assets
for each row execute function app.enqueue_snapshot_capture_request();
create trigger liabilities_enqueue_snapshot_capture
after insert or update or delete on app.liabilities
for each row execute function app.enqueue_snapshot_capture_request();

create function app.require_snapshot_capture_worker()
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise exception using errcode = '42501', message = 'Worker access required';
  end if;
end;
$$;

create function app.record_snapshot_capture_session(
  p_user_id uuid, p_portfolio_id uuid, p_as_of_date date, p_reason text,
  p_status text, p_failure_category text default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_snapshot_capture_worker();
  if p_as_of_date is null or p_reason not in ('daily_close', 'position_change')
     or p_status not in ('captured', 'gap', 'skipped')
     or (p_failure_category is not null and p_failure_category not in ('calendar_unavailable', 'outside_capture_window', 'state_changed_after_close', 'price_unavailable', 'storage_unavailable'))
     or not exists (select 1 from app.portfolios where id = p_portfolio_id and user_id = p_user_id) then
    raise exception using errcode = '22023', message = 'Invalid capture status';
  end if;
  insert into app.snapshot_capture_requests (user_id, portfolio_id, as_of_date, reason, status, failure_category, attempts, last_attempt_at)
  values (p_user_id, p_portfolio_id, p_as_of_date, p_reason, p_status, p_failure_category, 1, pg_catalog.now())
  on conflict (portfolio_id, as_of_date) do update set
    reason = case when excluded.reason = 'position_change' then 'position_change' else app.snapshot_capture_requests.reason end,
    status = case when app.snapshot_capture_requests.status = 'captured' then 'captured' else excluded.status end,
    failure_category = case when excluded.status = 'gap' then excluded.failure_category else null end,
    attempts = least(12, app.snapshot_capture_requests.attempts + 1),
    last_attempt_at = pg_catalog.now(), updated_at = pg_catalog.now();
  delete from app.snapshot_capture_requests where portfolio_id = p_portfolio_id and as_of_date is null and status = 'pending';
end;
$$;
comment on function app.record_snapshot_capture_session(uuid,uuid,date,text,text,text)
is 'SECURITY DEFINER is limited to the trusted Edge worker service role. It persists an honest completed-session result and never writes financial facts.';

create function app.create_scheduled_portfolio_snapshot(
  p_user_id uuid, p_portfolio_id uuid, p_as_of_date date, p_market_close_at timestamptz,
  p_source text, p_positions jsonb, p_manual_assets jsonb, p_liabilities jsonb, p_request_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_snapshot_id uuid;
begin
  perform app.require_snapshot_capture_worker();
  if p_source not in ('daily_close', 'position_change')
     or not exists (select 1 from app.portfolios where id = p_portfolio_id and user_id = p_user_id) then
    raise exception using errcode = '22023', message = 'Invalid scheduled snapshot intent';
  end if;
  -- The Phase 2b inner path remains the single payload validator and atomic
  -- immutable writer. Its identity comes from this verified portfolio row.
  perform pg_catalog.set_config('request.jwt.claim.sub', p_user_id::text, true);
  select app.create_portfolio_snapshot_mfa1_inner(p_portfolio_id, p_as_of_date,
    p_market_close_at, p_source, p_positions, p_manual_assets, p_liabilities,
    p_request_id) into v_snapshot_id;
  return v_snapshot_id;
end;
$$;
comment on function app.create_scheduled_portfolio_snapshot(uuid,uuid,date,timestamptz,text,jsonb,jsonb,jsonb,uuid)
is 'SECURITY DEFINER is required only for the private scheduler service role to invoke the existing atomic Phase 2b snapshot writer with a portfolio identity verified in this function.';

create function app.list_snapshot_capture_gaps(p_portfolio_id uuid)
returns table (as_of_date date, reason text, failure_category text)
language sql security invoker set search_path = '' stable as $$
  select r.as_of_date, r.reason, r.failure_category
  from app.snapshot_capture_requests r
  where r.user_id = (select auth.uid()) and r.portfolio_id = p_portfolio_id
    and r.status = 'gap'
  order by r.as_of_date desc;
$$;
revoke all on function app.require_snapshot_capture_worker() from public, anon, authenticated;
revoke all on function app.record_snapshot_capture_session(uuid,uuid,date,text,text,text) from public, anon, authenticated;
revoke all on function app.create_scheduled_portfolio_snapshot(uuid,uuid,date,timestamptz,text,jsonb,jsonb,jsonb,uuid) from public, anon, authenticated;
revoke all on function app.list_snapshot_capture_gaps(uuid) from public, anon;
grant execute on function app.list_snapshot_capture_gaps(uuid) to authenticated;

-- Dashboard setup must create the two Vault secrets before this migration is
-- applied: snapshot_capture_url and snapshot_capture_scheduler_secret.
select cron.schedule('snapshot-capture-weekdays', '*/15 * * * 1-5', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'snapshot_capture_url'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'snapshot_capture_scheduler_secret')),
    body := '{}'::jsonb
  );
$$);
