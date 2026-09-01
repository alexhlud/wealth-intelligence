-- Phase 2a: current wealth model, immutable position history, and atomic writes.

revoke all on schema app from public, anon;
grant usage on schema app to authenticated;

alter default privileges in schema app revoke all on tables from public, anon;
alter default privileges in schema app revoke all on sequences from public, anon;
alter default privileges in schema app revoke all on functions from public, anon;
alter default privileges in schema app revoke all on types from public, anon;

create or replace function app.validate_profile_timezone()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_timezone_names
    where name = new.timezone
  ) then
    raise exception using
      errcode = '23514',
      message = 'Invalid profile timezone';
  end if;
  return new;
end;
$$;

create or replace function app.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create or replace function app.reject_history_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'History is immutable';
end;
$$;

create table app.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  display_name text check (
    display_name is null
    or (display_name = btrim(display_name) and char_length(display_name) between 1 and 80)
  ),
  preferred_currency char(3) not null default 'USD'
    check (preferred_currency = 'USD'),
  timezone text not null default 'UTC'
    check (char_length(timezone) between 1 and 64),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

insert into app.profiles (id)
select id from auth.users
on conflict (id) do nothing;

alter table app.portfolios
  add column description text check (
    description is null
    or (description = btrim(description) and char_length(description) between 1 and 240)
  );

alter table app.portfolios
  add constraint portfolios_profile_owner_fk
  foreign key (user_id) references app.profiles (id) on delete restrict
  not valid;
alter table app.portfolios validate constraint portfolios_profile_owner_fk;

create table app.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references app.profiles (id) on delete restrict,
  portfolio_id uuid not null,
  name text not null check (
    name = btrim(name) and char_length(name) between 1 and 80
  ),
  institution_name text check (
    institution_name is null
    or (institution_name = btrim(institution_name) and char_length(institution_name) between 1 and 120)
  ),
  account_type text not null check (
    account_type in ('brokerage', 'retirement', 'savings', 'cash', 'crypto_wallet', 'other')
  ),
  include_in_net_worth boolean not null default true,
  currency_code char(3) not null default 'USD' check (currency_code = 'USD'),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (id, user_id, portfolio_id),
  foreign key (portfolio_id, user_id)
    references app.portfolios (id, user_id) on delete restrict
);

create index accounts_user_id_idx on app.accounts (user_id);
create index accounts_portfolio_id_idx on app.accounts (portfolio_id);

insert into app.accounts (
  user_id,
  portfolio_id,
  name,
  account_type,
  include_in_net_worth
)
select user_id, id, 'Unassigned', 'other', true
from app.portfolios;

alter table app.positions
  drop constraint positions_quantity_check,
  drop constraint positions_average_cost_check;

alter table app.positions
  alter column quantity type numeric(28,12),
  alter column average_cost type numeric(24,8),
  add column account_id uuid,
  add column security_name text,
  add column asset_type text,
  add column status text,
  add column closed_at timestamptz,
  add column last_event_at timestamptz;

update app.positions as p
set account_id = a.id,
    security_name = p.symbol,
    asset_type = 'other',
    status = 'open',
    last_event_at = p.created_at
from app.accounts as a
where a.portfolio_id = p.portfolio_id
  and a.user_id = p.user_id
  and a.name = 'Unassigned';

alter table app.positions
  alter column account_id set not null,
  alter column security_name set not null,
  alter column asset_type set not null,
  alter column status set not null,
  alter column last_event_at set not null,
  add constraint positions_security_name_check check (
    security_name = btrim(security_name)
    and char_length(security_name) between 1 and 120
  ),
  add constraint positions_asset_type_check check (
    asset_type in ('stock', 'etf', 'mutual_fund', 'bond', 'crypto', 'cash_equivalent', 'other')
  ),
  add constraint positions_status_check check (status in ('open', 'closed')),
  add constraint positions_quantity_state_check check (
    (status = 'open' and quantity > 0 and closed_at is null)
    or (status = 'closed' and quantity = 0 and closed_at is not null)
  ),
  add constraint positions_average_cost_nonnegative_check check (average_cost >= 0),
  add constraint positions_account_owner_fk foreign key (account_id, user_id, portfolio_id)
    references app.accounts (id, user_id, portfolio_id) on delete restrict,
  add constraint positions_owner_chain_unique unique (id, user_id, portfolio_id);

