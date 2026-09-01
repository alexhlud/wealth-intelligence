-- Phase 2b: immutable portfolio snapshots and append-only corrections.

revoke all on schema app from public, anon;
grant usage on schema app to authenticated;

alter default privileges in schema app revoke all on tables from public, anon;
alter default privileges in schema app revoke all on sequences from public, anon;
alter default privileges in schema app revoke all on functions from public, anon;
alter default privileges in schema app revoke all on types from public, anon;

create table app.portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.profiles (id) on delete restrict,
  portfolio_id uuid not null,
  request_id uuid not null,
  request_fingerprint text not null check (char_length(request_fingerprint) between 8 and 64),
  as_of_date date not null,
  exchange_mic text not null default 'XNYS' check (exchange_mic = 'XNYS'),
  exchange_timezone text not null default 'America/New_York'
    check (exchange_timezone = 'America/New_York'),
  market_close_at timestamptz not null,
  source text not null check (
    source in ('manual', 'position_change', 'daily_close', 'backfill', 'correction')
  ),
  valuation_currency char(3) not null default 'USD' check (valuation_currency = 'USD'),
  investment_value numeric(28,8) not null check (investment_value >= 0),
  cost_basis numeric(28,8) not null check (cost_basis >= 0),
  unrealized_gain numeric(28,8) not null,
  cash_value numeric(28,8) not null check (cash_value >= 0),
  manual_asset_value numeric(28,8) not null check (manual_asset_value >= 0),
  liability_value numeric(28,8) not null check (liability_value >= 0),
  total_net_worth numeric(28,8) not null,
  corrects_snapshot_id uuid,
  correction_reason text check (
    correction_reason is null
    or (correction_reason = btrim(correction_reason)
        and char_length(correction_reason) between 1 and 500)
  ),
  created_at timestamptz not null default pg_catalog.now(),
  unique (id, user_id, portfolio_id),
  unique (user_id, request_id),
  unique (corrects_snapshot_id),
  foreign key (portfolio_id, user_id)
    references app.portfolios (id, user_id) on delete restrict,
  foreign key (corrects_snapshot_id, user_id, portfolio_id)
    references app.portfolio_snapshots (id, user_id, portfolio_id) on delete restrict,
  check (unrealized_gain = investment_value - cost_basis),
  check (cash_value <= manual_asset_value),
  check (total_net_worth = investment_value + manual_asset_value - liability_value),
  check (
    (source = 'correction' and corrects_snapshot_id is not null and correction_reason is not null)
    or
    (source <> 'correction' and corrects_snapshot_id is null and correction_reason is null)
  ),
  check (extract(isodow from as_of_date) between 1 and 5),
  check ((market_close_at at time zone 'America/New_York')::date = as_of_date),
  check (
    (market_close_at at time zone 'America/New_York')::time
      in (time '13:00:00', time '16:00:00')
  )
);

create unique index portfolio_snapshots_one_original_per_close
  on app.portfolio_snapshots (portfolio_id, market_close_at)
  where corrects_snapshot_id is null;
create index portfolio_snapshots_owner_timeline_idx
  on app.portfolio_snapshots (user_id, portfolio_id, as_of_date desc, created_at desc);
create index portfolio_snapshots_leaf_lookup_idx
  on app.portfolio_snapshots (user_id, corrects_snapshot_id);

