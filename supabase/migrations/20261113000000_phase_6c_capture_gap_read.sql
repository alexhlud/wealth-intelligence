-- Phase 6c-2: narrow authenticated AAL2 read of caller-owned capture gaps.

drop function app.list_snapshot_capture_gaps(uuid);

create function app.list_snapshot_capture_gaps()
returns table (as_of_date date, reason text, failure_category text)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  perform app.require_mfa_assurance();

  return query
  select request.as_of_date, request.reason, request.failure_category
  from app.snapshot_capture_requests as request
  join app.portfolios as portfolio
    on portfolio.id = request.portfolio_id
    and portfolio.user_id = request.user_id
  where request.user_id = (select auth.uid())
    and portfolio.user_id = (select auth.uid())
    and request.status = 'gap'
  order by request.as_of_date desc;
end;
$$;

comment on function app.list_snapshot_capture_gaps()
is 'SECURITY DEFINER is required because capture requests have no browser table grant; this narrow AAL2-checked read returns only gap fields for portfolios owned by auth.uid().';

revoke all on function app.list_snapshot_capture_gaps() from public, anon;
grant execute on function app.list_snapshot_capture_gaps() to authenticated;
