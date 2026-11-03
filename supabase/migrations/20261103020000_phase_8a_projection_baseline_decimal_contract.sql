-- PostgREST serializes NUMERIC as JSON numbers. Projection baselines retain
-- canonical decimal strings at the browser boundary.
drop function app.get_newest_projection_snapshot_baseline(uuid);

create function app.get_newest_projection_snapshot_baseline(p_portfolio_id uuid)
returns table (
  id uuid, as_of_date date, market_close_at timestamptz,
  investment_value text, manual_asset_value text, liability_value text,
  total_net_worth text
)
language sql
security invoker
set search_path = ''
as $$
  select s.id, s.as_of_date, s.market_close_at,
    s.investment_value::text as investment_value,
    s.manual_asset_value::text as manual_asset_value,
    s.liability_value::text as liability_value,
    s.total_net_worth::text as total_net_worth
  from app.portfolio_snapshots s
  where s.portfolio_id = p_portfolio_id
    and s.user_id = (select auth.uid())
    and not exists (
      select 1 from app.portfolio_snapshots newer
      where newer.user_id = s.user_id and newer.corrects_snapshot_id = s.id
    )
  order by s.as_of_date desc, s.created_at desc
  limit 1
$$;

revoke all on function app.get_newest_projection_snapshot_baseline(uuid) from public, anon;
grant execute on function app.get_newest_projection_snapshot_baseline(uuid) to authenticated;
