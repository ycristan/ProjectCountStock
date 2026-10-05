begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Synthetic fixtures only. Comparison rules R04/R05 as revised on 2026-10-05.
insert into auth.users(id,email) select ('40000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  'cmp-'||n||'@example.invalid' from generate_series(1,5) n;
insert into public.app_user_access(user_id,access_kind) values('40000000-0000-0000-0000-000000000004','admin');
insert into public.warehouses(id,name) values('40000000-0000-0000-0000-000000000900','Comparison WH');
insert into public.inventory_items(brand_code,brand_name,bpu,pallet_size,weight_avg,warehouse_id)
select 'cmp-'||c,'Cmp '||c,10,5,100,'40000000-0000-0000-0000-000000000900'
from unnest(array['eq','mix','zero','t98','t97','t29','t28','t980','t979','man','miss']) c;
insert into public.count_sessions(id,warehouse_id) values('40000000-0000-0000-0000-000000000100','40000000-0000-0000-0000-000000000900');
insert into public.teams(id,session_id,team_name) values('40000000-0000-0000-0000-000000000200','40000000-0000-0000-0000-000000000100','Cmp team');
insert into public.team_flows(team_id) values('40000000-0000-0000-0000-000000000200');
insert into public.team_memberships(id,team_id,user_id,display_name,role,display_order) values
('40000000-0000-0000-0000-000000000301','40000000-0000-0000-0000-000000000200','40000000-0000-0000-0000-000000000001','Counter A','counter',1),
('40000000-0000-0000-0000-000000000302','40000000-0000-0000-0000-000000000200','40000000-0000-0000-0000-000000000002','Counter B','counter',2),
('40000000-0000-0000-0000-000000000303','40000000-0000-0000-0000-000000000200','40000000-0000-0000-0000-000000000003','Independent','independent',0);
insert into public.team_count_slots(id,team_id,ordinal) values
('40000000-0000-0000-0000-000000000401','40000000-0000-0000-0000-000000000200',1),('40000000-0000-0000-0000-000000000402','40000000-0000-0000-0000-000000000200',2);
insert into public.team_slot_assignments(id,team_id,slot_id,membership_id) values
('40000000-0000-0000-0000-000000000501','40000000-0000-0000-0000-000000000200','40000000-0000-0000-0000-000000000401','40000000-0000-0000-0000-000000000301'),
('40000000-0000-0000-0000-000000000502','40000000-0000-0000-0000-000000000200','40000000-0000-0000-0000-000000000402','40000000-0000-0000-0000-000000000302');
update public.team_flows set phase='counting',revision=1 where team_id='40000000-0000-0000-0000-000000000200';
-- (brand, A units, A method, B units, B method); 'miss' has no record from B.
insert into public.team_count_records(team_id,assignment_id,slot_id,brand_code,units,bpu_at_entry,method)
select '40000000-0000-0000-0000-000000000200',
  case s when 1 then '40000000-0000-0000-0000-000000000501' else '40000000-0000-0000-0000-000000000502' end::uuid,
  case s when 1 then '40000000-0000-0000-0000-000000000401' else '40000000-0000-0000-0000-000000000402' end::uuid,
  'cmp-'||b, q, 10, m
from (values ('eq',1,10,'manual'),('eq',2,10,'manual'),('mix',1,100,'manual'),('mix',2,100,'weight'),
  ('zero',1,0,'manual'),('zero',2,0,'manual'),('t98',1,100,'weight'),('t98',2,98,'weight'),
  ('t97',1,100,'weight'),('t97',2,97,'weight'),('t29',1,30,'weight'),('t29',2,29,'weight'),
  ('t28',1,30,'weight'),('t28',2,28,'weight'),('t980',1,1000,'weight'),('t980',2,980,'weight'),
  ('t979',1,1000,'weight'),('t979',2,979,'weight'),('man',1,100,'manual'),('man',2,99,'manual'),
  ('miss',1,5,'manual')) v(b,s,q,m);

create temp view cmp as select x->>'brandCode' brand, x->>'status' status, x->>'limit' lim
  from jsonb_array_elements(public.read_team_comparison('40000000-0000-0000-0000-000000000200')) x;
grant select on cmp to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000003',true);
select is(public.read_team_comparison('40000000-0000-0000-0000-000000000200'),'[]'::jsonb,'No comparison while counting');
select throws_ok($q$select public.decide_team_item('40000000-0000-0000-0000-000000000200','cmp-t98',null,1,'40000000-0000-0000-0000-000000000801')$q$,
  'P0001','Decisions are only available during reconciliation','No decision while counting');
reset role;
update public.team_memberships set finish_state='requested' where role='counter' and team_id='40000000-0000-0000-0000-000000000200';
update public.team_memberships set finish_state='accepted' where role='counter' and team_id='40000000-0000-0000-0000-000000000200';
update public.team_flows set phase='reconciling',revision=2 where team_id='40000000-0000-0000-0000-000000000200';
set local role authenticated;

select is((select status from cmp where brand='cmp-eq'),'equal','T10: equal manual counts need no reconciliation');
select is((select status from cmp where brand='cmp-mix'),'equal','T10: equal across methods needs no reconciliation');
select is((select status from cmp where brand='cmp-zero'),'equal','T12: explicit zero is a valid equal quantity');
select is((select status from cmp where brand='cmp-t98'),'tolerance','T14: weight 100/98 inside the 2% limit');
select is((select status from cmp where brand='cmp-t97'),'reconcile','T14: weight 100/97 outside the 2% limit');
select is((select status from cmp where brand='cmp-t29'),'tolerance','T16: 30/29 inside the 1-unit minimum');
select is((select status from cmp where brand='cmp-t28'),'reconcile','T16: 30/28 outside the 1-unit minimum');
select is((select status from cmp where brand='cmp-t980'),'tolerance','T16: 1000/980 inside (limit 20)');
select is((select lim from cmp where brand='cmp-t980'),'20','T16: limit is floor of 2% of the larger value');
select is((select status from cmp where brand='cmp-t979'),'reconcile','T16: 1000/979 outside');
select is((select status from cmp where brand='cmp-man'),'reconcile','T11: manual difference always reconciles');
select is((select status from cmp where brand='cmp-miss'),'reconcile','T12: a missing required count reconciles');
select is((select count(*) from cmp),11::bigint,'T13: only products the team counted, not the whole warehouse');

select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000001',true);
select throws_ok($q$select public.read_team_comparison('40000000-0000-0000-0000-000000000200')$q$,'42501',null,'Counters stay blind: no comparison for counters');
select throws_ok($q$select public.decide_team_item('40000000-0000-0000-0000-000000000200','cmp-t98',null,2,'40000000-0000-0000-0000-000000000801')$q$,'42501',null,'Counter cannot decide');
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000004',true);
select is((select count(*) from jsonb_array_elements(public.read_team_comparison('40000000-0000-0000-0000-000000000200'))),11::bigint,'Admin monitors the comparison');
select throws_ok($q$select public.decide_team_item('40000000-0000-0000-0000-000000000200','cmp-t98',null,2,'40000000-0000-0000-0000-000000000801')$q$,'42501',null,'Admin never decides counts');

select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000003',true);
select throws_ok($q$select public.decide_team_item('40000000-0000-0000-0000-000000000200','cmp-eq',null,2,'40000000-0000-0000-0000-000000000801')$q$,
  'P0001','Only items within weight tolerance take this decision','Equal item takes no decision');
select throws_ok($q$select public.decide_team_item('40000000-0000-0000-0000-000000000200','cmp-t97',null,2,'40000000-0000-0000-0000-000000000801')$q$,
  'P0001','Only items within weight tolerance take this decision','Item outside tolerance must be reconciled');
select throws_ok($q$select public.decide_team_item('40000000-0000-0000-0000-000000000200','cmp-t98',null,1,'40000000-0000-0000-0000-000000000801')$q$,
  '40001',null,'Stale screen cannot decide');
select throws_ok(format($q$select public.decide_team_item('40000000-0000-0000-0000-000000000200','cmp-t98',%L,2,'40000000-0000-0000-0000-000000000801')$q$,
  (select id from public.team_count_records where brand_code='cmp-t29' limit 1)),'22023',null,'Cannot pick a value from another product');

-- T17: choose the LOWER value explicitly (no preference for the larger one).
select is(public.decide_team_item('40000000-0000-0000-0000-000000000200','cmp-t98',
  (select r.id from public.team_count_records r where r.brand_code='cmp-t98' and r.units=98),2,'40000000-0000-0000-0000-000000000802')->>'quantity',
  '98','T17: Independent picks one recorded value');
select is(public.decide_team_item('40000000-0000-0000-0000-000000000200','cmp-t98',
  (select r.id from public.team_count_records r where r.brand_code='cmp-t98' and r.units=98),2,'40000000-0000-0000-0000-000000000802')->>'quantity',
  '98','T50: exact retry returns the original decision');
reset role;
select is((select count(*) from public.team_item_decisions),1::bigint,'Retry stores no duplicate');
select is((select decided_by from public.team_item_decisions),'40000000-0000-0000-0000-000000000303'::uuid,'Author recorded');
set local role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000003',true);
select is((select x->'decision'->>'quantity' from jsonb_array_elements(public.read_team_comparison('40000000-0000-0000-0000-000000000200')) x
  where x->>'brandCode'='cmp-t98'),'98','Comparison shows the latest decision');
select is(public.decide_team_item('40000000-0000-0000-0000-000000000200','cmp-t29',null,2,'40000000-0000-0000-0000-000000000803')->>'decision',
  'reconcile','T17: Independent may send a tolerance item to reconciliation');
reset role;
select throws_ok($q$update public.team_item_decisions set quantity_units=1$q$,'P0001','Item decisions are append-only','Decisions cannot be rewritten');
select throws_ok($q$delete from public.team_item_decisions$q$,'P0001','Item decisions are append-only','Decisions cannot be deleted');

select * from finish();
rollback;