create table app.snapshot_positions (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null,
  user_id uuid not null,
  portfolio_id uuid not null,
  source_position_id uuid,
  account_label text not null check (
    account_label = btrim(account_label) and char_length(account_label) between 1 and 80
  ),
  symbol text not null check (symbol ~ '^[A-Z][A-Z0-9.-]{0,9}$'),
  security_name text not null check (
    security_name = btrim(security_name) and char_length(security_name) between 1 and 120
  ),
  asset_type text not null check (
    asset_type in ('stock', 'etf', 'mutual_fund', 'bond', 'crypto', 'cash_equivalent', 'other')
  ),
  quantity numeric(28,12) not null check (quantity > 0),
  average_cost numeric(24,8) not null check (average_cost >= 0),
  market_price numeric(24,8) not null check (market_price >= 0),
  price_at timestamptz not null,
  price_source text not null check (
    price_source = btrim(price_source) and char_length(price_source) between 1 and 80
  ),
  price_kind text not null check (price_kind in ('raw_close', 'manual', 'estimate')),
  market_value numeric(28,8) not null check (market_value >= 0),
  cost_basis numeric(28,8) not null check (cost_basis >= 0),
  unrealized_gain numeric(28,8) not null,
  unrealized_gain_percent numeric(38,12),
  portfolio_weight numeric(20,12) not null check (
    portfolio_weight between 0 and 1
  ),
  created_at timestamptz not null default pg_catalog.now(),
  unique (id, user_id, portfolio_id),
  foreign key (snapshot_id, user_id, portfolio_id)
    references app.portfolio_snapshots (id, user_id, portfolio_id) on delete restrict,
  foreign key (source_position_id, user_id, portfolio_id)
    references app.positions (id, user_id, portfolio_id) on delete restrict,
  check (unrealized_gain = market_value - cost_basis),
  check (
    (cost_basis = 0 and unrealized_gain_percent is null)
    or (cost_basis <> 0 and unrealized_gain_percent is not null)
  )
);

create index snapshot_positions_snapshot_id_idx on app.snapshot_positions (snapshot_id);
create index snapshot_positions_source_position_id_idx
  on app.snapshot_positions (source_position_id) where source_position_id is not null;

create table app.snapshot_manual_assets (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null,
  user_id uuid not null,
  portfolio_id uuid not null,
  source_manual_asset_id uuid,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 120),
  category text not null check (
    category in ('cash', 'savings', 'real_estate', 'vehicle', 'business_equity', 'collectible', 'other')
  ),
  account_label text check (
    account_label is null
    or (account_label = btrim(account_label) and char_length(account_label) between 1 and 80)
  ),
  value numeric(24,8) not null check (value >= 0),
  include_in_net_worth boolean not null,
  currency_code char(3) not null default 'USD' check (currency_code = 'USD'),
  effective_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  unique (id, user_id, portfolio_id),
  foreign key (snapshot_id, user_id, portfolio_id)
    references app.portfolio_snapshots (id, user_id, portfolio_id) on delete restrict,
  foreign key (source_manual_asset_id, user_id, portfolio_id)
    references app.manual_assets (id, user_id, portfolio_id) on delete restrict
);

create index snapshot_manual_assets_snapshot_id_idx
  on app.snapshot_manual_assets (snapshot_id);
create index snapshot_manual_assets_source_id_idx
  on app.snapshot_manual_assets (source_manual_asset_id)
  where source_manual_asset_id is not null;

create table app.snapshot_liabilities (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null,
  user_id uuid not null,
  portfolio_id uuid not null,
  source_liability_id uuid,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 120),
  category text not null check (
    category in ('mortgage', 'vehicle_loan', 'student_loan', 'credit_balance', 'personal_loan', 'other')
  ),
  account_label text check (
    account_label is null
    or (account_label = btrim(account_label) and char_length(account_label) between 1 and 80)
  ),
  balance numeric(24,8) not null check (balance >= 0),
  include_in_net_worth boolean not null,
  currency_code char(3) not null default 'USD' check (currency_code = 'USD'),
  effective_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  unique (id, user_id, portfolio_id),
  foreign key (snapshot_id, user_id, portfolio_id)
    references app.portfolio_snapshots (id, user_id, portfolio_id) on delete restrict,
  foreign key (source_liability_id, user_id, portfolio_id)
    references app.liabilities (id, user_id, portfolio_id) on delete restrict
);

