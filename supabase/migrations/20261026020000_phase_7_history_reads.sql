-- Phase 7a: owner-scoped read of current correction-chain leaves only.
create or replace function app.list_recorded_snapshot_history(
  p_portfolio_id uuid,
  p_start_date date default null
)
returns table (
  id uuid,
  as_of_date date,
  market_close_at timestamptz,
  total_net_worth numeric(28,8),
  created_at timestamptz,
  source text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.id, s.as_of_date, s.market_close_at, s.total_net_worth, s.created_at, s.source
  from app.portfolio_snapshots as s
  where s.portfolio_id = p_portfolio_id
    and s.user_id = (select auth.uid())
    and (p_start_date is null or s.as_of_date >= p_start_date)
    and not exists (
      select 1
      from app.portfolio_snapshots as replacement
      where replacement.corrects_snapshot_id = s.id
        and replacement.user_id = (select auth.uid())
        and replacement.portfolio_id = p_portfolio_id
    )
  order by s.as_of_date asc, s.created_at asc, s.id asc;
$$;

revoke all on function app.list_recorded_snapshot_history(uuid, date) from public, anon;
grant execute on function app.list_recorded_snapshot_history(uuid, date) to authenticated;
