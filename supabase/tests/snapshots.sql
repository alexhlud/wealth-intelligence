begin;
select no_plan();

insert into auth.users (id) values
  ('33333333-3333-3333-3333-333333333333'),
  ('44444444-4444-4444-4444-444444444444');

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
set local role authenticated;

create temporary table snapshot_test_ids (
  name text primary key,
  id uuid not null
);
create temporary table snapshot_payloads (
  name text primary key,
  payload jsonb not null
);
create temporary table snapshot_original_hashes (
  name text primary key,
  hash text not null
);

select lives_ok($$select app.ensure_primary_portfolio()$$,
  'Snapshot owner initializes a portfolio');
insert into app.accounts (portfolio_id, name, account_type)
select id, 'Snapshot Brokerage', 'brokerage'
from app.portfolios where is_primary;
insert into app.manual_assets
  (portfolio_id, name, category, current_value, include_in_net_worth, value_as_of)
select id, 'Snapshot Cash', 'cash', 1000, true, '2026-08-31 15:00+00'
from app.portfolios where is_primary;
insert into app.manual_assets
  (portfolio_id, name, category, current_value, include_in_net_worth, value_as_of)
select id, 'Excluded Art', 'collectible', 500, false, '2026-08-31 15:00+00'
from app.portfolios where is_primary;
insert into app.liabilities
  (portfolio_id, name, category, outstanding_balance, include_in_net_worth, balance_as_of)
select id, 'Snapshot Loan', 'personal_loan', 200, true, '2026-08-31 15:00+00'
from app.portfolios where is_primary;
insert into app.liabilities
  (portfolio_id, name, category, outstanding_balance, include_in_net_worth, balance_as_of)
select id, 'Excluded Card', 'credit_balance', 50, false, '2026-08-31 15:00+00'
from app.portfolios where is_primary;

select lives_ok($$
  select * from app.create_position(
    (select id from app.portfolios where is_primary),
    (select id from app.accounts where name = 'Snapshot Brokerage'),
    'QQQ', 'Invesco QQQ', 'etf', 20.5, 0,
    '2026-08-31 15:00+00', null,
    'cccccccc-0000-0000-0000-000000000001')
$$, 'Snapshot owner creates a fractional zero-basis position');
select lives_ok($$
  select * from app.create_position(
    (select id from app.portfolios where is_primary),
    (select id from app.accounts where name = 'Snapshot Brokerage'),
    'VOO', 'Vanguard S&P 500 ETF', 'etf', 3, 50,
    '2026-08-31 15:00+00', null,
    'cccccccc-0000-0000-0000-000000000002')
$$, 'Snapshot owner creates a second position');

insert into snapshot_test_ids (name, id)
select 'owner_portfolio', id from app.portfolios where is_primary;
insert into snapshot_test_ids (name, id)
select 'owner_position', id from app.positions where symbol = 'QQQ';
insert into snapshot_test_ids (name, id)
select 'owner_manual_asset', id from app.manual_assets where name = 'Snapshot Cash';
insert into snapshot_test_ids (name, id)
select 'owner_liability', id from app.liabilities where name = 'Snapshot Loan';

insert into snapshot_payloads (name, payload)
select 'base_positions', pg_catalog.jsonb_build_array(
  pg_catalog.jsonb_build_object(
    'source_position_id', (select id from app.positions where symbol = 'QQQ'),
    'account_label', 'Snapshot Brokerage', 'symbol', 'QQQ',
    'security_name', 'Invesco QQQ', 'asset_type', 'etf',
    'quantity', 20.5, 'average_cost', 0, 'market_price', 100,
    'price_at', '2026-08-31 20:00+00', 'price_source', 'test-feed',
    'price_kind', 'raw_close'
  ),
  pg_catalog.jsonb_build_object(
    'source_position_id', (select id from app.positions where symbol = 'VOO'),
    'account_label', 'Snapshot Brokerage', 'symbol', 'VOO',
    'security_name', 'Vanguard S&P 500 ETF', 'asset_type', 'etf',
    'quantity', 3, 'average_cost', 50, 'market_price', 60,
    'price_at', '2026-08-31 20:00+00', 'price_source', 'test-feed',
    'price_kind', 'raw_close'
  )
);
insert into snapshot_payloads (name, payload)
select 'base_assets', pg_catalog.jsonb_build_array(
  pg_catalog.jsonb_build_object(
    'source_manual_asset_id', (select id from app.manual_assets where name = 'Snapshot Cash'),
    'name', 'Snapshot Cash', 'category', 'cash', 'account_label', null,
    'value', 1000, 'include_in_net_worth', true, 'currency_code', 'USD',
    'effective_at', '2026-08-31 15:00+00'
  ),
  pg_catalog.jsonb_build_object(
    'source_manual_asset_id', (select id from app.manual_assets where name = 'Excluded Art'),
    'name', 'Excluded Art', 'category', 'collectible', 'account_label', null,
    'value', 500, 'include_in_net_worth', false, 'currency_code', 'USD',
    'effective_at', '2026-08-31 15:00+00'
  )
);
insert into snapshot_payloads (name, payload)
select 'base_liabilities', pg_catalog.jsonb_build_array(
  pg_catalog.jsonb_build_object(
    'source_liability_id', (select id from app.liabilities where name = 'Snapshot Loan'),
    'name', 'Snapshot Loan', 'category', 'personal_loan', 'account_label', null,
    'balance', 200, 'include_in_net_worth', true, 'currency_code', 'USD',
    'effective_at', '2026-08-31 15:00+00'
  ),
  pg_catalog.jsonb_build_object(
    'source_liability_id', (select id from app.liabilities where name = 'Excluded Card'),
    'name', 'Excluded Card', 'category', 'credit_balance', 'account_label', null,
    'balance', 50, 'include_in_net_worth', false, 'currency_code', 'USD',
    'effective_at', '2026-08-31 15:00+00'
  )
);

