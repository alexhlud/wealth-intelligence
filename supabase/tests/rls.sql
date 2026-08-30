begin;
select plan(17);

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select lives_ok($$ select app.ensure_primary_portfolio() $$, 'User A can initialize a primary portfolio');

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select lives_ok($$ select app.ensure_primary_portfolio() $$, 'User B can initialize a primary portfolio');

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
insert into app.positions (user_id, portfolio_id, symbol, quantity, average_cost)
select auth.uid(), id, 'QQQ', 20.5, 400 from app.portfolios where is_primary;
select is((select count(*) from app.positions), 1::bigint, 'User A reads their own position');

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select is((select count(*) from app.positions), 0::bigint, 'User B reads zero User A positions');
select throws_ok(
  $$ insert into app.positions (user_id, portfolio_id, symbol, quantity, average_cost)
     values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'VOO', 1, 1) $$,
  '42501', null, 'User B cannot create a row for User A'
);
with updated as (
  update app.positions set quantity = 21 returning id
)
select is((select count(*) from updated), 0::bigint, 'User B cannot update User A position');

with deleted as (
  delete from app.positions returning id
)
select is((select count(*) from deleted), 0::bigint, 'User B cannot delete User A position');

select ok(not has_table_privilege('anon', 'app.positions', 'select'), 'anon cannot select positions');
select ok(not has_table_privilege('anon', 'app.positions', 'insert'), 'anon cannot insert positions');
select ok(not has_table_privilege('anon', 'app.positions', 'update'), 'anon cannot update positions');
select ok(not has_table_privilege('anon', 'app.positions', 'delete'), 'anon cannot delete positions');
select ok(not has_table_privilege('anon', 'app.portfolios', 'select'), 'anon cannot select portfolios');
select ok(not has_table_privilege('anon', 'app.portfolios', 'insert'), 'anon cannot insert portfolios');
select ok(not has_table_privilege('anon', 'app.portfolios', 'update'), 'anon cannot update portfolios');
select ok(not has_table_privilege('anon', 'app.portfolios', 'delete'), 'anon cannot delete portfolios');
select ok(not has_schema_privilege('anon', 'app', 'usage'), 'anon cannot use the app schema');
select ok(not has_function_privilege('anon', 'app.ensure_primary_portfolio()', 'execute'), 'anon cannot execute ensure_primary_portfolio');

select * from finish();
rollback;
