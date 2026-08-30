-- Phase 0.5 owns private financial data in an explicitly exposed application schema.
create schema if not exists app;

revoke all on schema app from public, anon;
grant usage on schema app to authenticated;

create table app.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null check (char_length(name) between 1 and 80),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create unique index portfolios_one_primary_per_user
  on app.portfolios (user_id) where is_primary;
create index portfolios_user_id_idx on app.portfolios (user_id);

create table app.positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  portfolio_id uuid not null,
  symbol text not null check (symbol ~ '^[A-Z][A-Z0-9.-]{0,9}$'),
  quantity numeric(20,8) not null check (quantity > 0),
  average_cost numeric(20,8) not null check (average_cost > 0),
  currency_code char(3) not null default 'USD' check (currency_code = 'USD'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (portfolio_id, user_id) references app.portfolios (id, user_id)
);

create index positions_user_id_idx on app.positions (user_id);
create index positions_portfolio_id_idx on app.positions (portfolio_id);

alter table app.portfolios enable row level security;
alter table app.portfolios force row level security;
alter table app.positions enable row level security;
alter table app.positions force row level security;

create policy portfolios_owner_access on app.portfolios
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy positions_owner_access on app.positions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from app.portfolios
      where portfolios.id = positions.portfolio_id
        and portfolios.user_id = (select auth.uid())
    )
  );

revoke all on all tables in schema app from public, anon;
revoke all on all sequences in schema app from public, anon;
grant select, insert, update, delete on app.portfolios, app.positions to authenticated;

alter default privileges in schema app revoke all on tables from public, anon;
alter default privileges in schema app revoke all on sequences from public, anon;
alter default privileges in schema app revoke all on functions from public, anon;

create or replace function app.ensure_primary_portfolio()
returns app.portfolios
language plpgsql
security invoker
set search_path = ''
as $$
declare
  primary_portfolio app.portfolios;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into app.portfolios (user_id, name, is_primary)
  values (auth.uid(), 'My portfolio', true)
  on conflict (user_id) where is_primary do nothing;

  select * into primary_portfolio
  from app.portfolios
  where user_id = auth.uid() and is_primary;

  return primary_portfolio;
end;
$$;

revoke all on function app.ensure_primary_portfolio() from public, anon;
grant execute on function app.ensure_primary_portfolio() to authenticated;