select lives_ok($$
  select app.create_portfolio_snapshot(
    (select id from snapshot_test_ids where name = 'owner_portfolio'),
    '2026-08-31', '2026-08-31 20:00+00', 'manual',
    (select payload from snapshot_payloads where name = 'base_positions'),
    (select payload from snapshot_payloads where name = 'base_assets'),
    (select payload from snapshot_payloads where name = 'base_liabilities'),
    'cccccccc-1000-0000-0000-000000000001')
$$, 'Normal XNYS close creates a complete snapshot atomically');
insert into snapshot_test_ids (name, id)
select 'original_snapshot', id from app.portfolio_snapshots
where request_id = 'cccccccc-1000-0000-0000-000000000001';

select is((select count(*) from app.snapshot_positions), 2::bigint,
  'Snapshot copies every position line');
select is((select count(*) from app.snapshot_manual_assets), 2::bigint,
  'Snapshot copies included and excluded manual-asset facts');
select is((select count(*) from app.snapshot_liabilities), 2::bigint,
  'Snapshot copies included and excluded liability facts');
select ok((select investment_value = 2230 and cost_basis = 150
                  and unrealized_gain = 2080 and cash_value = 1000
                  and manual_asset_value = 1000 and liability_value = 200
                  and total_net_worth = 3030
           from app.portfolio_snapshots
           where id = (select id from snapshot_test_ids where name = 'original_snapshot')),
  'Header aggregates are derived exactly and cash is not double-counted');
select ok((select unrealized_gain_percent is null and market_value = 2050
           from app.snapshot_positions where symbol = 'QQQ'),
  'Zero cost basis stores exact market value and a null gain percentage');
select is((select quantity from app.snapshot_positions where symbol = 'QQQ'),
  20.5::numeric, 'Fractional quantity remains exact NUMERIC');
select is((select sum(portfolio_weight) from app.snapshot_positions),
  1::numeric, 'Derived portfolio weights sum to one for this exact composition');
select ok((select account_label = 'Snapshot Brokerage'
                  and security_name = 'Invesco QQQ'
                  and price_at = '2026-08-31 20:00+00'::timestamptz
                  and price_source = 'test-feed' and price_kind = 'raw_close'
           from app.snapshot_positions where symbol = 'QQQ'),
  'Historical identifying, account, and raw-price metadata is copied');

select lives_ok($$
  select app.create_portfolio_snapshot(
    (select id from snapshot_test_ids where name = 'owner_portfolio'),
    '2026-08-31', '2026-08-31 20:00+00', 'manual',
    (select pg_catalog.jsonb_agg(value order by ord desc)
     from pg_catalog.jsonb_array_elements(
       (select payload from snapshot_payloads where name = 'base_positions'))
       with ordinality as e(value, ord)),
    (select payload from snapshot_payloads where name = 'base_assets'),
    (select payload from snapshot_payloads where name = 'base_liabilities'),
    'cccccccc-1000-0000-0000-000000000001')
$$, 'Order-only retry returns the committed snapshot');
select is((select count(*) from app.portfolio_snapshots
           where request_id = 'cccccccc-1000-0000-0000-000000000001'),
  1::bigint, 'Idempotent retry does not duplicate snapshot history');
select throws_ok($$
  select app.create_portfolio_snapshot(
    (select id from snapshot_test_ids where name = 'owner_portfolio'),
    '2026-08-31', '2026-08-31 20:00+00', 'backfill',
    (select payload from snapshot_payloads where name = 'base_positions'),
    (select payload from snapshot_payloads where name = 'base_assets'),
    (select payload from snapshot_payloads where name = 'base_liabilities'),
    'cccccccc-1000-0000-0000-000000000001')
$$, '22000', 'Request ID already used for different intent',
  'Snapshot request ID cannot be reused for different normalized intent');
select throws_ok($$
  select app.create_portfolio_snapshot(
    (select id from snapshot_test_ids where name = 'owner_portfolio'),
    '2026-08-31', '2026-08-31 20:00+00', 'daily_close', '[]', '[]', '[]',
    'cccccccc-1000-0000-0000-000000000002')
$$, '22000', 'Snapshot already exists for market close',
  'Only one original snapshot is allowed per portfolio close');

select lives_ok($$
  select app.create_portfolio_snapshot(
    (select id from snapshot_test_ids where name = 'owner_portfolio'),
    '2026-11-27', '2026-11-27 18:00+00', 'backfill', '[]', '[]', '[]',
    'cccccccc-1000-0000-0000-000000000003')
$$, 'An explicit 13:00 New York early close is accepted');
select throws_ok($$
  select app.create_portfolio_snapshot(
    (select id from snapshot_test_ids where name = 'owner_portfolio'),
    '2026-08-31', '2026-09-01 20:00+00', 'backfill', '[]', '[]', '[]',
    'cccccccc-1000-0000-0000-000000000004')
$$, '22023', 'Invalid snapshot intent',
  'Market-close local date must equal the XNYS as-of date');
select throws_ok($$
  select app.create_portfolio_snapshot(
    (select id from snapshot_test_ids where name = 'owner_portfolio'),
    '2026-08-30', '2026-08-30 20:00+00', 'backfill', '[]', '[]', '[]',
    'cccccccc-1000-0000-0000-000000000005')
$$, '22023', 'Invalid snapshot intent', 'Weekend XNYS dates are rejected');
select throws_ok($$
  select app.create_portfolio_snapshot(
    (select id from snapshot_test_ids where name = 'owner_portfolio'),
    '2026-09-01', '2026-09-01 19:00+00', 'backfill', '[]', '[]', '[]',
    'cccccccc-1000-0000-0000-000000000006')
$$, '22023', 'Invalid snapshot intent',
  'A non-normal and non-early XNYS close time is rejected');

