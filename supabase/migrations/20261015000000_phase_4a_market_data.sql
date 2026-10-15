create table app.quote_cache (
  provider text not null check (provider = 'finnhub'),
  market text not null check (market = 'us_equities'),
  symbol text not null check (symbol ~ '^[A-Z][A-Z0-9.-]{0,9}$'),
  price numeric(24, 12) not null check (price >= 0),
  previous_close numeric(24, 12) not null check (previous_close >= 0),
  change numeric(24, 12) not null,
  change_percent numeric(24, 12) not null,
  provider_timestamp timestamptz,
  fetched_at timestamptz not null default now(),
  last_successful_at timestamptz not null default now(),
  delay_minutes integer check (delay_minutes is null or delay_minutes >= 0),
  source_version text not null default 'finnhub-v1' check (source_version ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider, market, symbol)
);

comment on table app.quote_cache is
  'Shared non-user-owned Finnhub US-equity reference data. Browser roles have no direct access; the authenticated market-data Edge Function is the validated read/write path.';

create index quote_cache_fetched_at_idx on app.quote_cache (fetched_at);

create table app.market_data_refresh_rate_windows (
  user_id uuid not null,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  created_at timestamptz not null default now(),
  primary key (user_id, window_started_at)
);

comment on table app.market_data_refresh_rate_windows is
  'User-keyed Edge Function rate-limit counters. It stores no financial data, symbols, or provider requests.';

alter table app.quote_cache enable row level security;
alter table app.quote_cache force row level security;
alter table app.market_data_refresh_rate_windows enable row level security;
alter table app.market_data_refresh_rate_windows force row level security;

revoke all on table app.quote_cache, app.market_data_refresh_rate_windows from public, anon, authenticated;
revoke all on type app.quote_cache, app.market_data_refresh_rate_windows from public, anon, authenticated;

grant usage on schema app to service_role;
grant select, insert, update, delete on table app.quote_cache, app.market_data_refresh_rate_windows to service_role;