create index positions_account_id_idx on app.positions (account_id);

create table app.manual_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references app.profiles (id) on delete restrict,
  portfolio_id uuid not null,
  account_id uuid,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 120),
  category text not null check (
    category in ('cash', 'savings', 'real_estate', 'vehicle', 'business_equity', 'collectible', 'other')
  ),
  current_value numeric(24,8) not null check (current_value >= 0),
  currency_code char(3) not null default 'USD' check (currency_code = 'USD'),
  include_in_net_worth boolean not null default true,
  notes text check (
    notes is null or (notes = btrim(notes) and char_length(notes) between 1 and 500)
  ),
  value_as_of timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (id, user_id, portfolio_id),
  foreign key (portfolio_id, user_id)
    references app.portfolios (id, user_id) on delete restrict,
  foreign key (account_id, user_id, portfolio_id)
    references app.accounts (id, user_id, portfolio_id) on delete restrict
);

create index manual_assets_user_id_idx on app.manual_assets (user_id);
create index manual_assets_portfolio_id_idx on app.manual_assets (portfolio_id);
create index manual_assets_account_id_idx on app.manual_assets (account_id);

create table app.liabilities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references app.profiles (id) on delete restrict,
  portfolio_id uuid not null,
  account_id uuid,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 120),
  category text not null check (
    category in ('mortgage', 'vehicle_loan', 'student_loan', 'credit_balance', 'personal_loan', 'other')
  ),
  outstanding_balance numeric(24,8) not null check (outstanding_balance >= 0),
  currency_code char(3) not null default 'USD' check (currency_code = 'USD'),
  include_in_net_worth boolean not null default true,
  notes text check (
    notes is null or (notes = btrim(notes) and char_length(notes) between 1 and 500)
  ),
  balance_as_of timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (id, user_id, portfolio_id),
  foreign key (portfolio_id, user_id)
    references app.portfolios (id, user_id) on delete restrict,
  foreign key (account_id, user_id, portfolio_id)
    references app.accounts (id, user_id, portfolio_id) on delete restrict
);

create index liabilities_user_id_idx on app.liabilities (user_id);
create index liabilities_portfolio_id_idx on app.liabilities (portfolio_id);
create index liabilities_account_id_idx on app.liabilities (account_id);

create table app.position_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.profiles (id) on delete restrict,
  portfolio_id uuid not null,
  position_id uuid not null,
  request_id uuid not null,
  request_fingerprint text not null check (char_length(request_fingerprint) between 8 and 64),
  event_type text not null check (
    event_type in (
      'initial', 'buy', 'sell', 'correction', 'transfer', 'reinvestment',
      'manual_adjustment', 'split', 'dividend', 'close', 'reopen'
    )
  ),
  previous_account_id uuid,
  new_account_id uuid not null,
  previous_symbol text,
  new_symbol text not null,
  previous_security_name text,
  new_security_name text not null,
  previous_asset_type text,
  new_asset_type text not null,
  previous_quantity numeric(28,12),
  new_quantity numeric(28,12) not null check (new_quantity >= 0),
  quantity_delta numeric(28,12) not null,
  previous_average_cost numeric(24,8),
  new_average_cost numeric(24,8) not null check (new_average_cost >= 0),
  previous_status text,
  new_status text not null check (new_status in ('open', 'closed')),
  split_numerator numeric(28,12),
  split_denominator numeric(28,12),
  dividend_amount numeric(24,8),
  notes text check (
    notes is null or (notes = btrim(notes) and char_length(notes) between 1 and 500)
  ),
  source text not null check (source in ('manual', 'backfill')),
  occurred_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  unique (user_id, request_id),
  foreign key (portfolio_id, user_id)
    references app.portfolios (id, user_id) on delete restrict,
  foreign key (position_id, user_id, portfolio_id)
    references app.positions (id, user_id, portfolio_id) on delete restrict,
  foreign key (previous_account_id, user_id, portfolio_id)
    references app.accounts (id, user_id, portfolio_id) on delete restrict,
  foreign key (new_account_id, user_id, portfolio_id)
    references app.accounts (id, user_id, portfolio_id) on delete restrict,
  check (
    (event_type = 'initial'
      and previous_account_id is null
      and previous_symbol is null
      and previous_security_name is null
      and previous_asset_type is null
      and previous_quantity is null
      and previous_average_cost is null
      and previous_status is null
      and quantity_delta = new_quantity)
    or
    (event_type <> 'initial'
      and previous_account_id is not null
      and previous_symbol is not null
      and previous_security_name is not null
      and previous_asset_type is not null
      and previous_quantity is not null
      and previous_average_cost is not null
      and previous_status is not null
      and quantity_delta = new_quantity - previous_quantity)
  ),
  check (
    (event_type = 'split' and split_numerator > 0 and split_denominator > 0)
    or (event_type <> 'split' and split_numerator is null and split_denominator is null)
  ),
  check (
    (event_type = 'dividend' and dividend_amount >= 0)
    or (event_type <> 'dividend' and dividend_amount is null)
  ),
  check (
    (new_status = 'open' and new_quantity > 0)
    or (new_status = 'closed' and new_quantity = 0)
  )
);