select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select lives_ok($$select app.ensure_primary_portfolio()$$,
  'Second snapshot user initializes a portfolio');
insert into app.accounts (portfolio_id, name, account_type)
select id, 'Foreign Brokerage', 'brokerage' from app.portfolios where is_primary;
insert into app.manual_assets
  (portfolio_id, name, category, current_value, value_as_of)
select id, 'Foreign Cash', 'cash', 10, '2026-09-01 15:00+00'
from app.portfolios where is_primary;
insert into app.liabilities
  (portfolio_id, name, category, outstanding_balance, balance_as_of)
select id, 'Foreign Loan', 'other', 10, '2026-09-01 15:00+00'
from app.portfolios where is_primary;
select lives_ok($$
  select * from app.create_position(
    (select id from app.portfolios where is_primary),
    (select id from app.accounts where name = 'Foreign Brokerage'),
    'BND', 'Vanguard Total Bond Market ETF', 'etf', 1, 1,
    '2026-09-01 15:00+00', null,
    'dddddddd-0000-0000-0000-000000000001')
$$, 'Second snapshot user creates a source position');
insert into snapshot_test_ids (name, id)
select 'foreign_portfolio', id from app.portfolios where is_primary;
insert into snapshot_test_ids (name, id)
select 'foreign_position', id from app.positions where symbol = 'BND';
insert into snapshot_test_ids (name, id)
select 'foreign_manual_asset', id from app.manual_assets where name = 'Foreign Cash';
insert into snapshot_test_ids (name, id)
select 'foreign_liability', id from app.liabilities where name = 'Foreign Loan';

select is((select count(*) from app.portfolio_snapshots
           where user_id = '33333333-3333-3333-3333-333333333333'), 0::bigint,
  'Second user reads zero first-user snapshot headers');
select is((select count(*) from app.snapshot_positions
           where user_id = '33333333-3333-3333-3333-333333333333'), 0::bigint,
  'Second user reads zero first-user snapshot positions');
select is((select count(*) from app.snapshot_manual_assets
           where user_id = '33333333-3333-3333-3333-333333333333'), 0::bigint,
  'Second user reads zero first-user snapshot assets');
select is((select count(*) from app.snapshot_liabilities
           where user_id = '33333333-3333-3333-3333-333333333333'), 0::bigint,
  'Second user reads zero first-user snapshot liabilities');

select throws_ok($$insert into app.portfolio_snapshots (user_id) values (auth.uid())$$,
  '42501', null, 'Owners cannot directly insert snapshot headers');
select throws_ok($$insert into app.snapshot_positions (user_id) values (auth.uid())$$,
  '42501', null, 'Owners cannot directly insert snapshot positions');
select throws_ok($$insert into app.snapshot_manual_assets (user_id) values (auth.uid())$$,
  '42501', null, 'Owners cannot directly insert snapshot assets');
select throws_ok($$insert into app.snapshot_liabilities (user_id) values (auth.uid())$$,
  '42501', null, 'Owners cannot directly insert snapshot liabilities');

select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select throws_ok($$update app.portfolio_snapshots set correction_reason = 'Changed'$$,
  '42501', null, 'Owners cannot directly update snapshot headers');
select throws_ok($$delete from app.portfolio_snapshots$$,
  '42501', null, 'Owners cannot directly delete snapshot headers');
select throws_ok($$update app.snapshot_positions set account_label = 'Changed'$$,
  '42501', null, 'Owners cannot directly update snapshot positions');
select throws_ok($$delete from app.snapshot_positions$$,
  '42501', null, 'Owners cannot directly delete snapshot positions');
select throws_ok($$update app.snapshot_manual_assets set name = 'Changed'$$,
  '42501', null, 'Owners cannot directly update snapshot assets');
select throws_ok($$delete from app.snapshot_manual_assets$$,
  '42501', null, 'Owners cannot directly delete snapshot assets');
select throws_ok($$update app.snapshot_liabilities set name = 'Changed'$$,
  '42501', null, 'Owners cannot directly update snapshot liabilities');
select throws_ok($$delete from app.snapshot_liabilities$$,
  '42501', null, 'Owners cannot directly delete snapshot liabilities');

-- SECURITY DEFINER create-snapshot ownership and source-reference attacks.
select throws_ok($$
  select app.create_portfolio_snapshot(
    (select id from snapshot_test_ids where name = 'foreign_portfolio'),
    '2026-09-01', '2026-09-01 20:00+00', 'manual', '[]', '[]', '[]',
    'cccccccc-2000-0000-0000-000000000001')
$$, 'P0002', 'Resource unavailable',
  'Snapshot creation refuses a foreign portfolio without disclosure');
select throws_ok($$
  select app.create_portfolio_snapshot(
    '00000000-0000-0000-0000-000000000001',
    '2026-09-01', '2026-09-01 20:00+00', 'manual', '[]', '[]', '[]',
    'cccccccc-2000-0000-0000-000000000002')
$$, 'P0002', 'Resource unavailable',
  'Snapshot creation gives the same error for a nonexistent portfolio');
