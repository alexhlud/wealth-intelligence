begin;
select no_plan();

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;

create temporary table test_ids (
  name text primary key,
  id uuid not null
);

select lives_ok($$select app.ensure_primary_portfolio()$$,
  'User A initializes a profile and primary portfolio');
select is((select count(*) from app.profiles), 1::bigint,
  'User A reads their profile');
update app.profiles set display_name = 'User A' where id = auth.uid();
select is((select display_name from app.profiles), 'User A'::text,
  'User A updates their profile');

insert into app.accounts (portfolio_id, name, account_type)
select id, 'Brokerage', 'brokerage' from app.portfolios where is_primary;
insert into app.accounts (portfolio_id, name, account_type)
select id, 'Retirement', 'retirement' from app.portfolios where is_primary;
insert into app.manual_assets
  (portfolio_id, name, category, current_value, value_as_of)
select id, 'Emergency fund', 'savings', 12500.25, '2026-08-30 16:00+00'
from app.portfolios where is_primary;
insert into app.liabilities
  (portfolio_id, name, category, outstanding_balance, balance_as_of)
select id, 'Mortgage', 'mortgage', 210000.50, '2026-08-30 16:00+00'
from app.portfolios where is_primary;

select lives_ok($$
  select * from app.create_position(
    (select id from app.portfolios where is_primary),
    (select id from app.accounts where name = 'Brokerage'),
    'QQQ', 'Invesco QQQ', 'etf', 20.5, 0,
    '2026-08-30 17:00+00', 'Gifted shares',
    'aaaaaaaa-0000-0000-0000-000000000001')
$$, 'create_position atomically creates a fractional, zero-cost position');
select is((select count(*) from app.positions), 1::bigint,
  'Position creation inserts exactly one position');
select is((select count(*) from app.position_events where event_type = 'initial'), 1::bigint,
  'Position creation inserts exactly one initial event');
select is((select average_cost from app.positions), 0::numeric,
  'Zero cost basis remains exact NUMERIC');
