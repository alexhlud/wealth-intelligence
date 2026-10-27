-- Phase 7b.1: explicit, lossless browser contracts for recorded history.
drop function app.list_recorded_snapshot_history(uuid, date);

create function app.list_recorded_snapshot_history(
  p_portfolio_id uuid,
  p_start_date date default null
)
returns table (
  id uuid,
  as_of_date date,
  market_close_at timestamptz,
  total_net_worth text,
  created_at timestamptz,
  source text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.id, s.as_of_date, s.market_close_at, s.total_net_worth::text, s.created_at, s.source
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
      'id', s.id, 'as_of_date', s.as_of_date, 'market_close_at', s.market_close_at,
      'total_net_worth', s.total_net_worth::text, 'created_at', s.created_at, 'source', s.source,
      'investment_value', s.investment_value::text, 'manual_asset_value', s.manual_asset_value::text,
      'liability_value', s.liability_value::text, 'exchange_mic', s.exchange_mic,
      'exchange_timezone', s.exchange_timezone
    ),
    'positions', coalesce((select jsonb_agg(jsonb_build_object(
      'source_position_id', p.source_position_id, 'account_label', p.account_label, 'symbol', p.symbol,
      'security_name', p.security_name, 'asset_type', p.asset_type, 'quantity', p.quantity::text,
      'average_cost', p.average_cost::text, 'market_price', p.market_price::text, 'price_at', p.price_at,
      'market_value', p.market_value::text, 'cost_basis', p.cost_basis::text,
      'unrealized_gain', p.unrealized_gain::text, 'portfolio_weight', p.portfolio_weight::text,
      'price_source', p.price_source, 'price_kind', p.price_kind
    ) order by p.account_label, p.symbol, p.id)
      from app.snapshot_positions as p
      where p.snapshot_id = s.id and p.user_id = (select auth.uid())), '[]'::jsonb),
    'manual_assets', coalesce((select jsonb_agg(jsonb_build_object(
      'source_manual_asset_id', a.source_manual_asset_id, 'name', a.name, 'category', a.category,
      'account_label', a.account_label, 'value', a.value::text,
      'include_in_net_worth', a.include_in_net_worth, 'effective_at', a.effective_at
    ) order by a.name, a.id)
      from app.snapshot_manual_assets as a
      where a.snapshot_id = s.id and a.user_id = (select auth.uid())), '[]'::jsonb),
    'liabilities', coalesce((select jsonb_agg(jsonb_build_object(
      'source_liability_id', l.source_liability_id, 'name', l.name, 'category', l.category,
      'account_label', l.account_label, 'value', l.balance::text,
      'include_in_net_worth', l.include_in_net_worth, 'effective_at', l.effective_at
    ) order by l.name, l.id)
      from app.snapshot_liabilities as l
      where l.snapshot_id = s.id and l.user_id = (select auth.uid())), '[]'::jsonb)
  )
  from selected_snapshot as s;
$$;

revoke all on function app.get_recorded_snapshot_detail(uuid, uuid) from public, anon;
grant execute on function app.get_recorded_snapshot_detail(uuid, uuid) to authenticated;