create index position_events_user_id_idx on app.position_events (user_id);
create index position_events_position_timeline_idx
  on app.position_events (position_id, occurred_at, created_at);
create index position_events_portfolio_timeline_idx
  on app.position_events (portfolio_id, occurred_at, created_at);

insert into app.position_events (
  user_id, portfolio_id, position_id, request_id, request_fingerprint,
  event_type, new_account_id, new_symbol, new_security_name, new_asset_type,
  new_quantity, quantity_delta, new_average_cost, new_status, source, occurred_at
)
select
  user_id, portfolio_id, id, id, 'phase-2a-backfill',
  'initial', account_id, symbol, security_name, asset_type,
  quantity, quantity, average_cost, status, 'backfill', created_at
from app.positions;

drop function app.ensure_primary_portfolio();
create function app.ensure_primary_portfolio()
returns app.portfolios
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_portfolio app.portfolios;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  insert into app.profiles (id)
  values (v_user_id)
  on conflict (id) do nothing;

  insert into app.portfolios (user_id, name, is_primary)
  values (v_user_id, 'My portfolio', true)
  on conflict (user_id) where is_primary do nothing;

  select p.* into v_portfolio
  from app.portfolios as p
  where p.user_id = v_user_id and p.is_primary;

  return v_portfolio;
end;
$$;