select throws_ok($$
  select app.create_portfolio_snapshot(
    (select id from snapshot_test_ids where name = 'owner_portfolio'),
    '2026-09-01', '2026-09-01 20:00+00', 'manual',
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'source_position_id', (select id from snapshot_test_ids where name = 'foreign_position'),
      'account_label', 'Foreign', 'symbol', 'BND', 'security_name', 'Foreign Bond',
      'asset_type', 'etf', 'quantity', 1, 'average_cost', 1, 'market_price', 1,
      'price_at', '2026-09-01 20:00+00', 'price_source', 'manual', 'price_kind', 'manual')),
    '[]', '[]', 'cccccccc-2000-0000-0000-000000000003')
$$, 'P0002', 'Resource unavailable',
  'Snapshot creation refuses a foreign source position');
select throws_ok($$
  select app.create_portfolio_snapshot(
    (select id from snapshot_test_ids where name = 'owner_portfolio'),
    '2026-09-01', '2026-09-01 20:00+00', 'manual',
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'source_position_id', '00000000-0000-0000-0000-000000000002',
      'account_label', 'Missing', 'symbol', 'BND', 'security_name', 'Missing Bond',
      'asset_type', 'etf', 'quantity', 1, 'average_cost', 1, 'market_price', 1,
      'price_at', '2026-09-01 20:00+00', 'price_source', 'manual', 'price_kind', 'manual')),
    '[]', '[]', 'cccccccc-2000-0000-0000-000000000004')
$$, 'P0002', 'Resource unavailable',
  'Snapshot creation gives the same error for a nonexistent source position');
select throws_ok($$
  select app.create_portfolio_snapshot(
    (select id from snapshot_test_ids where name = 'owner_portfolio'),
    '2026-09-01', '2026-09-01 20:00+00', 'manual', '[]',
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'source_manual_asset_id', (select id from snapshot_test_ids where name = 'foreign_manual_asset'),
      'name', 'Foreign Cash', 'category', 'cash', 'account_label', null, 'value', 1,
      'include_in_net_worth', true, 'currency_code', 'USD',
      'effective_at', '2026-09-01 15:00+00')), '[]',
    'cccccccc-2000-0000-0000-000000000005')
$$, 'P0002', 'Resource unavailable',
  'Snapshot creation refuses a foreign source manual asset');
select throws_ok($$
  select app.create_portfolio_snapshot(
    (select id from snapshot_test_ids where name = 'owner_portfolio'),
    '2026-09-01', '2026-09-01 20:00+00', 'manual', '[]',
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'source_manual_asset_id', '00000000-0000-0000-0000-000000000003',
      'name', 'Missing Cash', 'category', 'cash', 'account_label', null, 'value', 1,
      'include_in_net_worth', true, 'currency_code', 'USD',
      'effective_at', '2026-09-01 15:00+00')), '[]',
    'cccccccc-2000-0000-0000-000000000006')
$$, 'P0002', 'Resource unavailable',
  'Snapshot creation gives the same error for a nonexistent source manual asset');
select throws_ok($$
  select app.create_portfolio_snapshot(
    (select id from snapshot_test_ids where name = 'owner_portfolio'),
    '2026-09-01', '2026-09-01 20:00+00', 'manual', '[]', '[]',
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'source_liability_id', (select id from snapshot_test_ids where name = 'foreign_liability'),
      'name', 'Foreign Loan', 'category', 'other', 'account_label', null, 'balance', 1,
      'include_in_net_worth', true, 'currency_code', 'USD',
      'effective_at', '2026-09-01 15:00+00')),
    'cccccccc-2000-0000-0000-000000000007')
$$, 'P0002', 'Resource unavailable',
  'Snapshot creation refuses a foreign source liability');
select throws_ok($$
  select app.create_portfolio_snapshot(
    (select id from snapshot_test_ids where name = 'owner_portfolio'),
    '2026-09-01', '2026-09-01 20:00+00', 'manual', '[]', '[]',
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'source_liability_id', '00000000-0000-0000-0000-000000000004',
      'name', 'Missing Loan', 'category', 'other', 'account_label', null, 'balance', 1,
      'include_in_net_worth', true, 'currency_code', 'USD',
      'effective_at', '2026-09-01 15:00+00')),
    'cccccccc-2000-0000-0000-000000000008')
$$, 'P0002', 'Resource unavailable',
  'Snapshot creation gives the same error for a nonexistent source liability');
select is((select count(*) from app.portfolio_snapshots
           where request_id::text like 'cccccccc-2000-%'), 0::bigint,
  'All rejected create-snapshot attacks roll back without headers');

select throws_ok($$
  select app.create_portfolio_snapshot(
    (select id from snapshot_test_ids where name = 'owner_portfolio'),
    '2026-09-01', '2026-09-01 20:00+00', 'manual',
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'source_position_id', '00000000-0000-0000-0000-000000000005',
      'account_label', 'Missing', 'symbol', 'BAD', 'security_name', 'Missing',
      'asset_type', 'etf', 'quantity', 1, 'average_cost', 1, 'market_price', 1,
      'price_at', '2026-09-01 20:00+00', 'price_source', 'manual', 'price_kind', 'adjusted')),
    '[]', '[]', 'cccccccc-2000-0000-0000-000000000009')
$$, '22023', 'Invalid snapshot intent',
  'Unmarked adjusted price input is rejected before any write');
select is((select count(*) from app.portfolio_snapshots
           where request_id = 'cccccccc-2000-0000-0000-000000000009'), 0::bigint,
  'Invalid child input causes atomic rollback');

