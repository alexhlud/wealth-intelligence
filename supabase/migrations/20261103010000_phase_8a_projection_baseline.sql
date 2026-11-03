-- Phase 8a: read-only recorded composition for an optional projection baseline.
create function app.get_newest_projection_snapshot_baseline(p_portfolio_id uuid)
returns table (
  id uuid, as_of_date date, market_close_at timestamptz,
  investment_value numeric, manual_asset_value numeric, liability_value numeric,
  total_net_worth numeric
)
language sql
security invoker
set search_path = ''
as $$
  select s.id, s.as_of_date, s.market_close_at, s.investment_value,
    s.manual_asset_value, s.liability_value, s.total_net_worth
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

revoke all on all functions in schema app from public, anon;
revoke all on function app.get_newest_projection_snapshot_baseline(uuid) from public, anon;
grant execute on function app.get_newest_projection_snapshot_baseline(uuid) to authenticated;

do $$
declare v_type record;
begin
  for v_type in select t.typname from pg_catalog.pg_type t join pg_catalog.pg_namespace n on n.oid = t.typnamespace where n.nspname = 'app' and t.typtype in ('c', 'd', 'e', 'm', 'r') loop
    execute pg_catalog.format('revoke all on type app.%I from public, anon', v_type.typname);
  end loop;
end $$;
