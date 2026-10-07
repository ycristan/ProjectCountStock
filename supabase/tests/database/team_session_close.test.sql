begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Synthetic fixtures only. Block 12: acknowledgement of uncounted actives and frozen consolidation (R13, 2026-10-07).
-- Users 1-3 team A (counter, counter, Independent), 4-6 team B, 7 admin.
insert into auth.users(id,email) select ('80000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  'close-'||n||'@example.invalid' from generate_series(1,7) n;
insert into public.app_user_access(user_id,access_kind) values('80000000-0000-0000-0000-000000000007','admin');
insert into public.warehouses(id,name) values('80000000-0000-0000-0000-000000000900','Close WH');
insert into public.inventory_items(brand_code,brand_name,bpu,pallet_size,weight_avg,warehouse_id,brand_active) values
('cl-both','Both teams',10,5,100,'80000000-0000-0000-0000-000000000900',true),
('cl-a','Team A only',10,5,100,'80000000-0000-0000-0000-000000000900',true),
('cl-inactive-counted','Inactive counted',10,5,100,'80000000-0000-0000-0000-000000000900',false),
('cl-miss-2','Missing aisle 2',10,5,100,'80000000-0000-0000-0000-000000000900',true),
('cl-miss-1','Missing aisle 1',10,5,100,'80000000-0000-0000-0000-000000000900',true),
('cl-inactive-missing','Inactive missing',10,5,100,'80000000-0000-0000-0000-000000000900',false);
insert into public.item_bin_locations(brand_code,bin_location) values ('cl-miss-2','02A01'),('cl-miss-1','01B03'),('cl-miss-1','05C01');
insert into public.count_sessions(id,warehouse_id,box_tare_g) values('80000000-0000-0000-0000-000000000100','80000000-0000-0000-0000-000000000900',300);
insert into public.teams(id,session_id,team_name) values
('80000000-0000-0000-0000-0000000002a0','80000000-0000-0000-0000-000000000100','A team'),
('80000000-0000-0000-0000-0000000002b0','80000000-0000-0000-0000-000000000100','B team');
insert into public.team_flows(team_id) values('80000000-0000-0000-0000-0000000002a0'),('80000000-0000-0000-0000-0000000002b0');
-- Team t (a|b): members 1,2 counters and 3 Independent offset by k (0|3).
insert into public.team_memberships(id,team_id,user_id,display_name,role,display_order)
select ('80000000-0000-0000-0000-0000000003'||t||n)::uuid,('80000000-0000-0000-0000-0000000002'||t||'0')::uuid,
  ('80000000-0000-0000-0000-'||lpad((n+k)::text,12,'0'))::uuid,'Person '||t||n,
  case when n=3 then 'independent' else 'counter' end,case when n=3 then 0 else n end
from (values ('a',0),('b',3)) x(t,k), generate_series(1,3) n;
insert into public.team_count_slots(id,team_id,ordinal)
select ('80000000-0000-0000-0000-0000000004'||t||n)::uuid,('80000000-0000-0000-0000-0000000002'||t||'0')::uuid,n
from (values ('a'),('b')) x(t), generate_series(1,2) n;
insert into public.team_slot_assignments(team_id,slot_id,membership_id)
select ('80000000-0000-0000-0000-0000000002'||t||'0')::uuid,('80000000-0000-0000-0000-0000000004'||t||n)::uuid,
  ('80000000-0000-0000-0000-0000000003'||t||n)::uuid
from (values ('a'),('b')) x(t), generate_series(1,2) n;
update public.team_flows set phase='counting',revision=1;

create function pg_temp.as_user(n integer) returns void language sql as $$
  select set_config('request.jwt.claim.sub','80000000-0000-0000-0000-'||lpad(n::text,12,'0'),true) $$;
create function pg_temp.team(t text) returns uuid language sql as $$ select ('80000000-0000-0000-0000-0000000002'||t||'0')::uuid $$;
create function pg_temp.rev(t text) returns bigint language sql security definer as $$
  select revision from public.team_flows where team_id=pg_temp.team(t) $$;
create function pg_temp.version(t text) returns uuid language sql security definer as $$
  select result_version_id from public.team_flows where team_id=pg_temp.team(t) $$;
create function pg_temp.c(t text,b text,u integer) returns jsonb language sql as $$
  select public.save_team_count(pg_temp.team(t),gen_random_uuid(),b,null,0,0,u,false,10,5,100,300,null) $$;
grant execute on function pg_temp.as_user(integer),pg_temp.team(text),pg_temp.rev(text),pg_temp.version(text),
  pg_temp.c(text,text,integer) to authenticated;

set local role authenticated;
-- Team A: both counters agree on every product it counted.
select pg_temp.as_user(1); select pg_temp.c('a','cl-both',10); select pg_temp.c('a','cl-a',7);
select pg_temp.as_user(2); select pg_temp.c('a','cl-both',10); select pg_temp.c('a','cl-a',7);
-- Team B: counts the shared product and an inactive one.
select pg_temp.as_user(4); select pg_temp.c('b','cl-both',25); select pg_temp.c('b','cl-inactive-counted',3);
select pg_temp.as_user(5); select pg_temp.c('b','cl-both',25); select pg_temp.c('b','cl-inactive-counted',3);
reset role;
update public.team_memberships set finish_state='requested' where role='counter';
update public.team_memberships set finish_state='accepted' where role='counter';
update public.team_flows set phase='reconciling',revision=2;

set local role authenticated;
select pg_temp.as_user(3); select public.submit_team_reconciliation(pg_temp.team('a'),2,gen_random_uuid());
select pg_temp.as_user(6); select public.submit_team_reconciliation(pg_temp.team('b'),2,gen_random_uuid());
select pg_temp.as_user(7);
select public.review_team_result(pg_temp.team('a'),3,gen_random_uuid(),true,null);
select public.review_team_result(pg_temp.team('b'),3,gen_random_uuid(),true,null);
select is(public.read_team_session_closing('80000000-0000-0000-0000-000000000100')->>'ready','false','Not ready while teams sign');
select throws_ok($q$select public.close_team_session('80000000-0000-0000-0000-000000000100',array['cl-miss-1','cl-miss-2'])$q$,
  'P0001','Every team must be closed before the session','Session waits for every team');
-- Team A closes; team B still open.
select pg_temp.as_user(1); select public.sign_team_result(pg_temp.team('a'),pg_temp.version('a'),gen_random_uuid());
select pg_temp.as_user(2); select public.sign_team_result(pg_temp.team('a'),pg_temp.version('a'),gen_random_uuid());
select pg_temp.as_user(3);
select is(public.sign_team_result(pg_temp.team('a'),pg_temp.version('a'),gen_random_uuid())->>'phase','closed','Team A closed');
select pg_temp.as_user(7);
select is(public.read_team_session_closing('80000000-0000-0000-0000-000000000100')->'uncounted','[]'::jsonb,
  'No uncounted list until every team is closed');
select pg_temp.as_user(4); select public.sign_team_result(pg_temp.team('b'),pg_temp.version('b'),gen_random_uuid());
select pg_temp.as_user(5); select public.sign_team_result(pg_temp.team('b'),pg_temp.version('b'),gen_random_uuid());
select pg_temp.as_user(6); select public.sign_team_result(pg_temp.team('b'),pg_temp.version('b'),gen_random_uuid());

-- R13: only active products nobody counted, ordered by their first BIN.
select pg_temp.as_user(3);
select throws_ok($q$select public.read_team_session_closing('80000000-0000-0000-0000-000000000100')$q$,'42501',null,
  'Only an admin sees the closing list');
select pg_temp.as_user(7);
select is(public.read_team_session_closing('80000000-0000-0000-0000-000000000100')->>'ready','true','Ready once every team is closed');
select is((select string_agg(x->>'brandCode',',' order by o) from jsonb_array_elements(
  public.read_team_session_closing('80000000-0000-0000-0000-000000000100')->'uncounted') with ordinality y(x,o)),
  'cl-miss-1,cl-miss-2','Uncounted actives only, ordered by BIN; inactive missing product not listed');
select throws_ok($q$select public.close_team_session('80000000-0000-0000-0000-000000000100',array['cl-miss-1'])$q$,
  '40001',null,'Acknowledgement must match the list shown');
select pg_temp.as_user(3);
select throws_ok($q$select public.close_team_session('80000000-0000-0000-0000-000000000100',array['cl-miss-1','cl-miss-2'])$q$,
  '42501',null,'Only an admin acknowledges');
select pg_temp.as_user(7);
select is(public.close_team_session('80000000-0000-0000-0000-000000000100',array['cl-miss-2','cl-miss-1'])->>'uncountedCount',
  '2','Admin acknowledges the list once');
select is(public.close_team_session('80000000-0000-0000-0000-000000000100',array['cl-miss-2','cl-miss-1'])->>'uncountedCount',
  '2','Retry returns the same closing');
reset role;

select is((select status::text from public.count_sessions where id='80000000-0000-0000-0000-000000000100'),'fechada','Session closed');
select is((select acknowledged_by from public.team_session_results),'80000000-0000-0000-0000-000000000007'::uuid,'Acknowledgement keeps who');
select results_eq($q$select brand_code,quantity_units,final_cases,final_units,uncounted,brand_active,jsonb_array_length(team_quantities)
    from public.team_session_result_items order by brand_code$q$,
  $q$values ('cl-a',7::bigint,0::bigint,7::bigint,false,true,1),('cl-both',35,3,5,false,true,2),
    ('cl-inactive-counted',3,0,3,false,false,1),('cl-miss-1',0,0,0,true,true,0),('cl-miss-2',0,0,0,true,true,0)$q$,
  'Teams summed; uncounted actives 0 and marked; inactive counted kept; inactive missing has no line');
select throws_ok($q$update public.team_session_result_items set quantity_units=1$q$,'P0001','Session results are immutable','Consolidation immutable');
select throws_ok($q$delete from public.team_session_results$q$,'P0001','Session results are immutable','Acknowledgement immutable');
select throws_ok($q$update public.count_sessions set status='aberta' where id='80000000-0000-0000-0000-000000000100'$q$,
  'P0001','Use the versioned team session workflow','Closed session cannot reopen');
update public.inventory_items set brand_name='Renamed later' where brand_code='cl-both';
select is((select brand_name from public.team_session_result_items where brand_code='cl-both'),'Both teams',
  'Later inventory changes do not alter the closed report');

select * from finish();
rollback;