insert into snapshot_original_hashes (name, hash)
select 'header', md5(pg_catalog.to_jsonb(s)::text)
from app.portfolio_snapshots as s
where s.id = (select id from snapshot_test_ids where name = 'original_snapshot');
insert into snapshot_original_hashes (name, hash)
select 'positions', md5(coalesce(
  pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p) order by p.id), '[]'::jsonb
)::text)
from app.snapshot_positions as p
where p.snapshot_id = (select id from snapshot_test_ids where name = 'original_snapshot');
insert into snapshot_original_hashes (name, hash)
select 'assets', md5(coalesce(
  pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) order by a.id), '[]'::jsonb
)::text)
from app.snapshot_manual_assets as a
where a.snapshot_id = (select id from snapshot_test_ids where name = 'original_snapshot');
insert into snapshot_original_hashes (name, hash)
select 'liabilities', md5(coalesce(
  pg_catalog.jsonb_agg(pg_catalog.to_jsonb(l) order by l.id), '[]'::jsonb
)::text)
from app.snapshot_liabilities as l
where l.snapshot_id = (select id from snapshot_test_ids where name = 'original_snapshot');

insert into snapshot_payloads (name, payload) values
  ('corrected_positions', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'source_position_id', (select id from snapshot_test_ids where name = 'owner_position'),
    'account_label', 'Historical Brokerage', 'symbol', 'QQQ',
    'security_name', 'Invesco QQQ', 'asset_type', 'etf',
    'quantity', 20.5, 'average_cost', 0, 'market_price', 110,
    'price_at', '2026-08-31 20:00+00', 'price_source', 'manual-review',
    'price_kind', 'manual'))),
  ('corrected_assets', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'source_manual_asset_id', (select id from snapshot_test_ids where name = 'owner_manual_asset'),
    'name', 'Snapshot Cash', 'category', 'cash', 'account_label', null,
    'value', 1200, 'include_in_net_worth', true, 'currency_code', 'USD',
    'effective_at', '2026-08-31 15:00+00'))),
  ('corrected_liabilities', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'source_liability_id', (select id from snapshot_test_ids where name = 'owner_liability'),
    'name', 'Snapshot Loan', 'category', 'personal_loan', 'account_label', null,
    'balance', 180, 'include_in_net_worth', true, 'currency_code', 'USD',
    'effective_at', '2026-08-31 15:00+00')));

select lives_ok($$
  select app.correct_portfolio_snapshot(
    (select id from snapshot_test_ids where name = 'original_snapshot'),
    'Corrected reviewed values',
    (select payload from snapshot_payloads where name = 'corrected_positions'),
    (select payload from snapshot_payloads where name = 'corrected_assets'),
    (select payload from snapshot_payloads where name = 'corrected_liabilities'),
    'cccccccc-3000-0000-0000-000000000001')
$$, 'A complete correction revision is appended atomically');
insert into snapshot_test_ids (name, id)
select 'first_correction', id from app.portfolio_snapshots
where request_id = 'cccccccc-3000-0000-0000-000000000001';
select ok((select source = 'correction'
                  and corrects_snapshot_id = (select id from snapshot_test_ids
                                                where name = 'original_snapshot')
                  and correction_reason = 'Corrected reviewed values'
                  and as_of_date = '2026-08-31'
                  and market_close_at = '2026-08-31 20:00+00'::timestamptz
                  and exchange_mic = 'XNYS'
                  and exchange_timezone = 'America/New_York'
           from app.portfolio_snapshots
           where id = (select id from snapshot_test_ids where name = 'first_correction')),
  'Correction preserves original session metadata and records its edge and reason');
select ok((select investment_value = 2255 and cost_basis = 0
                  and unrealized_gain = 2255 and cash_value = 1200
                  and manual_asset_value = 1200 and liability_value = 180
                  and total_net_worth = 3275
           from app.portfolio_snapshots
           where id = (select id from snapshot_test_ids where name = 'first_correction')),
  'Correction totals are derived from its full replacement composition');
select ok((select count(*) = 1 from app.snapshot_positions
           where snapshot_id = (select id from snapshot_test_ids where name = 'first_correction'))
       and (select count(*) = 1 from app.snapshot_manual_assets
            where snapshot_id = (select id from snapshot_test_ids where name = 'first_correction'))
       and (select count(*) = 1 from app.snapshot_liabilities
            where snapshot_id = (select id from snapshot_test_ids where name = 'first_correction')),
  'Correction stores independently complete replacement child sets');
select is((select md5(pg_catalog.to_jsonb(s)::text)
           from app.portfolio_snapshots as s
           where s.id = (select id from snapshot_test_ids where name = 'original_snapshot')),
  (select hash from snapshot_original_hashes where name = 'header'),
  'Correction preserves the original header byte-for-byte');
select is((select md5(coalesce(
             pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p) order by p.id), '[]'::jsonb
           )::text)
           from app.snapshot_positions as p
           where p.snapshot_id = (select id from snapshot_test_ids where name = 'original_snapshot')),
  (select hash from snapshot_original_hashes where name = 'positions'),
  'Correction preserves original position children byte-for-byte');
select is((select md5(coalesce(
             pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) order by a.id), '[]'::jsonb
           )::text)
           from app.snapshot_manual_assets as a
           where a.snapshot_id = (select id from snapshot_test_ids where name = 'original_snapshot')),
  (select hash from snapshot_original_hashes where name = 'assets'),
  'Correction preserves original manual-asset children byte-for-byte');
select is((select md5(coalesce(
             pg_catalog.jsonb_agg(pg_catalog.to_jsonb(l) order by l.id), '[]'::jsonb
           )::text)
           from app.snapshot_liabilities as l
           where l.snapshot_id = (select id from snapshot_test_ids where name = 'original_snapshot')),
  (select hash from snapshot_original_hashes where name = 'liabilities'),
  'Correction preserves original liability children byte-for-byte');

