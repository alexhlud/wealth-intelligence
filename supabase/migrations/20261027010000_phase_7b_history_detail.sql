-- Phase 7b: complete immutable detail for one owner-visible correction leaf.
create or replace function app.get_recorded_snapshot_detail(
  p_portfolio_id uuid,
  p_snapshot_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with selected_snapshot as (
    select s.*
    from app.portfolio_snapshots as s
    where s.id = p_snapshot_id
      and s.portfolio_id = p_portfolio_id
      and s.user_id = (select auth.uid())
      and not exists (
        select 1
        from app.portfolio_snapshots as replacement
        where replacement.corrects_snapshot_id = s.id
          and replacement.portfolio_id = p_portfolio_id
          and replacement.user_id = (select auth.uid())
      )
  )
  select jsonb_build_object(
    'snapshot', jsonb_build_object(
      'id', s.id,
      'as_of_date', s.as_of_date,
      'market_close_at', s.market_close_at,
      'total_net_worth', s.total_net_worth,
      'created_at', s.created_at,
      'source', s.source,
      'investment_value', s.investment_value,
      'manual_asset_value', s.manual_asset_value,
      'liability_value', s.liability_value,
      'exchange_mic', s.exchange_mic,
      'exchange_timezone', s.exchange_timezone
    ),
    'positions', coalesce((select jsonb_agg(to_jsonb(p) order by p.account_label, p.symbol, p.id)
      from app.snapshot_positions as p
      where p.snapshot_id = s.id and p.user_id = (select auth.uid())), '[]'::jsonb),
    'manual_assets', coalesce((select jsonb_agg(to_jsonb(a) order by a.name, a.id)
      from app.snapshot_manual_assets as a
      where a.snapshot_id = s.id and a.user_id = (select auth.uid())), '[]'::jsonb),
    'liabilities', coalesce((select jsonb_agg(to_jsonb(l) order by l.name, l.id)
      from app.snapshot_liabilities as l
      where l.snapshot_id = s.id and l.user_id = (select auth.uid())), '[]'::jsonb)
  )
  from selected_snapshot as s;
$$;

revoke all on function app.get_recorded_snapshot_detail(uuid, uuid) from public, anon;
grant execute on function app.get_recorded_snapshot_detail(uuid, uuid) to authenticated;
