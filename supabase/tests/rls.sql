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
  13::bigint, 'Approved write RPCs, MFA helper, scheduler health, and capture-gap boundary are SECURITY DEFINER');
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
select is((select count(*) from pg_catalog.pg_policy as p
           join pg_catalog.pg_class as c on c.oid = p.polrelid
           join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
           where n.nspname = 'app' and p.polname like '%_mfa_assurance'
             and not p.polpermissive),
  11::bigint, 'Every user-owned app table has a restrictive MFA assurance policy');
select ok(
  has_function_privilege('authenticated',
    'app.create_position(uuid,uuid,text,text,text,numeric,numeric,timestamptz,text,uuid)',
    'EXECUTE') and
  has_function_privilege('authenticated',
    'app.edit_position(uuid,text,uuid,text,text,text,numeric,numeric,numeric,numeric,numeric,timestamptz,text,uuid)',
    'EXECUTE'),
  'authenticated can execute both position write RPCs');
select ok(
  has_function_privilege('service_role',
    'app.record_snapshot_capture_session(uuid,uuid,date,text,text,text)',
    'EXECUTE') and
  has_function_privilege('service_role',
    'app.create_scheduled_portfolio_snapshot(uuid,uuid,date,timestamptz,text,jsonb,jsonb,jsonb,uuid)',
    'EXECUTE') and
  has_function_privilege('service_role',
    'app.record_scheduler_auth_failure(text,integer,boolean,boolean)', 'EXECUTE') and
  has_function_privilege('service_role',
    'app.record_scheduler_invocation(boolean)', 'EXECUTE'),
  'service_role can execute all snapshot-capture worker RPCs');
select ok(not exists (
  select 1
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  cross join lateral pg_catalog.aclexplode(
    coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
  ) privilege
  where n.nspname = 'app'
    and p.oid in (
      'app.record_snapshot_capture_session(uuid,uuid,date,text,text,text)'::regprocedure,
      'app.create_scheduled_portfolio_snapshot(uuid,uuid,date,timestamptz,text,jsonb,jsonb,jsonb,uuid)'::regprocedure,
      'app.record_scheduler_auth_failure(text,integer,boolean,boolean)'::regprocedure,
      'app.record_scheduler_invocation(boolean)'::regprocedure
    )
    and privilege.grantee = 0
    and privilege.privilege_type = 'EXECUTE'
), 'public cannot execute snapshot-capture worker RPCs');
select ok(
  not has_function_privilege('anon',
    'app.record_snapshot_capture_session(uuid,uuid,date,text,text,text)',
    'EXECUTE') and
  not has_function_privilege('anon',
    'app.create_scheduled_portfolio_snapshot(uuid,uuid,date,timestamptz,text,jsonb,jsonb,jsonb,uuid)',
    'EXECUTE'),
  'anon cannot execute snapshot-capture worker RPCs');
select ok((select c.relrowsecurity and c.relforcerowsecurity
           from pg_catalog.pg_class c
           join pg_catalog.pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'app' and c.relname = 'scheduler_health'),
  'scheduler health has RLS enabled and forced');
select ok((select c.relrowsecurity and c.relforcerowsecurity
           from pg_catalog.pg_class c
           join pg_catalog.pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'app' and c.relname = 'xnys_sessions'),
  'XNYS sessions have RLS enabled and forced');
select is((select count(*) from pg_catalog.pg_policy p
           join pg_catalog.pg_class c on c.oid = p.polrelid
           join pg_catalog.pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'app' and c.relname = 'scheduler_health'),
  0::bigint, 'scheduler health has no direct table policies');
select is((select count(*) from pg_catalog.pg_policy p
           join pg_catalog.pg_class c on c.oid = p.polrelid
           join pg_catalog.pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'app' and c.relname = 'xnys_sessions'),
  0::bigint, 'XNYS sessions have no direct table policies');
select is((select count(*) from app.xnys_sessions
           where as_of_date between date '2027-01-01' and date '2027-12-31'
             and (market_close_at at time zone 'America/New_York')::time = time '13:00:00'),
  1::bigint, '2027 has exactly one XNYS early close');
select is((select as_of_date from app.xnys_sessions
           where as_of_date between date '2027-01-01' and date '2027-12-31'
             and (market_close_at at time zone 'America/New_York')::time = time '13:00:00'),
  date '2027-11-26', '2027 XNYS early close is the day after Thanksgiving');
