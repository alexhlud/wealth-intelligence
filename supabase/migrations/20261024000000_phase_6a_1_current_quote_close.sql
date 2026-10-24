-- Phase 6a-1: preserve post-close current quotes as distinct immutable evidence.

alter table app.snapshot_positions
  drop constraint snapshot_positions_price_kind_check,
  add constraint snapshot_positions_price_kind_check
    check (price_kind in ('raw_close', 'current_quote_close', 'manual', 'estimate'));

create or replace function app.insert_snapshot_revision(
  p_portfolio_id uuid, p_request_id uuid, p_request_fingerprint text,
  p_as_of_date date, p_market_close_at timestamptz, p_source text,
  p_corrects_snapshot_id uuid, p_correction_reason text,
  p_positions jsonb, p_manual_assets jsonb, p_liabilities jsonb
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_user_id uuid := auth.uid(); v_snapshot_id uuid;
  v_investment_value numeric(28,8); v_cost_basis numeric(28,8);
  v_manual_asset_value numeric(28,8); v_cash_value numeric(28,8);
  v_liability_value numeric(28,8);
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'Authentication required'; end if;
  if p_portfolio_id is null or p_request_id is null or p_request_fingerprint is null
     or p_as_of_date is null or p_market_close_at is null or p_source is null
     or p_positions is null or p_manual_assets is null or p_liabilities is null
     or pg_catalog.jsonb_typeof(p_positions) <> 'array'
     or pg_catalog.jsonb_typeof(p_manual_assets) <> 'array'
     or pg_catalog.jsonb_typeof(p_liabilities) <> 'array'
     or pg_catalog.jsonb_array_length(p_positions) > 500
     or pg_catalog.jsonb_array_length(p_manual_assets) > 500
     or pg_catalog.jsonb_array_length(p_liabilities) > 500 then
    raise exception using errcode = '22023', message = 'Invalid snapshot intent';
  end if;
  if exists (select 1 from pg_catalog.jsonb_array_elements(p_positions) e where pg_catalog.jsonb_typeof(e.value) <> 'object')
     or exists (select 1 from pg_catalog.jsonb_array_elements(p_manual_assets) e where pg_catalog.jsonb_typeof(e.value) <> 'object')
     or exists (select 1 from pg_catalog.jsonb_array_elements(p_liabilities) e where pg_catalog.jsonb_typeof(e.value) <> 'object') then
    raise exception using errcode = '22023', message = 'Invalid snapshot intent';
  end if;
  if exists (select 1 from pg_catalog.jsonb_array_elements(p_positions) e cross join lateral pg_catalog.jsonb_object_keys(e.value) k where k.key not in ('source_position_id','account_label','symbol','security_name','asset_type','quantity','average_cost','market_price','price_at','price_source','price_kind'))
     or exists (select 1 from pg_catalog.jsonb_array_elements(p_manual_assets) e cross join lateral pg_catalog.jsonb_object_keys(e.value) k where k.key not in ('source_manual_asset_id','name','category','account_label','value','include_in_net_worth','currency_code','effective_at'))
     or exists (select 1 from pg_catalog.jsonb_array_elements(p_liabilities) e cross join lateral pg_catalog.jsonb_object_keys(e.value) k where k.key not in ('source_liability_id','name','category','account_label','balance','include_in_net_worth','currency_code','effective_at')) then
    raise exception using errcode = '22023', message = 'Invalid snapshot intent';
  end if;
  if p_source not in ('manual','position_change','daily_close','backfill','correction')
     or (p_source = 'correction') <> (p_corrects_snapshot_id is not null)
     or (p_source = 'correction') <> (p_correction_reason is not null)
     or (p_correction_reason is not null and (p_correction_reason <> pg_catalog.btrim(p_correction_reason) or pg_catalog.char_length(p_correction_reason) not between 1 and 500))
     or extract(isodow from p_as_of_date) not between 1 and 5
     or (p_market_close_at at time zone 'America/New_York')::date <> p_as_of_date
     or (p_market_close_at at time zone 'America/New_York')::time not in (time '13:00:00', time '16:00:00') then
    raise exception using errcode = '22023', message = 'Invalid snapshot intent';
  end if;
  perform 1 from app.portfolios p where p.id = p_portfolio_id and p.user_id = v_user_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Resource unavailable'; end if;
  if exists (
    select 1 from pg_catalog.jsonb_to_recordset(p_positions) r(source_position_id uuid, account_label text, symbol text, security_name text, asset_type text, quantity numeric, average_cost numeric, market_price numeric, price_at timestamptz, price_source text, price_kind text)
    where r.account_label is null or r.account_label <> pg_catalog.btrim(r.account_label) or pg_catalog.char_length(r.account_label) not between 1 and 80
      or r.symbol is null or r.symbol !~ '^[A-Z][A-Z0-9.-]{0,9}$'
      or r.security_name is null or r.security_name <> pg_catalog.btrim(r.security_name) or pg_catalog.char_length(r.security_name) not between 1 and 120
      or r.asset_type is null or r.asset_type not in ('stock','etf','mutual_fund','bond','crypto','cash_equivalent','other')
      or r.quantity is null or r.quantity <= 0 or r.quantity >= 10000000000000000 or r.quantity <> pg_catalog.round(r.quantity,12)
      or r.average_cost is null or r.average_cost < 0 or r.average_cost >= 10000000000000000 or r.average_cost <> pg_catalog.round(r.average_cost,8)
      or r.market_price is null or r.market_price < 0 or r.market_price >= 10000000000000000 or r.market_price <> pg_catalog.round(r.market_price,8)
      or r.price_at is null or r.price_at <> p_market_close_at
      or r.price_source is null or r.price_source <> pg_catalog.btrim(r.price_source) or pg_catalog.char_length(r.price_source) not between 1 and 80
      or r.price_kind is null or r.price_kind not in ('raw_close','current_quote_close','manual','estimate')
  ) then raise exception using errcode = '22023', message = 'Invalid snapshot intent'; end if;
  if exists (
    select 1 from pg_catalog.jsonb_to_recordset(p_manual_assets) r(source_manual_asset_id uuid, name text, category text, account_label text, value numeric, include_in_net_worth boolean, currency_code text, effective_at timestamptz)
    where r.name is null or r.name <> pg_catalog.btrim(r.name) or pg_catalog.char_length(r.name) not between 1 and 120
      or r.category is null or r.category not in ('cash','savings','real_estate','vehicle','business_equity','collectible','other')
      or (r.account_label is not null and (r.account_label <> pg_catalog.btrim(r.account_label) or pg_catalog.char_length(r.account_label) not between 1 and 80))
      or r.value is null or r.value < 0 or r.value >= 10000000000000000 or r.value <> pg_catalog.round(r.value,8)
      or r.include_in_net_worth is null or r.currency_code is null or r.currency_code <> 'USD' or r.effective_at is null or r.effective_at > p_market_close_at
  ) or exists (
    select 1 from pg_catalog.jsonb_to_recordset(p_liabilities) r(source_liability_id uuid, name text, category text, account_label text, balance numeric, include_in_net_worth boolean, currency_code text, effective_at timestamptz)
    where r.name is null or r.name <> pg_catalog.btrim(r.name) or pg_catalog.char_length(r.name) not between 1 and 120
      or r.category is null or r.category not in ('mortgage','vehicle_loan','student_loan','credit_balance','personal_loan','other')
      or (r.account_label is not null and (r.account_label <> pg_catalog.btrim(r.account_label) or pg_catalog.char_length(r.account_label) not between 1 and 80))
      or r.balance is null or r.balance < 0 or r.balance >= 10000000000000000 or r.balance <> pg_catalog.round(r.balance,8)
      or r.include_in_net_worth is null or r.currency_code is null or r.currency_code <> 'USD' or r.effective_at is null or r.effective_at > p_market_close_at
  ) then raise exception using errcode = '22023', message = 'Invalid snapshot intent'; end if;
  if exists (select source_position_id from pg_catalog.jsonb_to_recordset(p_positions) r(source_position_id uuid) where source_position_id is not null group by source_position_id having count(*) > 1)
     or exists (select source_manual_asset_id from pg_catalog.jsonb_to_recordset(p_manual_assets) r(source_manual_asset_id uuid) where source_manual_asset_id is not null group by source_manual_asset_id having count(*) > 1)
     or exists (select source_liability_id from pg_catalog.jsonb_to_recordset(p_liabilities) r(source_liability_id uuid) where source_liability_id is not null group by source_liability_id having count(*) > 1) then
    raise exception using errcode = '22023', message = 'Invalid snapshot intent';
  end if;
  if exists (select 1 from pg_catalog.jsonb_to_recordset(p_positions) r(source_position_id uuid) left join app.positions p on p.id = r.source_position_id and p.user_id = v_user_id and p.portfolio_id = p_portfolio_id where r.source_position_id is not null and p.id is null)
     or exists (select 1 from pg_catalog.jsonb_to_recordset(p_manual_assets) r(source_manual_asset_id uuid) left join app.manual_assets a on a.id = r.source_manual_asset_id and a.user_id = v_user_id and a.portfolio_id = p_portfolio_id where r.source_manual_asset_id is not null and a.id is null)
     or exists (select 1 from pg_catalog.jsonb_to_recordset(p_liabilities) r(source_liability_id uuid) left join app.liabilities l on l.id = r.source_liability_id and l.user_id = v_user_id and l.portfolio_id = p_portfolio_id where r.source_liability_id is not null and l.id is null) then
    raise exception using errcode = 'P0002', message = 'Resource unavailable';
  end if;
  select coalesce(sum((r.quantity * r.market_price)::numeric(28,8)),0), coalesce(sum((r.quantity * r.average_cost)::numeric(28,8)),0) into v_investment_value, v_cost_basis from pg_catalog.jsonb_to_recordset(p_positions) r(quantity numeric, market_price numeric, average_cost numeric);
  select coalesce(sum(r.value) filter (where r.include_in_net_worth),0), coalesce(sum(r.value) filter (where r.include_in_net_worth and r.category = 'cash'),0) into v_manual_asset_value, v_cash_value from pg_catalog.jsonb_to_recordset(p_manual_assets) r(value numeric, include_in_net_worth boolean, category text);
  select coalesce(sum(r.balance) filter (where r.include_in_net_worth),0) into v_liability_value from pg_catalog.jsonb_to_recordset(p_liabilities) r(balance numeric, include_in_net_worth boolean);
  insert into app.portfolio_snapshots (user_id,portfolio_id,request_id,request_fingerprint,as_of_date,market_close_at,source,investment_value,cost_basis,unrealized_gain,cash_value,manual_asset_value,liability_value,total_net_worth,corrects_snapshot_id,correction_reason)
  values (v_user_id,p_portfolio_id,p_request_id,p_request_fingerprint,p_as_of_date,p_market_close_at,p_source,v_investment_value,v_cost_basis,v_investment_value-v_cost_basis,v_cash_value,v_manual_asset_value,v_liability_value,v_investment_value+v_manual_asset_value-v_liability_value,p_corrects_snapshot_id,p_correction_reason) returning id into v_snapshot_id;
  insert into app.snapshot_positions (snapshot_id,user_id,portfolio_id,source_position_id,account_label,symbol,security_name,asset_type,quantity,average_cost,market_price,price_at,price_source,price_kind,market_value,cost_basis,unrealized_gain,unrealized_gain_percent,portfolio_weight)
  select v_snapshot_id,v_user_id,p_portfolio_id,r.source_position_id,r.account_label,r.symbol,r.security_name,r.asset_type,r.quantity,r.average_cost,r.market_price,r.price_at,r.price_source,r.price_kind,(r.quantity*r.market_price)::numeric(28,8),(r.quantity*r.average_cost)::numeric(28,8),((r.quantity*r.market_price)::numeric(28,8)-(r.quantity*r.average_cost)::numeric(28,8)),case when (r.quantity*r.average_cost)::numeric(28,8)=0 then null else round((((r.quantity*r.market_price)::numeric(28,8)-(r.quantity*r.average_cost)::numeric(28,8))/(r.quantity*r.average_cost)::numeric(28,8))*100,12) end,case when v_investment_value=0 then 0 else round((r.quantity*r.market_price)::numeric(28,8)/v_investment_value,12) end from pg_catalog.jsonb_to_recordset(p_positions) r(source_position_id uuid,account_label text,symbol text,security_name text,asset_type text,quantity numeric(28,12),average_cost numeric(24,8),market_price numeric(24,8),price_at timestamptz,price_source text,price_kind text);
  insert into app.snapshot_manual_assets (snapshot_id,user_id,portfolio_id,source_manual_asset_id,name,category,account_label,value,include_in_net_worth,currency_code,effective_at)
  select v_snapshot_id,v_user_id,p_portfolio_id,r.source_manual_asset_id,r.name,r.category,r.account_label,r.value,r.include_in_net_worth,r.currency_code,r.effective_at from pg_catalog.jsonb_to_recordset(p_manual_assets) r(source_manual_asset_id uuid,name text,category text,account_label text,value numeric(24,8),include_in_net_worth boolean,currency_code char(3),effective_at timestamptz);
  insert into app.snapshot_liabilities (snapshot_id,user_id,portfolio_id,source_liability_id,name,category,account_label,balance,include_in_net_worth,currency_code,effective_at)
  select v_snapshot_id,v_user_id,p_portfolio_id,r.source_liability_id,r.name,r.category,r.account_label,r.balance,r.include_in_net_worth,r.currency_code,r.effective_at from pg_catalog.jsonb_to_recordset(p_liabilities) r(source_liability_id uuid,name text,category text,account_label text,balance numeric(24,8),include_in_net_worth boolean,currency_code char(3),effective_at timestamptz);
  return v_snapshot_id;
end;
$$;

comment on function app.insert_snapshot_revision(uuid,uuid,text,date,timestamptz,text,uuid,text,jsonb,jsonb,jsonb)
is 'Preserves immutable snapshot revisions; current_quote_close distinguishes a post-close current quote from a future raw_close provider result.';