create index snapshot_liabilities_snapshot_id_idx
  on app.snapshot_liabilities (snapshot_id);
create index snapshot_liabilities_source_id_idx
  on app.snapshot_liabilities (source_liability_id)
  where source_liability_id is not null;

create function app.insert_snapshot_revision(
  p_portfolio_id uuid,
  p_request_id uuid,
  p_request_fingerprint text,
  p_as_of_date date,
  p_market_close_at timestamptz,
  p_source text,
  p_corrects_snapshot_id uuid,
  p_correction_reason text,
  p_positions jsonb,
  p_manual_assets jsonb,
  p_liabilities jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_snapshot_id uuid;
  v_investment_value numeric(28,8);
  v_cost_basis numeric(28,8);
  v_manual_asset_value numeric(28,8);
  v_cash_value numeric(28,8);
  v_liability_value numeric(28,8);
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

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

  if exists (select 1 from pg_catalog.jsonb_array_elements(p_positions) as e(value)
             where pg_catalog.jsonb_typeof(e.value) <> 'object')
     or exists (select 1 from pg_catalog.jsonb_array_elements(p_manual_assets) as e(value)
                where pg_catalog.jsonb_typeof(e.value) <> 'object')
     or exists (select 1 from pg_catalog.jsonb_array_elements(p_liabilities) as e(value)
                where pg_catalog.jsonb_typeof(e.value) <> 'object') then
    raise exception using errcode = '22023', message = 'Invalid snapshot intent';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_positions) as e(value)
    cross join lateral pg_catalog.jsonb_object_keys(e.value) as k(key)
    where k.key not in (
      'source_position_id', 'account_label', 'symbol', 'security_name', 'asset_type',
      'quantity', 'average_cost', 'market_price', 'price_at', 'price_source', 'price_kind'
    )
  ) or exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_manual_assets) as e(value)
    cross join lateral pg_catalog.jsonb_object_keys(e.value) as k(key)
    where k.key not in (
      'source_manual_asset_id', 'name', 'category', 'account_label', 'value',
      'include_in_net_worth', 'currency_code', 'effective_at'
    )
  ) or exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_liabilities) as e(value)
    cross join lateral pg_catalog.jsonb_object_keys(e.value) as k(key)
    where k.key not in (
      'source_liability_id', 'name', 'category', 'account_label', 'balance',
      'include_in_net_worth', 'currency_code', 'effective_at'
    )
  ) then
    raise exception using errcode = '22023', message = 'Invalid snapshot intent';
  end if;

  if p_source not in ('manual', 'position_change', 'daily_close', 'backfill', 'correction')
     or (p_source = 'correction') <> (p_corrects_snapshot_id is not null)
     or (p_source = 'correction') <> (p_correction_reason is not null)
     or (p_correction_reason is not null and (
       p_correction_reason <> pg_catalog.btrim(p_correction_reason)
       or pg_catalog.char_length(p_correction_reason) not between 1 and 500
     ))
     or extract(isodow from p_as_of_date) not between 1 and 5
     or (p_market_close_at at time zone 'America/New_York')::date <> p_as_of_date
     or (p_market_close_at at time zone 'America/New_York')::time
          not in (time '13:00:00', time '16:00:00') then
    raise exception using errcode = '22023', message = 'Invalid snapshot intent';
  end if;

  perform 1
  from app.portfolios as p
  where p.id = p_portfolio_id and p.user_id = v_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Resource unavailable';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_positions) as r(
      source_position_id uuid, account_label text, symbol text, security_name text,
      asset_type text, quantity numeric, average_cost numeric, market_price numeric,
      price_at timestamptz, price_source text, price_kind text
    )
    where r.account_label is null or r.account_label <> pg_catalog.btrim(r.account_label)
      or pg_catalog.char_length(r.account_label) not between 1 and 80
      or r.symbol is null or r.symbol !~ '^[A-Z][A-Z0-9.-]{0,9}$'
      or r.security_name is null or r.security_name <> pg_catalog.btrim(r.security_name)
      or pg_catalog.char_length(r.security_name) not between 1 and 120
      or r.asset_type is null or r.asset_type not in (
        'stock', 'etf', 'mutual_fund', 'bond', 'crypto', 'cash_equivalent', 'other'
      )
      or r.quantity is null or r.quantity <= 0 or r.quantity >= 10000000000000000
      or r.quantity <> pg_catalog.round(r.quantity, 12)
      or r.average_cost is null or r.average_cost < 0 or r.average_cost >= 10000000000000000
      or r.average_cost <> pg_catalog.round(r.average_cost, 8)
      or r.market_price is null or r.market_price < 0 or r.market_price >= 10000000000000000
      or r.market_price <> pg_catalog.round(r.market_price, 8)
      or r.price_at is null or r.price_at <> p_market_close_at
      or r.price_source is null or r.price_source <> pg_catalog.btrim(r.price_source)
      or pg_catalog.char_length(r.price_source) not between 1 and 80
      or r.price_kind is null or r.price_kind not in ('raw_close', 'manual', 'estimate')
  ) or exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_manual_assets) as r(
      source_manual_asset_id uuid, name text, category text, account_label text,
      value numeric, include_in_net_worth boolean, currency_code text, effective_at timestamptz
    )
    where r.name is null or r.name <> pg_catalog.btrim(r.name)
      or pg_catalog.char_length(r.name) not between 1 and 120
      or r.category is null or r.category not in (
        'cash', 'savings', 'real_estate', 'vehicle', 'business_equity', 'collectible', 'other'
      )
      or (r.account_label is not null and (
        r.account_label <> pg_catalog.btrim(r.account_label)
        or pg_catalog.char_length(r.account_label) not between 1 and 80
      ))
      or r.value is null or r.value < 0 or r.value >= 10000000000000000
      or r.value <> pg_catalog.round(r.value, 8)
      or r.include_in_net_worth is null or r.currency_code is null or r.currency_code <> 'USD'
      or r.effective_at is null or r.effective_at > p_market_close_at
  ) or exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_liabilities) as r(
      source_liability_id uuid, name text, category text, account_label text,
      balance numeric, include_in_net_worth boolean, currency_code text, effective_at timestamptz
    )
    where r.name is null or r.name <> pg_catalog.btrim(r.name)
      or pg_catalog.char_length(r.name) not between 1 and 120
      or r.category is null or r.category not in (
        'mortgage', 'vehicle_loan', 'student_loan', 'credit_balance', 'personal_loan', 'other'
      )
      or (r.account_label is not null and (
        r.account_label <> pg_catalog.btrim(r.account_label)
        or pg_catalog.char_length(r.account_label) not between 1 and 80
      ))
      or r.balance is null or r.balance < 0 or r.balance >= 10000000000000000
      or r.balance <> pg_catalog.round(r.balance, 8)
      or r.include_in_net_worth is null or r.currency_code is null or r.currency_code <> 'USD'
      or r.effective_at is null or r.effective_at > p_market_close_at
  ) then
    raise exception using errcode = '22023', message = 'Invalid snapshot intent';
  end if;

  if exists (
    select r.source_position_id
    from pg_catalog.jsonb_to_recordset(p_positions) as r(source_position_id uuid)
    where r.source_position_id is not null
    group by r.source_position_id having pg_catalog.count(*) > 1
  ) or exists (
    select r.source_manual_asset_id
    from pg_catalog.jsonb_to_recordset(p_manual_assets) as r(source_manual_asset_id uuid)
    where r.source_manual_asset_id is not null
    group by r.source_manual_asset_id having pg_catalog.count(*) > 1
  ) or exists (
    select r.source_liability_id
    from pg_catalog.jsonb_to_recordset(p_liabilities) as r(source_liability_id uuid)
    where r.source_liability_id is not null
    group by r.source_liability_id having pg_catalog.count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'Invalid snapshot intent';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_positions) as r(source_position_id uuid)
    left join app.positions as p
      on p.id = r.source_position_id and p.user_id = v_user_id and p.portfolio_id = p_portfolio_id
    where r.source_position_id is not null and p.id is null
  ) or exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_manual_assets) as r(source_manual_asset_id uuid)
    left join app.manual_assets as a
      on a.id = r.source_manual_asset_id and a.user_id = v_user_id and a.portfolio_id = p_portfolio_id
    where r.source_manual_asset_id is not null and a.id is null
  ) or exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_liabilities) as r(source_liability_id uuid)
    left join app.liabilities as l
      on l.id = r.source_liability_id and l.user_id = v_user_id and l.portfolio_id = p_portfolio_id
    where r.source_liability_id is not null and l.id is null
  ) then
    raise exception using errcode = 'P0002', message = 'Resource unavailable';
  end if;

  select
    coalesce(pg_catalog.sum((r.quantity * r.market_price)::numeric(28,8)), 0),
    coalesce(pg_catalog.sum((r.quantity * r.average_cost)::numeric(28,8)), 0)
  into v_investment_value, v_cost_basis
  from pg_catalog.jsonb_to_recordset(p_positions) as r(
    quantity numeric, market_price numeric, average_cost numeric
  );

  select
    coalesce(pg_catalog.sum(r.value) filter (where r.include_in_net_worth), 0),
    coalesce(pg_catalog.sum(r.value) filter (
      where r.include_in_net_worth and r.category = 'cash'
    ), 0)
  into v_manual_asset_value, v_cash_value
  from pg_catalog.jsonb_to_recordset(p_manual_assets) as r(
    value numeric(24,8), include_in_net_worth boolean, category text
  );

  select coalesce(
    pg_catalog.sum(r.balance) filter (where r.include_in_net_worth), 0
  )
  into v_liability_value
  from pg_catalog.jsonb_to_recordset(p_liabilities) as r(
    balance numeric(24,8), include_in_net_worth boolean
  );

  insert into app.portfolio_snapshots (
    user_id, portfolio_id, request_id, request_fingerprint, as_of_date,
    market_close_at, source, investment_value, cost_basis, unrealized_gain,
    cash_value, manual_asset_value, liability_value, total_net_worth,
    corrects_snapshot_id, correction_reason
  ) values (
    v_user_id, p_portfolio_id, p_request_id, p_request_fingerprint, p_as_of_date,
    p_market_close_at, p_source, v_investment_value, v_cost_basis,
    v_investment_value - v_cost_basis, v_cash_value, v_manual_asset_value,
    v_liability_value, v_investment_value + v_manual_asset_value - v_liability_value,
    p_corrects_snapshot_id, p_correction_reason
  ) returning id into v_snapshot_id;

  insert into app.snapshot_positions (
    snapshot_id, user_id, portfolio_id, source_position_id, account_label,
    symbol, security_name, asset_type, quantity, average_cost, market_price,
    price_at, price_source, price_kind, market_value, cost_basis,
    unrealized_gain, unrealized_gain_percent, portfolio_weight
  )
  select
    v_snapshot_id, v_user_id, p_portfolio_id, r.source_position_id, r.account_label,
    r.symbol, r.security_name, r.asset_type, r.quantity, r.average_cost,
    r.market_price, r.price_at, r.price_source, r.price_kind,
    (r.quantity * r.market_price)::numeric(28,8),
    (r.quantity * r.average_cost)::numeric(28,8),
    ((r.quantity * r.market_price)::numeric(28,8)
      - (r.quantity * r.average_cost)::numeric(28,8)),
    case when (r.quantity * r.average_cost)::numeric(28,8) = 0 then null
      else pg_catalog.round(
        (((r.quantity * r.market_price)::numeric(28,8)
          - (r.quantity * r.average_cost)::numeric(28,8))
          / (r.quantity * r.average_cost)::numeric(28,8)) * 100,
        12
      )
    end,
    case when v_investment_value = 0 then 0
      else pg_catalog.round(
        (r.quantity * r.market_price)::numeric(28,8) / v_investment_value,
        12
      )
    end
  from pg_catalog.jsonb_to_recordset(p_positions) as r(
    source_position_id uuid, account_label text, symbol text, security_name text,
    asset_type text, quantity numeric(28,12), average_cost numeric(24,8),
    market_price numeric(24,8), price_at timestamptz, price_source text, price_kind text
  );

  insert into app.snapshot_manual_assets (
    snapshot_id, user_id, portfolio_id, source_manual_asset_id, name, category,
    account_label, value, include_in_net_worth, currency_code, effective_at
  )
  select
    v_snapshot_id, v_user_id, p_portfolio_id, r.source_manual_asset_id, r.name,
    r.category, r.account_label, r.value, r.include_in_net_worth,
    r.currency_code, r.effective_at
  from pg_catalog.jsonb_to_recordset(p_manual_assets) as r(
    source_manual_asset_id uuid, name text, category text, account_label text,
    value numeric(24,8), include_in_net_worth boolean, currency_code char(3),
    effective_at timestamptz
  );

  insert into app.snapshot_liabilities (
    snapshot_id, user_id, portfolio_id, source_liability_id, name, category,
    account_label, balance, include_in_net_worth, currency_code, effective_at
  )
  select
    v_snapshot_id, v_user_id, p_portfolio_id, r.source_liability_id, r.name,
    r.category, r.account_label, r.balance, r.include_in_net_worth,
    r.currency_code, r.effective_at
  from pg_catalog.jsonb_to_recordset(p_liabilities) as r(
    source_liability_id uuid, name text, category text, account_label text,
    balance numeric(24,8), include_in_net_worth boolean, currency_code char(3),
    effective_at timestamptz
  );

  return v_snapshot_id;
