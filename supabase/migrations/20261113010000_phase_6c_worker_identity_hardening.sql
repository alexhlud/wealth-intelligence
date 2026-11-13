-- Phase 6c-2: fail closed when a worker RPC has no JWT role claim.

create or replace function app.require_snapshot_capture_worker()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'Worker access required';
  end if;
end;
$$;

create or replace function app.get_scheduler_health_status()
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

  perform app.require_mfa_assurance();

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
is 'SECURITY DEFINER is required because scheduler health is service-role-write and browser-unreadable by design; this narrow authenticated AAL2 function is the only read path.';