select lives_ok($$
  select app.correct_portfolio_snapshot(
    (select id from snapshot_test_ids where name = 'original_snapshot'),
    'Corrected reviewed values',
    (select payload from snapshot_payloads where name = 'corrected_positions'),
    (select payload from snapshot_payloads where name = 'corrected_assets'),
    (select payload from snapshot_payloads where name = 'corrected_liabilities'),
    'cccccccc-3000-0000-0000-000000000001')
$$, 'Identical correction retry returns the committed revision');
select is((select count(*) from app.portfolio_snapshots
           where request_id = 'cccccccc-3000-0000-0000-000000000001'),
  1::bigint, 'Identical correction retry does not duplicate history');
select throws_ok($$
  select app.correct_portfolio_snapshot(
    (select id from snapshot_test_ids where name = 'original_snapshot'),
    'A different reason',
    (select payload from snapshot_payloads where name = 'corrected_positions'),
    (select payload from snapshot_payloads where name = 'corrected_assets'),
    (select payload from snapshot_payloads where name = 'corrected_liabilities'),
    'cccccccc-3000-0000-0000-000000000001')
$$, '22000', 'Request ID already used for different intent',
  'Correction request ID cannot be reused for different intent');
select throws_ok($$
  select app.correct_portfolio_snapshot(
    (select id from snapshot_test_ids where name = 'original_snapshot'),
    'Competing correction', '[]', '[]', '[]',
    'cccccccc-3000-0000-0000-000000000002')
$$, '22023', 'Snapshot is not correction-chain leaf',
  'A non-leaf snapshot cannot receive a competing correction');

select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select throws_ok($$
  select app.correct_portfolio_snapshot(
    (select id from snapshot_test_ids where name = 'first_correction'),
    'Foreign correction', '[]', '[]', '[]',
    'dddddddd-3000-0000-0000-000000000001')
$$, 'P0002', 'Resource unavailable',
  'Correction refuses a foreign snapshot without disclosing existence');
select throws_ok($$
  select app.correct_portfolio_snapshot(
    '00000000-0000-0000-0000-000000000006',
    'Missing correction', '[]', '[]', '[]',
    'dddddddd-3000-0000-0000-000000000002')
$$, 'P0002', 'Resource unavailable',
  'Correction gives the same error for a nonexistent snapshot');

select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select throws_ok($$
  select app.correct_portfolio_snapshot(
    (select id from snapshot_test_ids where name = 'first_correction'),
    'Foreign position attempt',
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'source_position_id', (select id from snapshot_test_ids where name = 'foreign_position'),
      'account_label', 'Foreign', 'symbol', 'BND', 'security_name', 'Foreign Bond',
      'asset_type', 'etf', 'quantity', 1, 'average_cost', 1, 'market_price', 1,
      'price_at', '2026-08-31 20:00+00', 'price_source', 'manual', 'price_kind', 'manual')),
    '[]', '[]', 'cccccccc-3000-0000-0000-000000000003')
$$, 'P0002', 'Resource unavailable',
  'Correction refuses a foreign source position');
select throws_ok($$
  select app.correct_portfolio_snapshot(
    (select id from snapshot_test_ids where name = 'first_correction'),
    'Missing position attempt',
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'source_position_id', '00000000-0000-0000-0000-000000000007',
      'account_label', 'Missing', 'symbol', 'BND', 'security_name', 'Missing Bond',
      'asset_type', 'etf', 'quantity', 1, 'average_cost', 1, 'market_price', 1,
      'price_at', '2026-08-31 20:00+00', 'price_source', 'manual', 'price_kind', 'manual')),
    '[]', '[]', 'cccccccc-3000-0000-0000-000000000004')
$$, 'P0002', 'Resource unavailable',
  'Correction gives the same error for a nonexistent source position');
select throws_ok($$
  select app.correct_portfolio_snapshot(
    (select id from snapshot_test_ids where name = 'first_correction'),
    'Foreign asset attempt', '[]',
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'source_manual_asset_id', (select id from snapshot_test_ids where name = 'foreign_manual_asset'),
      'name', 'Foreign Cash', 'category', 'cash', 'account_label', null, 'value', 1,
      'include_in_net_worth', true, 'currency_code', 'USD',
      'effective_at', '2026-08-31 15:00+00')), '[]',
    'cccccccc-3000-0000-0000-000000000005')
$$, 'P0002', 'Resource unavailable',
  'Correction refuses a foreign source manual asset');
select throws_ok($$
  select app.correct_portfolio_snapshot(
    (select id from snapshot_test_ids where name = 'first_correction'),
    'Missing asset attempt', '[]',
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'source_manual_asset_id', '00000000-0000-0000-0000-000000000008',
      'name', 'Missing Cash', 'category', 'cash', 'account_label', null, 'value', 1,
      'include_in_net_worth', true, 'currency_code', 'USD',
      'effective_at', '2026-08-31 15:00+00')), '[]',
    'cccccccc-3000-0000-0000-000000000006')
$$, 'P0002', 'Resource unavailable',
  'Correction gives the same error for a nonexistent source manual asset');
select throws_ok($$
  select app.correct_portfolio_snapshot(
    (select id from snapshot_test_ids where name = 'first_correction'),
    'Foreign liability attempt', '[]', '[]',
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'source_liability_id', (select id from snapshot_test_ids where name = 'foreign_liability'),
      'name', 'Foreign Loan', 'category', 'other', 'account_label', null, 'balance', 1,
      'include_in_net_worth', true, 'currency_code', 'USD',
      'effective_at', '2026-08-31 15:00+00')),
    'cccccccc-3000-0000-0000-000000000007')
$$, 'P0002', 'Resource unavailable',
  'Correction refuses a foreign source liability');
