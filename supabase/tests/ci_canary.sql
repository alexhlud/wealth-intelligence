begin;
select plan(1);
select is(1, 2, 'CI canary: must fail');
select * from finish();
rollback;
