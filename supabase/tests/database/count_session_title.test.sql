begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Synthetic fixtures only. The title is optional in the database (old sessions and fixtures have
-- none); the create-session action makes it required for new sessions.
insert into public.warehouses(id,name) values('50000000-0000-0000-0000-000000000900','Title WH');

select lives_ok($q$insert into public.count_sessions(id,warehouse_id,title) values('50000000-0000-0000-0000-000000000100',
  '50000000-0000-0000-0000-000000000900','End Of Year Count CCH - Main Warehouse 2026')$q$,'A session can have a title');
select is((select title from public.count_sessions where id='50000000-0000-0000-0000-000000000100'),
  'End Of Year Count CCH - Main Warehouse 2026','The title is stored as typed');
select lives_ok($q$insert into public.count_sessions(id,warehouse_id) values('50000000-0000-0000-0000-000000000101',
  '50000000-0000-0000-0000-000000000900')$q$,'A session without a title still works (existing sessions)');
select is((select title from public.count_sessions where id='50000000-0000-0000-0000-000000000101'),null,'No title is null');
select throws_ok($q$insert into public.count_sessions(warehouse_id,title) values('50000000-0000-0000-0000-000000000900','   ')$q$,
  '23514',null,'A blank title is refused');
select throws_ok($q$insert into public.count_sessions(warehouse_id,title) values('50000000-0000-0000-0000-000000000900',repeat('x',121))$q$,
  '23514',null,'A title over 120 characters is refused');
select lives_ok($q$insert into public.count_sessions(warehouse_id,title) values('50000000-0000-0000-0000-000000000900',repeat('x',120))$q$,
  'A title of exactly 120 characters is accepted');

select * from finish();
rollback;