select throws_ok($$
  select app.correct_portfolio_snapshot(
    (select id from snapshot_test_ids where name = 'first_correction'),
    'Missing liability attempt', '[]', '[]',
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'source_liability_id', '00000000-0000-0000-0000-000000000009',
      'name', 'Missing Loan', 'category', 'other', 'account_label', null, 'balance', 1,
      'include_in_net_worth', true, 'currency_code', 'USD',
      'effective_at', '2026-08-31 15:00+00')),
    'cccccccc-3000-0000-0000-000000000008')
$$, 'P0002', 'Resource unavailable',
  'Correction gives the same error for a nonexistent source liability');
select is((select count(*) from app.portfolio_snapshots
           where request_id::text like 'cccccccc-3000-%'), 1::bigint,
  'Rejected correction attacks append no partial revisions');

select lives_ok($$
  select app.correct_portfolio_snapshot(
    (select id from snapshot_test_ids where name = 'first_correction'),
    'Second reviewed correction',
    (select payload from snapshot_payloads where name = 'corrected_positions'),
    (select payload from snapshot_payloads where name = 'corrected_assets'),
    (select payload from snapshot_payloads where name = 'corrected_liabilities'),
    'cccccccc-3000-0000-0000-000000000009')
$$, 'The current correction-chain leaf can be corrected');
insert into snapshot_test_ids (name, id)
select 'second_correction', id from app.portfolio_snapshots
where request_id = 'cccccccc-3000-0000-0000-000000000009';
select is((select count(*)
           from app.portfolio_snapshots as s
           where s.portfolio_id = (select id from snapshot_test_ids where name = 'owner_portfolio')
             and s.market_close_at = '2026-08-31 20:00+00'
             and not exists (
               select 1 from app.portfolio_snapshots as newer
               where newer.user_id = s.user_id and newer.corrects_snapshot_id = s.id
             )), 1::bigint,
  'Leaf selection returns only the latest correction revision');
select is((select id
           from app.portfolio_snapshots as s
           where s.market_close_at = '2026-08-31 20:00+00'
             and not exists (
               select 1 from app.portfolio_snapshots as newer
               where newer.user_id = s.user_id and newer.corrects_snapshot_id = s.id
             )),
  (select id from snapshot_test_ids where name = 'second_correction'),
  'The selected leaf is the latest correction');

reset role;

select throws_ok($$
  insert into app.portfolio_snapshots (
    user_id, portfolio_id, request_id, request_fingerprint, as_of_date,
    market_close_at, source, investment_value, cost_basis, unrealized_gain,
    cash_value, manual_asset_value, liability_value, total_net_worth,
    corrects_snapshot_id, correction_reason
  )
  select user_id, portfolio_id, 'eeeeeeee-0000-0000-0000-000000000001',
    'competing-edge', as_of_date, market_close_at, 'correction',
    0, 0, 0, 0, 0, 0, 0,
    (select id from snapshot_test_ids where name = 'original_snapshot'), 'Competing edge'
  from app.portfolio_snapshots
  where id = (select id from snapshot_test_ids where name = 'original_snapshot')
$$, '23505', null, 'Unique correction edges prevent competing direct revisions');

select throws_ok($$
  insert into app.portfolio_snapshots (
    user_id, portfolio_id, request_id, request_fingerprint, as_of_date,
    market_close_at, source, investment_value, cost_basis, unrealized_gain,
    cash_value, manual_asset_value, liability_value, total_net_worth
  ) values (
    '44444444-4444-4444-4444-444444444444',
    (select id from snapshot_test_ids where name = 'owner_portfolio'),
    'eeeeeeee-0000-0000-0000-000000000002', 'cross-user-parent',
    '2026-09-02', '2026-09-02 20:00+00', 'manual',
    0, 0, 0, 0, 0, 0, 0)
$$, '23503', null, 'Composite keys reject cross-user snapshot-header parenting');

select throws_ok($$
  insert into app.snapshot_positions (
    snapshot_id, user_id, portfolio_id, account_label, symbol, security_name,
    asset_type, quantity, average_cost, market_price, price_at, price_source,
    price_kind, market_value, cost_basis, unrealized_gain,
    unrealized_gain_percent, portfolio_weight
  ) values (
    (select id from snapshot_test_ids where name = 'original_snapshot'),
    '44444444-4444-4444-4444-444444444444',
    (select id from snapshot_test_ids where name = 'foreign_portfolio'),
    'Foreign', 'BAD', 'Bad Parent', 'other', 1, 0, 0,
    '2026-08-31 20:00+00', 'manual', 'manual', 0, 0, 0, null, 0)
$$, '23503', null, 'Composite keys reject cross-user snapshot-position parenting');
select throws_ok($$
  insert into app.snapshot_manual_assets (
    snapshot_id, user_id, portfolio_id, name, category, value,
    include_in_net_worth, effective_at
  ) values (
    (select id from snapshot_test_ids where name = 'original_snapshot'),
    '44444444-4444-4444-4444-444444444444',
    (select id from snapshot_test_ids where name = 'foreign_portfolio'),
    'Bad Parent', 'other', 0, true, '2026-08-31 15:00+00')
$$, '23503', null, 'Composite keys reject cross-user snapshot-asset parenting');
select throws_ok($$
  insert into app.snapshot_liabilities (
    snapshot_id, user_id, portfolio_id, name, category, balance,
    include_in_net_worth, effective_at
  ) values (
    (select id from snapshot_test_ids where name = 'original_snapshot'),
    '44444444-4444-4444-4444-444444444444',
    (select id from snapshot_test_ids where name = 'foreign_portfolio'),
    'Bad Parent', 'other', 0, true, '2026-08-31 15:00+00')
$$, '23503', null, 'Composite keys reject cross-user snapshot-liability parenting');