select ok(
  not has_table_privilege('anon', 'app.scheduler_health', 'SELECT')
  and not has_table_privilege('authenticated', 'app.scheduler_health', 'SELECT'),
  'browser roles cannot read scheduler health directly');
select ok(
  has_function_privilege('service_role',
    'app.record_scheduler_auth_failure(text,integer,boolean,boolean)', 'EXECUTE')
  and has_function_privilege('service_role',
    'app.record_scheduler_invocation(boolean)', 'EXECUTE')
  and has_function_privilege('authenticated',
    'app.get_scheduler_health_status()', 'EXECUTE'),
  'scheduler health RPC grants are role-specific');

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
select throws_ok($$select app.record_scheduler_auth_failure('POST', 48, true, true)$$,
  '42501', null, 'authenticated cannot record scheduler authentication failures');
select throws_ok($$select app.record_scheduler_invocation(false)$$,
  '42501', null, 'authenticated cannot record scheduler invocations');
select lives_ok($$select * from app.get_scheduler_health_status()$$,
  'authenticated can read the minimal scheduler health status');
reset role;

select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
set local role anon;
select throws_ok($$select * from app.get_scheduler_health_status()$$,
  '42501', null, 'anon cannot execute scheduler health status');
select throws_ok($$select app.record_scheduler_invocation(false)$$,
  '42501', null, 'anon cannot record scheduler invocations');
reset role;

select set_config('request.jwt.claim.role', null, true);
select set_config('request.jwt.claim.sub', null, true);
select set_config('request.jwt.claims', null, true);
set local role service_role;
select throws_ok($$select app.record_scheduler_invocation(false)$$,
  '42501', 'Worker access required',
  'service-role database access without a JWT role claim cannot invoke worker RPCs');
reset role;

select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);
reset role;
select lives_ok($$select app.record_scheduler_invocation(true)$$,
  'service role records a successful scheduler capture');
reset role;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
select is((select count(*) from app.get_scheduler_health_status()), 1::bigint,
  'scheduler health status returns one row');
reset role;
select is(
  pg_catalog.pg_get_function_result('app.get_scheduler_health_status()'::regprocedure),
  'TABLE(alert boolean, alert_since timestamp with time zone)',
  'scheduler health status declares only alert fields'
);

update app.scheduler_health
set last_capture_at = '2026-10-01 20:00+00'::timestamptz;
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;
select lives_ok($$select app.record_scheduler_invocation(false)$$,
  'service role records a zero-capture invocation');
reset role;
select is((select last_capture_at from app.scheduler_health),
  '2026-10-01 20:00+00'::timestamptz,
  'zero-capture invocation does not advance the last capture time');
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
select ok((select alert from app.get_scheduler_health_status()),
  'two completed XNYS sessions without capture raise the alert');
select is((select alert_since from app.get_scheduler_health_status()),
  '2026-10-02 20:00+00'::timestamptz,
  'alert starts at the first completed session without capture');
reset role;
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;
select lives_ok($$select app.record_scheduler_invocation(true)$$,
  'service role clears stale health after confirmed capture');
reset role;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
select ok(not (select alert from app.get_scheduler_health_status()),
  'alert is false immediately after a confirmed capture');
