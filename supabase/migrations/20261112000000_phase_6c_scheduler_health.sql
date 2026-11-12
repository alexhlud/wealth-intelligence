-- Phase 6c-2: narrow scheduler-health observability without browser table access.
-- The trading calendar currently exists here, in the Edge calendar, and in
-- historical-backfill SQL. app.xnys_sessions is the designated source of
-- truth; the other two copies are pending consolidation.

create table app.xnys_sessions (
  as_of_date date primary key,
  market_close_at timestamptz not null,
  check ((market_close_at at time zone 'America/New_York')::date = as_of_date),
  check ((market_close_at at time zone 'America/New_York')::time in (
    time '13:00:00', time '16:00:00'
  ))
);

insert into app.xnys_sessions (as_of_date, market_close_at)
select session_date,
  ((session_date::text || case
    when session_date in (
      date '2026-11-27', date '2026-12-24', date '2027-11-26'
    ) then ' 13:00:00'
    else ' 16:00:00'
  end)::timestamp at time zone 'America/New_York')
from (
  select calendar.session_at::date as session_date
  from pg_catalog.generate_series(
    date '2026-01-01', date '2027-12-31', interval '1 day'
  ) as calendar(session_at)
) as calendar
where extract(isodow from session_date) between 1 and 5
  and session_date not in (
    date '2026-01-01', date '2026-01-19', date '2026-02-16',
    date '2026-04-03', date '2026-05-25', date '2026-06-19',
    date '2026-07-03', date '2026-09-07', date '2026-11-26',
    date '2026-12-25', date '2027-01-01', date '2027-01-18',
    date '2027-02-15', date '2027-03-26', date '2027-05-31',
    date '2027-06-18', date '2027-07-05', date '2027-09-06',
    date '2027-11-25', date '2027-12-24'
  );

revoke all on app.xnys_sessions from public, anon, authenticated;
revoke all on type app.xnys_sessions from public, anon, authenticated;
alter table app.xnys_sessions enable row level security;
alter table app.xnys_sessions force row level security;

create table app.scheduler_health (
  singleton boolean primary key default true check (singleton),
  created_at timestamptz not null default pg_catalog.now(),
  last_capture_at timestamptz,
  last_invocation_at timestamptz,
  last_auth_failure_at timestamptz,
  consecutive_auth_failures integer not null default 0
    check (consecutive_auth_failures >= 0),
  last_auth_failure_method text,
  last_auth_failure_secret_length integer,
  last_auth_failure_token_matched boolean,
  last_auth_failure_origin_matched boolean,
  updated_at timestamptz not null default pg_catalog.now(),
  check (
    last_auth_failure_secret_length is null
    or last_auth_failure_secret_length >= 0
  )
);

insert into app.scheduler_health (singleton) values (true);

alter table app.scheduler_health enable row level security;
alter table app.scheduler_health force row level security;
revoke all on app.scheduler_health from public, anon, authenticated;
revoke all on type app.scheduler_health from public, anon, authenticated;

create function app.record_scheduler_auth_failure(
  p_method text,
  p_secret_length integer,
  p_token_matched boolean,
  p_origin_matched boolean
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_snapshot_capture_worker();

  if p_method is null
     or pg_catalog.char_length(p_method) > 16
     or p_secret_length is null
     or p_secret_length < 0
     or p_token_matched is null
     or p_origin_matched is null then
    raise exception using errcode = '22023', message = 'Invalid scheduler diagnostics';
  end if;

  update app.scheduler_health
  set last_auth_failure_at = pg_catalog.now(),
    consecutive_auth_failures = consecutive_auth_failures + 1,
    last_auth_failure_method = p_method,
    last_auth_failure_secret_length = p_secret_length,
    last_auth_failure_token_matched = p_token_matched,
    last_auth_failure_origin_matched = p_origin_matched,
    updated_at = pg_catalog.now()
  where singleton;

  if not found then
    raise exception using errcode = '55000', message = 'Scheduler health unavailable';
  end if;
end;
$$;

comment on function app.record_scheduler_auth_failure(text,integer,boolean,boolean)
is 'SECURITY DEFINER is required because only the trusted Edge worker service role may persist safe scheduler authentication diagnostics in the browser-unreadable health table.';

create function app.record_scheduler_invocation(p_captured boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_snapshot_capture_worker();

  if p_captured is null then
    raise exception using errcode = '22023', message = 'Invalid scheduler invocation';
  end if;

  update app.scheduler_health
  set last_invocation_at = pg_catalog.now(),
    last_capture_at = case when p_captured then pg_catalog.now() else last_capture_at end,
    consecutive_auth_failures = case when p_captured then 0 else consecutive_auth_failures end,
    updated_at = pg_catalog.now()
  where singleton;

  if not found then
    raise exception using errcode = '55000', message = 'Scheduler health unavailable';
  end if;
end;
$$;

comment on function app.record_scheduler_invocation(boolean)
is 'SECURITY DEFINER is required because only the trusted Edge worker service role may record scheduler invocation and completed-capture health in the browser-unreadable health table.';

create function app.get_scheduler_health_status()
returns table (alert boolean, alert_since timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_missing_sessions bigint;
  v_alert_since timestamptz;
  v_coverage_end timestamptz;
  v_coverage_exhausted boolean;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  select pg_catalog.count(*), pg_catalog.min(session.market_close_at)
  into v_missing_sessions, v_alert_since
  from app.xnys_sessions as session
  cross join app.scheduler_health as health
  where session.market_close_at <= pg_catalog.now()
    and (
      (health.last_capture_at is not null
        and session.market_close_at > health.last_capture_at)
      or (health.last_capture_at is null
        and session.market_close_at >= health.created_at)
    );

  select pg_catalog.max(session.market_close_at)
  into v_coverage_end
  from app.xnys_sessions as session;

  v_coverage_exhausted := v_coverage_end is null
    or v_coverage_end < pg_catalog.now();

  return query
  select v_missing_sessions >= 2 or v_coverage_exhausted,
    case when v_missing_sessions >= 2 or v_coverage_exhausted
      then coalesce(v_alert_since, v_coverage_end)
      else null
    end;
end;
$$;

comment on function app.get_scheduler_health_status()
is 'SECURITY DEFINER is required because scheduler health is service-role-write and browser-unreadable by design; this narrow authenticated function is the only read path.';

revoke all on function app.record_scheduler_auth_failure(text,integer,boolean,boolean)
  from public, anon, authenticated;
revoke all on function app.record_scheduler_invocation(boolean)
  from public, anon, authenticated;
revoke all on function app.get_scheduler_health_status()
  from public, anon;
grant execute on function app.record_scheduler_auth_failure(text,integer,boolean,boolean)
  to service_role;
grant execute on function app.record_scheduler_invocation(boolean)
  to service_role;
grant execute on function app.get_scheduler_health_status() to authenticated;