insert into test_ids (name, id)
select 'user_a_portfolio', id from app.portfolios where is_primary;
insert into test_ids (name, id)
select 'user_a_brokerage', id from app.accounts where name = 'Brokerage';
insert into test_ids (name, id)
select 'user_a_position', id from app.positions where symbol = 'QQQ';
select lives_ok($$
  select * from app.create_position(
    (select id from app.portfolios where is_primary),
    (select id from app.accounts where name = 'Brokerage'),
    'QQQ', 'Invesco QQQ', 'etf', 20.5, 0,
    '2026-08-30 17:00+00', 'Gifted shares',
    'aaaaaaaa-0000-0000-0000-000000000001')
$$, 'Identical create retry returns the committed result');
select is((select count(*) from app.position_events
           where request_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1::bigint,
  'Identical create retry does not duplicate history');
select throws_ok($$
  select * from app.create_position(
    (select id from app.portfolios where is_primary),
    (select id from app.accounts where name = 'Brokerage'),
    'VOO', 'Vanguard S&P 500 ETF', 'etf', 20.5, 0,
    '2026-08-30 17:00+00', 'Gifted shares',
    'aaaaaaaa-0000-0000-0000-000000000001')
$$, '22000', 'Request ID already used for different intent',
  'Create request ID cannot be reused for different intent');

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select lives_ok($$select app.ensure_primary_portfolio()$$,
  'User B initializes a profile and primary portfolio');
insert into app.accounts (portfolio_id, name, account_type)
select id, 'User B Brokerage', 'brokerage' from app.portfolios where is_primary;
insert into test_ids (name, id)
select 'user_b_portfolio', id from app.portfolios where is_primary;
insert into test_ids (name, id)
select 'user_b_brokerage', id from app.accounts where name = 'User B Brokerage';

select is((select count(*) from app.profiles
           where id = '11111111-1111-1111-1111-111111111111'), 0::bigint,
  'User B reads zero User A profiles');
select is((select count(*) from app.portfolios
           where user_id = '11111111-1111-1111-1111-111111111111'), 0::bigint,
  'User B reads zero User A portfolios');
select is((select count(*) from app.accounts
           where user_id = '11111111-1111-1111-1111-111111111111'), 0::bigint,
  'User B reads zero User A accounts');
select is((select count(*) from app.positions
           where user_id = '11111111-1111-1111-1111-111111111111'), 0::bigint,
  'User B reads zero User A positions');
select is((select count(*) from app.manual_assets
           where user_id = '11111111-1111-1111-1111-111111111111'), 0::bigint,
  'User B reads zero User A manual assets');
select is((select count(*) from app.liabilities
           where user_id = '11111111-1111-1111-1111-111111111111'), 0::bigint,
  'User B reads zero User A liabilities');
select is((select count(*) from app.position_events
           where user_id = '11111111-1111-1111-1111-111111111111'), 0::bigint,
  'User B reads zero User A events');

select throws_ok($$insert into app.profiles (id)
  values ('11111111-1111-1111-1111-111111111111')$$,
  '42501', null, 'User B cannot insert User A profile');
select throws_ok($$insert into app.portfolios (user_id, name)
  values ('11111111-1111-1111-1111-111111111111', 'Foreign')$$,
  '42501', null, 'User B cannot insert User A portfolio');
select throws_ok($$insert into app.accounts (user_id, portfolio_id, name, account_type)
  values ('11111111-1111-1111-1111-111111111111',
    (select id from app.portfolios where is_primary), 'Foreign', 'other')$$,
  '42501', null, 'User B cannot insert User A account');
select throws_ok($$insert into app.manual_assets
  (user_id, portfolio_id, name, category, current_value, value_as_of)
  values ('11111111-1111-1111-1111-111111111111',
    (select id from app.portfolios where is_primary), 'Foreign', 'other', 1, now())$$,
  '42501', null, 'User B cannot insert User A manual asset');
select throws_ok($$insert into app.liabilities
  (user_id, portfolio_id, name, category, outstanding_balance, balance_as_of)
  values ('11111111-1111-1111-1111-111111111111',
    (select id from app.portfolios where is_primary), 'Foreign', 'other', 1, now())$$,
  '42501', null, 'User B cannot insert User A liability');
select throws_ok($$insert into app.positions
  (user_id, portfolio_id, account_id, symbol, security_name, asset_type,
   quantity, average_cost, status, last_event_at)
  values (auth.uid(), gen_random_uuid(), gen_random_uuid(), 'VOO', 'VOO',
    'etf', 1, 1, 'open', now())$$,
  '42501', null, 'Authenticated clients cannot directly insert positions');
select throws_ok($$insert into app.position_events (user_id) values (auth.uid())$$,
  '42501', null, 'Authenticated clients cannot directly insert events');

update app.profiles set display_name = 'Hacked'
where id = '11111111-1111-1111-1111-111111111111';
update app.portfolios set name = 'Hacked'
where user_id = '11111111-1111-1111-1111-111111111111';
delete from app.portfolios
where user_id = '11111111-1111-1111-1111-111111111111';
update app.accounts set name = 'Hacked'
where user_id = '11111111-1111-1111-1111-111111111111';
delete from app.accounts
where user_id = '11111111-1111-1111-1111-111111111111';
update app.manual_assets set name = 'Hacked'
where user_id = '11111111-1111-1111-1111-111111111111';
delete from app.manual_assets
where user_id = '11111111-1111-1111-1111-111111111111';
update app.liabilities set name = 'Hacked'
where user_id = '11111111-1111-1111-1111-111111111111';
delete from app.liabilities
where user_id = '11111111-1111-1111-1111-111111111111';

select lives_ok($$
  select * from app.create_position(
    (select id from app.portfolios where is_primary),
    (select id from app.accounts where name = 'User B Brokerage'),
    'BND', 'Vanguard Total Bond Market ETF', 'etf', 3, 75,
    '2026-08-30 17:00+00', null,
    'bbbbbbbb-0000-0000-0000-000000000001')
$$, 'User B creates their own position');

-- SECURITY DEFINER create_position abuse and existence non-disclosure.
select throws_ok($$
  select * from app.create_position(
    (select id from app.portfolios where is_primary),
    (select id from test_ids where name = 'user_a_brokerage'),
    'SPY', 'SPDR S&P 500 ETF', 'etf', 1, 1, '2026-08-30 18:00+00', null,
    'bbbbbbbb-0000-0000-0000-000000000010')
$$, 'P0002', 'Resource unavailable',
  'create_position refuses a foreign account without disclosing existence');
select throws_ok($$
  select * from app.create_position(
    (select id from app.portfolios where is_primary),
    '00000000-0000-0000-0000-000000000001',
    'SPY', 'SPDR S&P 500 ETF', 'etf', 1, 1, '2026-08-30 18:00+00', null,
    'bbbbbbbb-0000-0000-0000-000000000011')
$$, 'P0002', 'Resource unavailable',
  'create_position gives the same error for a nonexistent account');
select throws_ok($$
  select * from app.create_position(
    (select id from test_ids where name = 'user_a_portfolio'),
    (select id from test_ids where name = 'user_a_brokerage'),
    'SPY', 'SPDR S&P 500 ETF', 'etf', 1, 1, '2026-08-30 18:00+00', null,
    'bbbbbbbb-0000-0000-0000-000000000012')
$$, 'P0002', 'Resource unavailable',
  'create_position refuses foreign portfolio and account IDs');
select throws_ok($$
  select * from app.create_position(
    (select id from test_ids where name = 'user_a_portfolio'),
    (select id from test_ids where name = 'user_b_brokerage'),
    'SPY', 'SPDR S&P 500 ETF', 'etf', 1, 1, '2026-08-30 18:00+00', null,
    'bbbbbbbb-0000-0000-0000-000000000014')
$$, 'P0002', 'Resource unavailable',
  'create_position refuses a foreign portfolio paired with an owned account');
select throws_ok($$
  select * from app.create_position(
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000003',
    'SPY', 'SPDR S&P 500 ETF', 'etf', 1, 1, '2026-08-30 18:00+00', null,
    'bbbbbbbb-0000-0000-0000-000000000013')
$$, 'P0002', 'Resource unavailable',
  'create_position gives the same error for nonexistent parent IDs');

-- SECURITY DEFINER edit_position foreign position abuse.
select throws_ok($$
  select * from app.edit_position(
    (select id from test_ids where name = 'user_a_position'), 'dividend',
    null, null, null, null, null, null, null, null, 1,
    '2026-08-30 19:00+00', null,
    'bbbbbbbb-0000-0000-0000-000000000020')
$$, 'P0002', 'Resource unavailable',
  'edit_position refuses a foreign position without disclosing existence');
select throws_ok($$
  select * from app.edit_position(
    '00000000-0000-0000-0000-000000000004', 'dividend',
    null, null, null, null, null, null, null, null, 1,
    '2026-08-30 19:00+00', null,
    'bbbbbbbb-0000-0000-0000-000000000021')
$$, 'P0002', 'Resource unavailable',
  'edit_position gives the same error for a nonexistent position');

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

-- SECURITY DEFINER edit_position foreign account abuse.
select throws_ok($$
  select * from app.edit_position(
    (select id from app.positions where symbol = 'QQQ'), 'transfer',
    (select id from test_ids where name = 'user_b_brokerage'),
    null, null, null, null, null, null, null, null,
    '2026-08-30 19:00+00', null,
    'aaaaaaaa-0000-0000-0000-000000000020')
$$, 'P0002', 'Resource unavailable',
  'edit_position refuses a foreign account without disclosing existence');
select throws_ok($$
  select * from app.edit_position(
    (select id from app.positions where symbol = 'QQQ'), 'transfer',
    '00000000-0000-0000-0000-000000000005',
    null, null, null, null, null, null, null, null,
    '2026-08-30 19:00+00', null,
    'aaaaaaaa-0000-0000-0000-000000000021')
$$, 'P0002', 'Resource unavailable',
  'edit_position gives the same error for a nonexistent account');
select is((select count(*) from app.position_events where request_id in
  ('aaaaaaaa-0000-0000-0000-000000000020',
   'aaaaaaaa-0000-0000-0000-000000000021')), 0::bigint,
  'Rejected edit attacks append no event');
select is((select account_id from app.positions where symbol = 'QQQ'),
  (select id from test_ids where name = 'user_a_brokerage'),
  'Rejected edit attacks change no position');

select is((select name from app.portfolios where is_primary), 'My portfolio'::text,
  'Cross-user update/delete leaves portfolio intact');
select is((select display_name from app.profiles), 'User A'::text,
  'Cross-user update leaves profile intact');
select is((select count(*) from app.accounts), 2::bigint,
  'Cross-user update/delete leaves accounts intact');
select is((select name from app.manual_assets), 'Emergency fund'::text,
  'Cross-user update/delete leaves manual asset intact');
select is((select name from app.liabilities), 'Mortgage'::text,
  'Cross-user update/delete leaves liability intact');

select throws_ok($$update app.positions set quantity = 99 where symbol = 'QQQ'$$,
  '42501', null, 'Owner cannot directly update positions');
select throws_ok($$delete from app.positions where symbol = 'QQQ'$$,
  '42501', null, 'Owner cannot directly delete positions');
select throws_ok($$update app.position_events set notes = 'Changed'$$,
  '42501', null, 'Owner cannot directly update events');
select throws_ok($$delete from app.position_events$$,
  '42501', null, 'Owner cannot directly delete events');

select lives_ok($$
  select * from app.edit_position(
    (select id from app.positions where symbol = 'QQQ'), 'buy',
    null, null, null, null, 24.5, 10, null, null, null,
    '2026-08-30 20:00+00', 'Added shares',
    'aaaaaaaa-0000-0000-0000-000000000030')
$$, 'edit_position applies a valid fractional-share buy');
select is((select quantity from app.positions where symbol = 'QQQ'), 24.5::numeric,
  'Buy updates current quantity exactly');
select is((select count(*) from app.position_events where event_type = 'buy'), 1::bigint,
  'Buy appends one complete event');
select lives_ok($$
  select * from app.edit_position(
    (select id from app.positions where symbol = 'QQQ'), 'buy',
    null, null, null, null, 24.5, 10, null, null, null,
    '2026-08-30 20:00+00', 'Added shares',
    'aaaaaaaa-0000-0000-0000-000000000030')
$$, 'Identical edit retry returns committed event');
select is((select count(*) from app.position_events
           where request_id = 'aaaaaaaa-0000-0000-0000-000000000030'), 1::bigint,
  'Identical edit retry does not duplicate history');
select throws_ok($$
  select * from app.edit_position(
    (select id from app.positions where symbol = 'QQQ'), 'sell',
    null, null, null, null, 30, null, null, null, null,
    '2026-08-30 21:00+00', null,
    'aaaaaaaa-0000-0000-0000-000000000031')
$$, '22023', 'Invalid position intent', 'Invalid sell direction is rejected');
select is((select quantity from app.positions where symbol = 'QQQ'), 24.5::numeric,
  'Rejected edit rolls back the position');
select is((select count(*) from app.position_events
           where request_id = 'aaaaaaaa-0000-0000-0000-000000000031'), 0::bigint,
  'Rejected edit appends no event');

select lives_ok($$
  select * from app.edit_position(
    (select id from app.positions where symbol = 'QQQ'), 'transfer',
    (select id from app.accounts where name = 'Retirement'),
    null, null, null, null, null, null, null, null,
    '2026-08-30 21:00+00', null,
    'aaaaaaaa-0000-0000-0000-000000000032')
$$, 'Same-owner account transfer succeeds');
select is((select account_id from app.positions where symbol = 'QQQ'),
  (select id from app.accounts where name = 'Retirement'),
  'Transfer uses the validated same-owner account');

select lives_ok($$
  select * from app.edit_position(
    (select id from app.positions where symbol = 'QQQ'), 'split',
    null, null, null, null, null, null, 2, 1, null,
    '2026-08-30 22:00+00', null,
    'aaaaaaaa-0000-0000-0000-000000000033')
$$, 'Two-for-one split uses database-derived values');
select is((select quantity from app.positions where symbol = 'QQQ'), 49::numeric,
  'Split derives raw post-split quantity');
select is((select average_cost from app.positions where symbol = 'QQQ'), 5::numeric,
  'Split derives post-split average cost');
select is(
  (select previous_quantity * previous_average_cost
   from app.position_events where event_type = 'split'),
  (select new_quantity * new_average_cost
   from app.position_events where event_type = 'split'),
  'Split preserves total cost basis exactly');

select throws_ok($$
  select * from app.edit_position(
    (select id from app.positions where symbol = 'QQQ'), 'dividend',
    null, null, null, null, null, null, null, null, null,
    '2026-08-30 23:00+00', null,
    'aaaaaaaa-0000-0000-0000-000000000034')
$$, '22023', 'Invalid position intent', 'Dividend requires an amount');
select lives_ok($$
  select * from app.edit_position(
    (select id from app.positions where symbol = 'QQQ'), 'dividend',
    null, null, null, null, null, null, null, null, 12.34,
    '2026-08-30 23:00+00', null,
    'aaaaaaaa-0000-0000-0000-000000000035')
$$, 'Valid cash dividend succeeds');
select is((select quantity from app.positions where symbol = 'QQQ'), 49::numeric,
  'Cash dividend leaves quantity unchanged');
select is((select average_cost from app.positions where symbol = 'QQQ'), 5::numeric,
  'Cash dividend leaves average cost unchanged');
select is((select dividend_amount from app.position_events
           where event_type = 'dividend'), 12.34::numeric,
  'Cash dividend amount is exact');

select lives_ok($$
  select * from app.edit_position(
    (select id from app.positions where symbol = 'QQQ'), 'close',
    null, null, null, null, null, null, null, null, null,
    '2026-08-31 00:00+00', null,
    'aaaaaaaa-0000-0000-0000-000000000036')
$$, 'Position closes through an explicit event');
select ok((select status = 'closed' and quantity = 0 and closed_at is not null
           from app.positions where symbol = 'QQQ'),
  'Close atomically records closed state');
select lives_ok($$
  select * from app.edit_position(
    (select id from app.positions where symbol = 'QQQ'), 'reopen',
    null, null, null, null, 1.25, 0, null, null, null,
    '2026-08-31 01:00+00', null,
    'aaaaaaaa-0000-0000-0000-000000000037')
$$, 'Closed position reopens explicitly');
select ok((select status = 'open' and quantity = 1.25 and average_cost = 0
                  and closed_at is null
           from app.positions where symbol = 'QQQ'),
  'Reopen restores valid open state with zero cost basis');

select throws_ok($$
  update app.manual_assets
  set portfolio_id = (select id from test_ids where name = 'user_b_portfolio'),
      account_id = (select id from test_ids where name = 'user_b_brokerage')
$$, '23503', null, 'Manual asset cannot be reparented to another user');
select throws_ok($$
  update app.liabilities
  set portfolio_id = (select id from test_ids where name = 'user_b_portfolio'),
      account_id = (select id from test_ids where name = 'user_b_brokerage')
$$, '23503', null, 'Liability cannot be reparented to another user');
select throws_ok($$update app.profiles set timezone = 'Not/A_Timezone'
                  where id = auth.uid()$$,
  '23514', null, 'Profile timezone must be valid');

reset role;

select is((select count(*) from app.positions where symbol = 'SPY'), 0::bigint,
  'All rejected SECURITY DEFINER create attacks cause zero database-wide writes');
select throws_ok($$update app.position_events set notes = 'Privileged mutation'
                  where event_type = 'initial'$$,
  '55000', 'History is immutable',
  'Immutable trigger rejects privileged event updates');
select throws_ok($$delete from app.position_events where event_type = 'initial'$$,
  '55000', 'History is immutable',
  'Immutable trigger rejects privileged event deletes');
select is((select count(*) from app.position_events
           where request_id in (
             'aaaaaaaa-0000-0000-0000-000000000001',
             'bbbbbbbb-0000-0000-0000-000000000001'
           )),
  2::bigint, 'Privileged mutation attempts preserve history');

-- Catalog-driven least-privilege inventory, including effective PUBLIC grants.
select ok(not has_schema_privilege('anon', 'app', 'USAGE'),
  'anon cannot use app schema');
select ok(not has_schema_privilege('anon', 'app', 'CREATE'),
  'anon cannot create in app schema');
select cmp_ok((select count(*) from pg_catalog.pg_class c
               join pg_catalog.pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'app' and c.relkind in ('r','p','v','m','f')),
  '>=', 7::bigint, 'Table inventory covers every Phase 2a relation');
select ok(not exists (
  select 1 from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'app' and c.relkind in ('r','p','v','m','f') and (
    has_table_privilege('anon', c.oid, 'SELECT') or
    has_table_privilege('anon', c.oid, 'INSERT') or
    has_table_privilege('anon', c.oid, 'UPDATE') or
    has_table_privilege('anon', c.oid, 'DELETE') or
    has_table_privilege('anon', c.oid, 'TRUNCATE') or
    has_table_privilege('anon', c.oid, 'REFERENCES') or
    has_table_privilege('anon', c.oid, 'TRIGGER'))),
  'anon has no privilege on any app table or view');
select cmp_ok((select count(*) from pg_catalog.pg_proc p
               join pg_catalog.pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'app'),
  '>=', 6::bigint, 'Function inventory covers every signature');
select ok(not exists (
  select 1 from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'app' and has_function_privilege('anon', p.oid, 'EXECUTE')),
  'anon cannot execute any app function or overload');
select ok(not exists (
  select 1 from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'app' and c.relkind = 'S' and (
    has_sequence_privilege('anon', c.oid, 'USAGE') or
    has_sequence_privilege('anon', c.oid, 'SELECT') or
    has_sequence_privilege('anon', c.oid, 'UPDATE'))),
  'anon has no privilege on any app sequence');
select cmp_ok((select count(*) from pg_catalog.pg_type t
               join pg_catalog.pg_namespace n on n.oid = t.typnamespace
               where n.nspname = 'app' and t.typtype in ('c','d','e','m','r')),
  '>=', 7::bigint, 'Type inventory covers application-defined types');
select ok(not exists (
  select 1 from pg_catalog.pg_type t
  join pg_catalog.pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'app' and t.typtype in ('c','d','e','m','r')
    and has_type_privilege('anon', t.oid, 'USAGE')),
  'anon has no usage on application-defined types');

select is((select count(*) from pg_catalog.pg_proc p
           join pg_catalog.pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'app' and p.prosecdef),
  2::bigint, 'Phase 2a has exactly two SECURITY DEFINER functions');
select ok(not exists (
  select 1 from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'app' and p.prosecdef
    and not ('search_path=""' = any(coalesce(p.proconfig, array[]::text[])))),
  'Every SECURITY DEFINER pins an empty search_path');
select ok(not exists (
  select 1 from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'app' and p.prosecdef
    and obj_description(p.oid, 'pg_proc') is null),
  'Every SECURITY DEFINER documents its elevation');
select ok(
  has_function_privilege('authenticated',
    'app.create_position(uuid,uuid,text,text,text,numeric,numeric,timestamptz,text,uuid)',
    'EXECUTE') and
  has_function_privilege('authenticated',
    'app.edit_position(uuid,text,uuid,text,text,text,numeric,numeric,numeric,numeric,numeric,timestamptz,text,uuid)',
    'EXECUTE'),
  'authenticated can execute both position write RPCs');
select ok(
  not has_function_privilege('authenticated', 'app.set_updated_at()', 'EXECUTE') and
  not has_function_privilege('authenticated', 'app.reject_history_mutation()', 'EXECUTE') and
  not has_function_privilege('authenticated', 'app.validate_profile_timezone()', 'EXECUTE'),
  'authenticated cannot execute internal functions');
select ok(
  has_table_privilege('authenticated', 'app.positions', 'SELECT') and
  not has_table_privilege('authenticated', 'app.positions', 'INSERT') and
  not has_table_privilege('authenticated', 'app.positions', 'UPDATE') and
  not has_table_privilege('authenticated', 'app.positions', 'DELETE'),
  'positions table grant is read-only');
select ok(
  has_table_privilege('authenticated', 'app.position_events', 'SELECT') and
  not has_table_privilege('authenticated', 'app.position_events', 'INSERT') and
  not has_table_privilege('authenticated', 'app.position_events', 'UPDATE') and
  not has_table_privilege('authenticated', 'app.position_events', 'DELETE'),
  'position_events table grant is read-only');
select is((select count(*) from pg_catalog.pg_class c
           join pg_catalog.pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'app'
             and c.relname in ('profiles','portfolios','accounts','positions',
               'manual_assets','liabilities','position_events')
             and c.relrowsecurity and c.relforcerowsecurity),
  7::bigint, 'RLS is enabled and forced on every Phase 2a table');

select * from finish();
rollback;