end;
$$;

create function app.create_portfolio_snapshot(
  p_portfolio_id uuid,
  p_as_of_date date,
  p_market_close_at timestamptz,
  p_source text,
  p_positions jsonb,
  p_manual_assets jsonb,
  p_liabilities jsonb,
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_fingerprint text;
  v_existing app.portfolio_snapshots;
  v_positions jsonb;
  v_manual_assets jsonb;
  v_liabilities jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if p_positions is null or pg_catalog.jsonb_typeof(p_positions) <> 'array'
     or p_manual_assets is null or pg_catalog.jsonb_typeof(p_manual_assets) <> 'array'
     or p_liabilities is null or pg_catalog.jsonb_typeof(p_liabilities) <> 'array' then
    raise exception using errcode = '22023', message = 'Invalid snapshot intent';
  end if;

  select coalesce(pg_catalog.jsonb_agg(e.value order by e.value::text), '[]'::jsonb)
  into v_positions from pg_catalog.jsonb_array_elements(p_positions) as e(value);
  select coalesce(pg_catalog.jsonb_agg(e.value order by e.value::text), '[]'::jsonb)
  into v_manual_assets from pg_catalog.jsonb_array_elements(p_manual_assets) as e(value);
  select coalesce(pg_catalog.jsonb_agg(e.value order by e.value::text), '[]'::jsonb)
  into v_liabilities from pg_catalog.jsonb_array_elements(p_liabilities) as e(value);

  v_fingerprint := md5(pg_catalog.jsonb_build_object(
    'operation', 'create_snapshot', 'portfolio_id', p_portfolio_id,
    'as_of_date', p_as_of_date, 'market_close_at', p_market_close_at,
    'source', p_source, 'positions', v_positions,
    'manual_assets', v_manual_assets, 'liabilities', v_liabilities
  )::text);

  select s.* into v_existing
  from app.portfolio_snapshots as s
  where s.user_id = v_user_id and s.request_id = p_request_id;
  if found then
    if v_existing.request_fingerprint <> v_fingerprint
       or v_existing.source = 'correction' then
      raise exception using errcode = '22000', message = 'Request ID already used for different intent';
    end if;
    return v_existing.id;
  end if;

  if p_source = 'correction' then
    raise exception using errcode = '22023', message = 'Invalid snapshot intent';
  end if;

  return app.insert_snapshot_revision(
    p_portfolio_id, p_request_id, v_fingerprint, p_as_of_date, p_market_close_at,
    p_source, null, null, v_positions, v_manual_assets, v_liabilities
  );
exception
  when check_violation or string_data_right_truncation or numeric_value_out_of_range
       or invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode = '22023', message = 'Invalid snapshot intent';
  when unique_violation then
    raise exception using errcode = '22000', message = 'Snapshot already exists for market close';
end;
$$;

comment on function app.create_portfolio_snapshot(uuid, date, timestamptz, text, jsonb, jsonb, jsonb, uuid)
is 'SECURITY DEFINER is required to atomically insert an immutable snapshot and complete child composition while authenticated clients have read-only history grants; ownership is derived from auth.uid().';

create function app.correct_portfolio_snapshot(
  p_snapshot_id uuid,
  p_reason text,
  p_positions jsonb,
  p_manual_assets jsonb,
  p_liabilities jsonb,
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_fingerprint text;
  v_existing app.portfolio_snapshots;
  v_original app.portfolio_snapshots;
  v_positions jsonb;
  v_manual_assets jsonb;
  v_liabilities jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if p_snapshot_id is null or p_request_id is null or p_reason is null
     or p_reason <> pg_catalog.btrim(p_reason)
     or pg_catalog.char_length(p_reason) not between 1 and 500
     or p_positions is null or pg_catalog.jsonb_typeof(p_positions) <> 'array'
     or p_manual_assets is null or pg_catalog.jsonb_typeof(p_manual_assets) <> 'array'
     or p_liabilities is null or pg_catalog.jsonb_typeof(p_liabilities) <> 'array' then
    raise exception using errcode = '22023', message = 'Invalid snapshot correction';
  end if;

  select coalesce(pg_catalog.jsonb_agg(e.value order by e.value::text), '[]'::jsonb)
  into v_positions from pg_catalog.jsonb_array_elements(p_positions) as e(value);
  select coalesce(pg_catalog.jsonb_agg(e.value order by e.value::text), '[]'::jsonb)
  into v_manual_assets from pg_catalog.jsonb_array_elements(p_manual_assets) as e(value);
  select coalesce(pg_catalog.jsonb_agg(e.value order by e.value::text), '[]'::jsonb)
  into v_liabilities from pg_catalog.jsonb_array_elements(p_liabilities) as e(value);

  v_fingerprint := md5(pg_catalog.jsonb_build_object(
    'operation', 'correct_snapshot', 'snapshot_id', p_snapshot_id,
    'reason', p_reason, 'positions', v_positions,
    'manual_assets', v_manual_assets, 'liabilities', v_liabilities
  )::text);

  select s.* into v_existing
  from app.portfolio_snapshots as s
  where s.user_id = v_user_id and s.request_id = p_request_id;
  if found then
    if v_existing.request_fingerprint <> v_fingerprint
       or v_existing.source <> 'correction'
       or v_existing.corrects_snapshot_id <> p_snapshot_id then
      raise exception using errcode = '22000', message = 'Request ID already used for different intent';
    end if;
    return v_existing.id;
  end if;

  select s.* into v_original
  from app.portfolio_snapshots as s
  where s.id = p_snapshot_id and s.user_id = v_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Resource unavailable';
  end if;

  if exists (
    select 1 from app.portfolio_snapshots as s
    where s.user_id = v_user_id and s.corrects_snapshot_id = v_original.id
  ) then
    raise exception using errcode = '22023', message = 'Snapshot is not correction-chain leaf';
  end if;

  return app.insert_snapshot_revision(
    v_original.portfolio_id, p_request_id, v_fingerprint,
    v_original.as_of_date, v_original.market_close_at, 'correction',
    v_original.id, p_reason, v_positions, v_manual_assets, v_liabilities
  );
exception
  when check_violation or string_data_right_truncation or numeric_value_out_of_range
       or invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode = '22023', message = 'Invalid snapshot correction';
  when unique_violation then
    raise exception using errcode = '22023', message = 'Snapshot is not correction-chain leaf';
end;
$$;

comment on function app.correct_portfolio_snapshot(uuid, text, jsonb, jsonb, jsonb, uuid)
is 'SECURITY DEFINER is required to atomically append a complete immutable snapshot correction while authenticated clients have read-only history grants; ownership and correction-chain leaf state are verified from auth.uid().';

create trigger portfolio_snapshots_reject_mutation
before update or delete on app.portfolio_snapshots
for each row execute function app.reject_history_mutation();

create trigger snapshot_positions_reject_mutation
before update or delete on app.snapshot_positions
for each row execute function app.reject_history_mutation();

create trigger snapshot_manual_assets_reject_mutation
before update or delete on app.snapshot_manual_assets
for each row execute function app.reject_history_mutation();

create trigger snapshot_liabilities_reject_mutation
before update or delete on app.snapshot_liabilities
for each row execute function app.reject_history_mutation();

alter table app.portfolio_snapshots enable row level security;
alter table app.portfolio_snapshots force row level security;
alter table app.snapshot_positions enable row level security;
alter table app.snapshot_positions force row level security;
alter table app.snapshot_manual_assets enable row level security;
alter table app.snapshot_manual_assets force row level security;
alter table app.snapshot_liabilities enable row level security;
alter table app.snapshot_liabilities force row level security;

create policy portfolio_snapshots_owner_select on app.portfolio_snapshots
  for select to authenticated using ((select auth.uid()) = user_id);
create policy snapshot_positions_owner_select on app.snapshot_positions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy snapshot_manual_assets_owner_select on app.snapshot_manual_assets
  for select to authenticated using ((select auth.uid()) = user_id);
create policy snapshot_liabilities_owner_select on app.snapshot_liabilities
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on app.portfolio_snapshots, app.snapshot_positions,
  app.snapshot_manual_assets, app.snapshot_liabilities
  from public, anon, authenticated;
grant select on app.portfolio_snapshots, app.snapshot_positions,
  app.snapshot_manual_assets, app.snapshot_liabilities
  to authenticated;

revoke all on all functions in schema app from public, anon;
revoke all on function app.insert_snapshot_revision(
  uuid, uuid, text, date, timestamptz, text, uuid, text, jsonb, jsonb, jsonb
) from authenticated;
grant execute on function app.create_portfolio_snapshot(
  uuid, date, timestamptz, text, jsonb, jsonb, jsonb, uuid
) to authenticated;
grant execute on function app.correct_portfolio_snapshot(
  uuid, text, jsonb, jsonb, jsonb, uuid
) to authenticated;

revoke all on schema app from public, anon;
revoke all on all tables in schema app from public, anon;
revoke all on all sequences in schema app from public, anon;
revoke all on all functions in schema app from public, anon;
do $$
declare
  v_type record;
begin
  for v_type in
    select t.typname
    from pg_catalog.pg_type as t
    join pg_catalog.pg_namespace as n on n.oid = t.typnamespace
    where n.nspname = 'app'
      and t.typtype in ('c', 'd', 'e', 'm', 'r')
  loop
    execute pg_catalog.format(
      'revoke all on type app.%I from public, anon',
      v_type.typname
    );
  end loop;
end;
$$;