reset role;
select ok(
  not has_function_privilege('authenticated', 'app.set_updated_at()', 'EXECUTE') and
  not has_function_privilege('authenticated', 'app.reject_history_mutation()', 'EXECUTE') and
  not has_function_privilege('authenticated', 'app.validate_profile_timezone()', 'EXECUTE') and
  not has_function_privilege('authenticated', 'app.require_mfa_assurance()', 'EXECUTE') and
  not has_function_privilege('authenticated',
    'app.create_position_mfa1_inner(uuid,uuid,text,text,text,numeric,numeric,timestamptz,text,uuid)',
    'EXECUTE'),
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

-- MFA AAL enforcement. A verified factor closes the AAL1 path for this owner;
-- a user with no verified factor keeps the new-account/bootstrap path.
insert into auth.mfa_factors (id, user_id, created_at, updated_at, factor_type, status, secret)
values ('aaaaaaaa-1111-1111-1111-111111111111',
        '11111111-1111-1111-1111-111111111111', now(), now(), 'totp', 'verified', 'test-secret');
insert into auth.mfa_factors (id, user_id, created_at, updated_at, factor_type, status, secret)
values ('bbbbbbbb-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222', now(), now(), 'totp', 'unverified', 'test-secret');

reset role;
insert into app.portfolios (user_id, name)
values ('11111111-1111-1111-1111-111111111111', 'User A second portfolio');
insert into test_ids (name, id)
select 'user_a_second_portfolio', id
from app.portfolios
where user_id = '11111111-1111-1111-1111-111111111111'
  and name = 'User A second portfolio';
insert into app.snapshot_capture_requests
  (user_id, portfolio_id, as_of_date, reason, status, failure_category)
values
  ('11111111-1111-1111-1111-111111111111',
   (select id from test_ids where name = 'user_a_portfolio'),
   '2026-10-01', 'daily_close', 'gap', 'price_unavailable'),
  ('11111111-1111-1111-1111-111111111111',
   (select id from test_ids where name = 'user_a_second_portfolio'),
   '2026-10-02', 'daily_close', 'gap', 'price_unavailable'),
  ('22222222-2222-2222-2222-222222222222',
   (select id from test_ids where name = 'user_b_portfolio'),
   '2026-10-03', 'daily_close', 'gap', 'price_unavailable');
reset role;

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select set_config('request.jwt.claim.aal', 'aal1', true);
set local role authenticated;
select ok((select count(*) > 0 from app.portfolios),
  'AAL1 retains bootstrap access when the user has only an unverified factor');
reset role;

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claim.aal', 'aal1', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select count(*) from app.profiles), 0::bigint, 'Verified-factor owner at AAL1 reads no profile rows');
select is((select count(*) from app.portfolios), 0::bigint, 'Verified-factor owner at AAL1 reads no portfolio rows');
select is((select count(*) from app.accounts), 0::bigint, 'Verified-factor owner at AAL1 reads no account rows');
select is((select count(*) from app.positions), 0::bigint, 'Verified-factor owner at AAL1 reads no position rows');
select is((select count(*) from app.manual_assets), 0::bigint, 'Verified-factor owner at AAL1 reads no manual asset rows');
select is((select count(*) from app.liabilities), 0::bigint, 'Verified-factor owner at AAL1 reads no liability rows');
select is((select count(*) from app.position_events), 0::bigint, 'Verified-factor owner at AAL1 reads no position-event rows');
select throws_ok($$insert into app.manual_assets
  (portfolio_id, name, category, current_value, value_as_of)
  values ((select id from test_ids where name = 'user_a_portfolio'),
          'Blocked AAL1 asset', 'cash', 1, '2026-09-03 00:00+00')$$,
  '42501', null, 'Verified-factor owner at AAL1 cannot insert a financial row');
select throws_ok($$select * from app.create_position(
  (select id from test_ids where name = 'user_a_portfolio'),
  (select id from test_ids where name = 'user_a_brokerage'),
  'MFA', 'MFA blocked', 'etf', 1, 1, '2026-09-03 00:00+00', null,
  'aaaaaaaa-0000-0000-0000-000000000099')$$,
  '42501', 'MFA verification required', 'AAL1 cannot invoke elevated create_position');
select throws_ok($$select * from app.edit_position(
  (select id from test_ids where name = 'user_a_position'), 'manual_adjustment',
  null, null, null, null, 2, 1, null, null, null,
  '2026-09-03 00:00+00', null, 'aaaaaaaa-0000-0000-0000-000000000100')$$,
  '42501', 'MFA verification required', 'AAL1 cannot invoke elevated edit_position');
select throws_ok($$select * from app.list_snapshot_capture_gaps()$$,
  '42501', 'MFA verification required', 'AAL1 cannot read capture gaps');

select set_config('request.jwt.claim.aal', 'aal2', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}', true);
select ok((select count(*) > 0 from app.profiles), 'Verified-factor owner at AAL2 reads profile rows');
select ok((select count(*) > 0 from app.portfolios), 'Verified-factor owner at AAL2 reads portfolio rows');
select ok((select count(*) > 0 from app.accounts), 'Verified-factor owner at AAL2 reads account rows');
select ok((select count(*) > 0 from app.positions), 'Verified-factor owner at AAL2 reads position rows');
select ok((select count(*) > 0 from app.manual_assets), 'Verified-factor owner at AAL2 reads manual asset rows');
select ok((select count(*) > 0 from app.liabilities), 'Verified-factor owner at AAL2 reads liability rows');
select ok((select count(*) > 0 from app.position_events), 'Verified-factor owner at AAL2 reads position-event rows');
select lives_ok($$select * from app.create_position(
  (select id from test_ids where name = 'user_a_portfolio'),
  (select id from test_ids where name = 'user_a_brokerage'),
  'MFA', 'MFA allowed', 'etf', 1, 1, '2026-09-03 00:00+00', null,
  'aaaaaaaa-0000-0000-0000-000000000101')$$,
  'AAL2 can invoke elevated create_position');
select is((select count(*) from app.list_snapshot_capture_gaps()), 2::bigint,
  'AAL2 reads capture gaps for every owned portfolio');
select is((select count(*) from app.list_snapshot_capture_gaps()
           where as_of_date = date '2026-10-03'), 0::bigint,
  'capture-gap RPC never returns another user''s portfolio gap');
reset role;

select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
set local role anon;
select throws_ok($$select * from app.list_snapshot_capture_gaps()$$,
  '42501', null, 'anon cannot execute the capture-gap RPC');
reset role;

select ok(
  not has_table_privilege('anon', 'app.quote_cache', 'SELECT') and
  not has_table_privilege('anon', 'app.quote_cache', 'INSERT') and
  not has_table_privilege('anon', 'app.quote_cache', 'UPDATE') and
  not has_table_privilege('anon', 'app.quote_cache', 'DELETE') and
  not has_table_privilege('anon', 'app.market_data_refresh_rate_windows', 'SELECT') and
  not has_table_privilege('anon', 'app.market_data_refresh_rate_windows', 'INSERT') and
  not has_table_privilege('anon', 'app.market_data_refresh_rate_windows', 'UPDATE') and
  not has_table_privilege('anon', 'app.market_data_refresh_rate_windows', 'DELETE'),
  'anon has no quote-cache or refresh-counter privileges');
select ok(
  not has_table_privilege('authenticated', 'app.quote_cache', 'SELECT') and
  not has_table_privilege('authenticated', 'app.quote_cache', 'INSERT') and
  not has_table_privilege('authenticated', 'app.quote_cache', 'UPDATE') and
  not has_table_privilege('authenticated', 'app.quote_cache', 'DELETE') and
  not has_table_privilege('authenticated', 'app.market_data_refresh_rate_windows', 'SELECT') and
  not has_table_privilege('authenticated', 'app.market_data_refresh_rate_windows', 'INSERT') and
  not has_table_privilege('authenticated', 'app.market_data_refresh_rate_windows', 'UPDATE') and
  not has_table_privilege('authenticated', 'app.market_data_refresh_rate_windows', 'DELETE'),
  'authenticated has no direct quote-cache or refresh-counter write path');
select is((select count(*) from pg_catalog.pg_policy p
           join pg_catalog.pg_class c on c.oid = p.polrelid
           join pg_catalog.pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'app' and c.relname in ('quote_cache', 'market_data_refresh_rate_windows')),
  0::bigint, 'quote cache and rate counter expose no direct RLS policies');

delete from app.xnys_sessions
where as_of_date > date '2026-01-06';
update app.scheduler_health
set last_capture_at = (
  select pg_catalog.max(market_close_at)
  from app.xnys_sessions
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
select ok((select alert from app.get_scheduler_health_status()),
  'exhausted XNYS calendar coverage raises the health alert');
select is((select alert_since from app.get_scheduler_health_status()),
  '2026-01-06 21:00+00'::timestamptz,
  'exhausted coverage reports the final covered session close');
reset role;

update app.scheduler_health
set last_capture_at = (
  select market_close_at
  from app.xnys_sessions
  where as_of_date = date '2026-01-02'
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
select ok((select alert from app.get_scheduler_health_status()),
  'exhausted coverage remains alerting when captures are also missing');
select is((select alert_since from app.get_scheduler_health_status()),
  '2026-01-05 21:00+00'::timestamptz,
  'missing sessions take precedence over the exhausted-coverage boundary');
reset role;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claim.aal', 'aal2', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select lives_ok($$select * from app.create_position(
  (select id from test_ids where name = 'user_a_portfolio'),
  (select id from test_ids where name = 'user_a_brokerage'),
  'TIME', 'Timestamp test fund', 'etf', 1, 1,
  pg_catalog.now() + interval '5 minutes', null,
  'aaaaaaaa-0000-0000-0000-000000000201')$$,
  'create_position accepts an occurred_at exactly five minutes ahead');
select throws_ok($$select * from app.create_position(
  (select id from test_ids where name = 'user_a_portfolio'),
  (select id from test_ids where name = 'user_a_brokerage'),
  'FUTR', 'Future timestamp fund', 'etf', 1, 1,
  pg_catalog.now() + interval '6 minutes', null,
  'aaaaaaaa-0000-0000-0000-000000000202')$$,
  '22008', 'Timestamp cannot be more than five minutes in the future',
  'create_position rejects a future occurred_at with its dedicated code');
select throws_ok($$select * from app.edit_position(
  (select id from app.positions where symbol = 'TIME'), 'manual_adjustment',
  null, null, null, null, 2, 1, null, null, null,
  pg_catalog.now() + interval '6 minutes', null,
  'aaaaaaaa-0000-0000-0000-000000000203')$$,
  '22008', 'Timestamp cannot be more than five minutes in the future',
  'edit_position rejects a future occurred_at with its dedicated code');
select lives_ok($$select * from app.edit_position(
  (select id from app.positions where symbol = 'TIME'), 'manual_adjustment',
  null, null, null, null, 2, 1, null, null, null,
  pg_catalog.now() + interval '5 minutes', null,
  'aaaaaaaa-0000-0000-0000-000000000204')$$,
  'edit_position accepts an occurred_at exactly five minutes ahead');
select throws_ok($$select * from app.edit_position(
  (select id from app.positions where symbol = 'TIME'), 'manual_adjustment',
  null, null, null, null, 3, 1, null, null, null,
  pg_catalog.now() + interval '4 minutes', null,
  'aaaaaaaa-0000-0000-0000-000000000206')$$,
  'P5001', 'Position event cannot precede the most recently recorded event',
  'edit_position distinguishes chronological rejection');
select throws_ok($$select * from app.create_position(
  (select id from test_ids where name = 'user_a_portfolio'),
  (select id from test_ids where name = 'user_a_brokerage'),
  'PAST', 'Past timestamp fund', 'etf', 1, 1,
  '1900-01-01 00:00+00', null,
  'aaaaaaaa-0000-0000-0000-000000000205')$$,
  '22023', 'Invalid position intent', 'create_position rejects a pre-1970 occurred_at');
select throws_ok($$insert into app.manual_assets
  (portfolio_id, name, category, current_value, value_as_of)
  values ((select id from test_ids where name = 'user_a_portfolio'),
          'Future asset', 'cash', 1, pg_catalog.now() + interval '6 minutes')$$,
  '22008', 'Timestamp cannot be more than five minutes in the future',
  'manual_assets rejects a future value_as_of');
select throws_ok($$insert into app.liabilities
  (portfolio_id, name, category, outstanding_balance, balance_as_of)
  values ((select id from test_ids where name = 'user_a_portfolio'),
          'Future liability', 'credit_balance', 1, pg_catalog.now() + interval '6 minutes')$$,
  '22008', 'Timestamp cannot be more than five minutes in the future',
  'liabilities rejects a future balance_as_of');
select throws_ok($$insert into app.manual_assets
  (portfolio_id, name, category, current_value, value_as_of)
  values ((select id from test_ids where name = 'user_a_portfolio'),
          'Pre-epoch asset', 'cash', 1, '1900-01-01 00:00+00')$$,
  '23514', null, 'manual_assets rejects a pre-1970 value_as_of');
select throws_ok($$insert into app.liabilities
  (portfolio_id, name, category, outstanding_balance, balance_as_of)
  values ((select id from test_ids where name = 'user_a_portfolio'),
          'Pre-epoch liability', 'credit_balance', 1, '1900-01-01 00:00+00')$$,
  '23514', null, 'liabilities rejects a pre-1970 balance_as_of');
reset role;

select * from finish();
rollback;