select throws_ok($$update app.portfolio_snapshots set correction_reason = correction_reason$$,
  '55000', 'History is immutable',
  'Privileged updates cannot mutate snapshot headers');
select throws_ok($$delete from app.portfolio_snapshots$$,
  '55000', 'History is immutable',
  'Privileged deletes cannot mutate snapshot headers');
select throws_ok($$update app.snapshot_positions set account_label = account_label$$,
  '55000', 'History is immutable',
  'Privileged updates cannot mutate snapshot positions');
select throws_ok($$delete from app.snapshot_positions$$,
  '55000', 'History is immutable',
  'Privileged deletes cannot mutate snapshot positions');
select throws_ok($$update app.snapshot_manual_assets set name = name$$,
  '55000', 'History is immutable',
  'Privileged updates cannot mutate snapshot assets');
select throws_ok($$delete from app.snapshot_manual_assets$$,
  '55000', 'History is immutable',
  'Privileged deletes cannot mutate snapshot assets');
select throws_ok($$update app.snapshot_liabilities set name = name$$,
  '55000', 'History is immutable',
  'Privileged updates cannot mutate snapshot liabilities');
select throws_ok($$delete from app.snapshot_liabilities$$,
  '55000', 'History is immutable',
  'Privileged deletes cannot mutate snapshot liabilities');

select is((select count(*) from pg_catalog.pg_class as c
           join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
           where n.nspname = 'app'
             and c.relname in ('portfolio_snapshots', 'snapshot_positions',
               'snapshot_manual_assets', 'snapshot_liabilities')
             and c.relrowsecurity and c.relforcerowsecurity),
  4::bigint, 'RLS is enabled and forced on all four snapshot tables');
select ok(
  has_table_privilege('authenticated', 'app.portfolio_snapshots', 'SELECT')
  and has_table_privilege('authenticated', 'app.snapshot_positions', 'SELECT')
  and has_table_privilege('authenticated', 'app.snapshot_manual_assets', 'SELECT')
  and has_table_privilege('authenticated', 'app.snapshot_liabilities', 'SELECT')
  and not has_table_privilege('authenticated', 'app.portfolio_snapshots', 'INSERT')
  and not has_table_privilege('authenticated', 'app.snapshot_positions', 'UPDATE')
  and not has_table_privilege('authenticated', 'app.snapshot_manual_assets', 'DELETE')
  and not has_table_privilege('authenticated', 'app.snapshot_liabilities', 'INSERT'),
  'Authenticated snapshot-table privileges are read-only');
select ok(
  has_function_privilege('authenticated',
    'app.create_portfolio_snapshot(uuid,date,timestamptz,text,jsonb,jsonb,jsonb,uuid)',
    'EXECUTE')
  and has_function_privilege('authenticated',
    'app.correct_portfolio_snapshot(uuid,text,jsonb,jsonb,jsonb,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated',
    'app.insert_snapshot_revision(uuid,uuid,text,date,timestamptz,text,uuid,text,jsonb,jsonb,jsonb)',
    'EXECUTE'),
  'Only the two public snapshot RPCs are executable by authenticated users');
select is((select count(*) from pg_catalog.pg_proc as p
           join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
           where n.nspname = 'app' and p.prosecdef),
  4::bigint, 'Exactly the four approved atomic write RPCs are SECURITY DEFINER');
select ok(not exists (
  select 1 from pg_catalog.pg_proc as p
  join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'app' and p.prosecdef
    and not ('search_path=""' = any(coalesce(p.proconfig, array[]::text[])))
), 'Every SECURITY DEFINER function pins an empty search path');
select ok(not exists (
  select 1 from pg_catalog.pg_proc as p
  join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'app' and p.prosecdef
    and pg_catalog.obj_description(p.oid, 'pg_proc') is null
), 'Every SECURITY DEFINER function documents its elevation');
select ok(not exists (
  select 1 from pg_catalog.pg_class as c
  join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
  where n.nspname = 'app' and c.relkind in ('r', 'p', 'v', 'm', 'f') and (
    has_table_privilege('anon', c.oid, 'SELECT')
    or has_table_privilege('anon', c.oid, 'INSERT')
    or has_table_privilege('anon', c.oid, 'UPDATE')
    or has_table_privilege('anon', c.oid, 'DELETE')
    or has_table_privilege('anon', c.oid, 'TRUNCATE')
    or has_table_privilege('anon', c.oid, 'REFERENCES')
    or has_table_privilege('anon', c.oid, 'TRIGGER')
  )
), 'Catalog inventory confirms anon has no app table or view privilege');
select ok(not exists (
  select 1 from pg_catalog.pg_proc as p
  join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'app' and has_function_privilege('anon', p.oid, 'EXECUTE')
), 'Catalog inventory confirms anon cannot execute any app function overload');
select ok(not exists (
  select 1 from pg_catalog.pg_class as c
  join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
  where n.nspname = 'app' and c.relkind = 'S' and (
    has_sequence_privilege('anon', c.oid, 'USAGE')
    or has_sequence_privilege('anon', c.oid, 'SELECT')
    or has_sequence_privilege('anon', c.oid, 'UPDATE')
  )
), 'Catalog inventory confirms anon has no app sequence privilege');
select ok(not exists (
  select 1 from pg_catalog.pg_type as t
  join pg_catalog.pg_namespace as n on n.oid = t.typnamespace
  where n.nspname = 'app' and t.typtype in ('c', 'd', 'e', 'm', 'r')
    and has_type_privilege('anon', t.oid, 'USAGE')
), 'Catalog inventory confirms anon has no app type usage');

select * from finish();
rollback;