create function app.create_position(
  p_portfolio_id uuid,
  p_account_id uuid,
  p_symbol text,
  p_security_name text,
  p_asset_type text,
  p_quantity numeric,
  p_average_cost numeric,
  p_occurred_at timestamptz,
  p_notes text,
  p_request_id uuid
)
returns table (position_id uuid, event_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_fingerprint text;
  v_existing app.position_events;
  v_position_id uuid;
  v_event_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  if p_request_id is null or p_portfolio_id is null or p_account_id is null
     or p_symbol is null or p_security_name is null or p_asset_type is null
     or p_quantity is null or p_average_cost is null or p_occurred_at is null then
    raise exception using errcode = '22023', message = 'Invalid position intent';
  end if;

  v_fingerprint := md5(pg_catalog.jsonb_build_object(
    'operation', 'create', 'portfolio_id', p_portfolio_id, 'account_id', p_account_id,
    'symbol', p_symbol, 'security_name', p_security_name, 'asset_type', p_asset_type,
    'quantity', p_quantity, 'average_cost', p_average_cost,
    'occurred_at', p_occurred_at, 'notes', p_notes
  )::text);

  select e.* into v_existing
  from app.position_events as e
  where e.user_id = v_user_id and e.request_id = p_request_id;

  if found then
    if v_existing.event_type <> 'initial' or v_existing.request_fingerprint <> v_fingerprint then
      raise exception using errcode = '22000', message = 'Request ID already used for different intent';
    end if;
    return query select v_existing.position_id, v_existing.id;
    return;
  end if;

  perform 1
  from app.accounts as a
  join app.portfolios as p
    on p.id = a.portfolio_id and p.user_id = a.user_id
  where a.id = p_account_id
    and a.portfolio_id = p_portfolio_id
    and a.user_id = v_user_id
  for update of a, p;

  if not found then
    raise exception using errcode = 'P0002', message = 'Resource unavailable';
  end if;

  begin
    insert into app.positions (
      user_id, portfolio_id, account_id, symbol, security_name, asset_type,
      quantity, average_cost, status, last_event_at
    ) values (
      v_user_id, p_portfolio_id, p_account_id, p_symbol, p_security_name, p_asset_type,
      p_quantity, p_average_cost, 'open', p_occurred_at
    ) returning id into v_position_id;
  exception when check_violation or string_data_right_truncation or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'Invalid position intent';
  end;

  insert into app.position_events (
    user_id, portfolio_id, position_id, request_id, request_fingerprint,
    event_type, new_account_id, new_symbol, new_security_name, new_asset_type,
    new_quantity, quantity_delta, new_average_cost, new_status,
    notes, source, occurred_at
  ) values (
    v_user_id, p_portfolio_id, v_position_id, p_request_id, v_fingerprint,
    'initial', p_account_id, p_symbol, p_security_name, p_asset_type,
    p_quantity, p_quantity, p_average_cost, 'open',
    p_notes, 'manual', p_occurred_at
  ) returning id into v_event_id;

  return query select v_position_id, v_event_id;
end;
$$;

comment on function app.create_position(uuid, uuid, text, text, text, numeric, numeric, timestamptz, text, uuid)
is 'SECURITY DEFINER is required to atomically create a position and its immutable initial event while authenticated clients have no direct write grants; ownership is derived from auth.uid().';

create function app.edit_position(
  p_position_id uuid,
  p_event_type text,
  p_new_account_id uuid,
  p_new_symbol text,
  p_new_security_name text,
  p_new_asset_type text,
  p_new_quantity numeric,
  p_new_average_cost numeric,
  p_split_numerator numeric,
  p_split_denominator numeric,
  p_dividend_amount numeric,
  p_occurred_at timestamptz,
  p_notes text,
  p_request_id uuid
)
returns table (position_id uuid, event_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_fingerprint text;
  v_existing app.position_events;
  v_position app.positions;
  v_account_id uuid;
  v_symbol text;
  v_security_name text;
  v_asset_type text;
  v_quantity numeric(28,12);
  v_average_cost numeric(24,8);
  v_status text;
  v_closed_at timestamptz;
  v_event_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  if p_position_id is null or p_event_type is null or p_occurred_at is null
     or p_request_id is null or p_event_type = 'initial' then
    raise exception using errcode = '22023', message = 'Invalid position intent';
  end if;

  v_fingerprint := md5(pg_catalog.jsonb_build_object(
    'operation', 'edit', 'position_id', p_position_id, 'event_type', p_event_type,
    'account_id', p_new_account_id, 'symbol', p_new_symbol,
    'security_name', p_new_security_name, 'asset_type', p_new_asset_type,
    'quantity', p_new_quantity, 'average_cost', p_new_average_cost,
    'split_numerator', p_split_numerator, 'split_denominator', p_split_denominator,
    'dividend_amount', p_dividend_amount, 'occurred_at', p_occurred_at, 'notes', p_notes
  )::text);

  select e.* into v_existing
  from app.position_events as e
  where e.user_id = v_user_id and e.request_id = p_request_id;

  if found then
    if v_existing.position_id <> p_position_id
       or v_existing.request_fingerprint <> v_fingerprint then
      raise exception using errcode = '22000', message = 'Request ID already used for different intent';
    end if;
    return query select v_existing.position_id, v_existing.id;
    return;
  end if;

  select p.* into v_position
  from app.positions as p
  where p.id = p_position_id and p.user_id = v_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Resource unavailable';
  end if;

  if p_occurred_at < v_position.last_event_at then
    raise exception using errcode = '22023', message = 'Invalid position intent';
  end if;

  if v_position.status = 'closed' and p_event_type <> 'reopen' then
    raise exception using errcode = '22023', message = 'Invalid position intent';
  end if;

  v_account_id := coalesce(p_new_account_id, v_position.account_id);
  v_symbol := coalesce(p_new_symbol, v_position.symbol);
  v_security_name := coalesce(p_new_security_name, v_position.security_name);
  v_asset_type := coalesce(p_new_asset_type, v_position.asset_type);
  v_quantity := coalesce(p_new_quantity, v_position.quantity);
  v_average_cost := coalesce(p_new_average_cost, v_position.average_cost);
  v_status := v_position.status;
  v_closed_at := v_position.closed_at;

  if (v_symbol <> v_position.symbol
      or v_security_name <> v_position.security_name
      or v_asset_type <> v_position.asset_type)
     and p_event_type <> 'correction' then
    raise exception using errcode = '22023', message = 'Invalid position intent';
  end if;

  if v_account_id <> v_position.account_id and p_event_type not in ('transfer', 'correction') then
    raise exception using errcode = '22023', message = 'Invalid position intent';
  end if;

  if p_event_type = 'split' then
    if p_split_numerator is null or p_split_denominator is null
       or p_split_numerator <= 0 or p_split_denominator <= 0
       or p_new_quantity is not null or p_new_average_cost is not null
       or p_dividend_amount is not null then
      raise exception using errcode = '22023', message = 'Invalid position intent';
    end if;
    v_quantity := v_position.quantity * p_split_numerator / p_split_denominator;
    v_average_cost := v_position.average_cost * p_split_denominator / p_split_numerator;
  elsif p_event_type = 'dividend' then
    if p_dividend_amount is null or p_dividend_amount < 0
       or p_new_quantity is not null or p_new_average_cost is not null
       or p_split_numerator is not null or p_split_denominator is not null then
      raise exception using errcode = '22023', message = 'Invalid position intent';
    end if;
  elsif p_event_type = 'transfer' then
    if p_new_account_id is null or p_new_account_id = v_position.account_id
       or p_new_quantity is not null or p_new_average_cost is not null
       or p_split_numerator is not null or p_split_denominator is not null
       or p_dividend_amount is not null then
      raise exception using errcode = '22023', message = 'Invalid position intent';
    end if;
  elsif p_event_type = 'close' then
    if p_new_quantity is not null or p_new_average_cost is not null
       or p_split_numerator is not null or p_split_denominator is not null
       or p_dividend_amount is not null then
      raise exception using errcode = '22023', message = 'Invalid position intent';
    end if;
    v_quantity := 0;
    v_status := 'closed';
    v_closed_at := p_occurred_at;
  elsif p_event_type = 'reopen' then
    if v_position.status <> 'closed' or p_new_quantity is null or p_new_quantity <= 0
       or p_new_average_cost is null or p_new_average_cost < 0
       or p_split_numerator is not null or p_split_denominator is not null
       or p_dividend_amount is not null then
      raise exception using errcode = '22023', message = 'Invalid position intent';
    end if;
    v_status := 'open';
    v_closed_at := null;
  elsif p_event_type = 'buy' then
    if p_new_quantity is null or p_new_quantity <= v_position.quantity
       or p_new_average_cost is null or p_new_average_cost < 0 then
      raise exception using errcode = '22023', message = 'Invalid position intent';
    end if;
  elsif p_event_type = 'sell' then
    if p_new_quantity is null or p_new_quantity <= 0
       or p_new_quantity >= v_position.quantity then
      raise exception using errcode = '22023', message = 'Invalid position intent';
    end if;
  elsif p_event_type = 'reinvestment' then
    if p_new_quantity is null or p_new_quantity <= v_position.quantity
       or p_new_average_cost is null or p_new_average_cost < 0 then
      raise exception using errcode = '22023', message = 'Invalid position intent';
    end if;
  elsif p_event_type in ('correction', 'manual_adjustment') then
    if p_new_quantity is null or p_new_quantity <= 0
       or p_new_average_cost is null or p_new_average_cost < 0 then
      raise exception using errcode = '22023', message = 'Invalid position intent';
    end if;
  else
    raise exception using errcode = '22023', message = 'Invalid position intent';
  end if;

  if p_event_type <> 'split'
     and (p_split_numerator is not null or p_split_denominator is not null) then
    raise exception using errcode = '22023', message = 'Invalid position intent';
  end if;
  if p_event_type <> 'dividend' and p_dividend_amount is not null then
    raise exception using errcode = '22023', message = 'Invalid position intent';
  end if;

  perform 1
  from app.accounts as a
  where a.id = v_account_id
    and a.portfolio_id = v_position.portfolio_id
    and a.user_id = v_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Resource unavailable';
  end if;

  begin
    update app.positions
    set account_id = v_account_id,
        symbol = v_symbol,
        security_name = v_security_name,
        asset_type = v_asset_type,
        quantity = v_quantity,
        average_cost = v_average_cost,
        status = v_status,
        closed_at = v_closed_at,
        last_event_at = p_occurred_at
    where id = v_position.id;
  exception when check_violation or string_data_right_truncation or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'Invalid position intent';
  end;

  insert into app.position_events (
    user_id, portfolio_id, position_id, request_id, request_fingerprint, event_type,
    previous_account_id, new_account_id,
    previous_symbol, new_symbol,
    previous_security_name, new_security_name,
    previous_asset_type, new_asset_type,
    previous_quantity, new_quantity, quantity_delta,
    previous_average_cost, new_average_cost,
    previous_status, new_status,
    split_numerator, split_denominator, dividend_amount,
    notes, source, occurred_at
  ) values (
    v_user_id, v_position.portfolio_id, v_position.id, p_request_id, v_fingerprint, p_event_type,
    v_position.account_id, v_account_id,
    v_position.symbol, v_symbol,
    v_position.security_name, v_security_name,
    v_position.asset_type, v_asset_type,
    v_position.quantity, v_quantity, v_quantity - v_position.quantity,
    v_position.average_cost, v_average_cost,
    v_position.status, v_status,
    p_split_numerator, p_split_denominator, p_dividend_amount,
    p_notes, 'manual', p_occurred_at
  ) returning id into v_event_id;

  return query select v_position.id, v_event_id;
end;
$$;

comment on function app.edit_position(uuid, text, uuid, text, text, text, numeric, numeric, numeric, numeric, numeric, timestamptz, text, uuid)
is 'SECURITY DEFINER is required to atomically update a position and append its immutable event while authenticated clients have no direct write grants; ownership is derived from auth.uid().';

create trigger profiles_set_updated_at
before update on app.profiles
for each row execute function app.set_updated_at();

create trigger profiles_validate_timezone
before insert or update of timezone on app.profiles
for each row execute function app.validate_profile_timezone();

create trigger portfolios_set_updated_at
before update on app.portfolios
for each row execute function app.set_updated_at();

create trigger accounts_set_updated_at
before update on app.accounts
for each row execute function app.set_updated_at();

create trigger positions_set_updated_at
before update on app.positions
for each row execute function app.set_updated_at();

create trigger manual_assets_set_updated_at
before update on app.manual_assets
for each row execute function app.set_updated_at();

create trigger liabilities_set_updated_at
before update on app.liabilities
for each row execute function app.set_updated_at();

create trigger position_events_reject_mutation
before update or delete on app.position_events
for each row execute function app.reject_history_mutation();

alter table app.profiles enable row level security;
alter table app.profiles force row level security;
alter table app.accounts enable row level security;
alter table app.accounts force row level security;
alter table app.manual_assets enable row level security;
alter table app.manual_assets force row level security;
alter table app.liabilities enable row level security;
alter table app.liabilities force row level security;
alter table app.position_events enable row level security;
alter table app.position_events force row level security;

drop policy positions_owner_access on app.positions;

create policy profiles_owner_select on app.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy profiles_owner_insert on app.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy profiles_owner_update on app.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy positions_owner_select on app.positions
  for select to authenticated using ((select auth.uid()) = user_id);

create policy accounts_owner_access on app.accounts
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy manual_assets_owner_access on app.manual_assets
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy liabilities_owner_access on app.liabilities
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy position_events_owner_select on app.position_events
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on all tables in schema app from public, anon, authenticated;
revoke all on all sequences in schema app from public, anon, authenticated;
revoke all on all functions in schema app from public, anon, authenticated;

grant select, insert, update on app.profiles to authenticated;
grant select, insert, update, delete on app.portfolios to authenticated;
grant select, insert, update, delete on app.accounts to authenticated;
grant select on app.positions to authenticated;
grant select, insert, update, delete on app.manual_assets to authenticated;
grant select, insert, update, delete on app.liabilities to authenticated;
grant select on app.position_events to authenticated;

grant execute on function app.ensure_primary_portfolio() to authenticated;
grant execute on function app.create_position(uuid, uuid, text, text, text, numeric, numeric, timestamptz, text, uuid) to authenticated;
grant execute on function app.edit_position(uuid, text, uuid, text, text, text, numeric, numeric, numeric, numeric, numeric, timestamptz, text, uuid) to authenticated;

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

comment on table app.position_events is
  'Append-only position audit history. UPDATE and DELETE are always rejected by trigger.';
