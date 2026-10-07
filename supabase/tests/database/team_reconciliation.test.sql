begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Synthetic fixtures only. Raw weighing data (approved 2026-10-05) and block 7 (R06/R07).
insert into auth.users(id,email) select ('50000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  'rec-'||n||'@example.invalid' from generate_series(1,4) n;
insert into public.app_user_access(user_id,access_kind) values('50000000-0000-0000-0000-000000000004','admin');
insert into public.warehouses(id,name) values('50000000-0000-0000-0000-000000000900','Reconciliation WH');
insert into public.inventory_items(brand_code,brand_name,bpu,pallet_size,weight_avg,warehouse_id) values
('rec-w','Rec W',10,5,100,'50000000-0000-0000-0000-000000000900'),
('rec-eq','Rec Eq',10,5,100,'50000000-0000-0000-0000-000000000900'),
('rec-tol','Rec Tol',1,0,100,'50000000-0000-0000-0000-000000000900'),
('rec-tol2','Rec Tol2',1,0,100,'50000000-0000-0000-0000-000000000900'),
('rec-diff','Rec Diff',10,5,100,'50000000-0000-0000-0000-000000000900'),
('rec-miss','Rec Miss',10,5,100,'50000000-0000-0000-0000-000000000900');
insert into public.count_sessions(id,warehouse_id,box_tare_g) values('50000000-0000-0000-0000-000000000100','50000000-0000-0000-0000-000000000900',300);
insert into public.teams(id,session_id,team_name) values('50000000-0000-0000-0000-000000000200','50000000-0000-0000-0000-000000000100','Rec team');
insert into public.team_flows(team_id) values('50000000-0000-0000-0000-000000000200');
insert into public.team_memberships(id,team_id,user_id,display_name,role,display_order) values
('50000000-0000-0000-0000-000000000301','50000000-0000-0000-0000-000000000200','50000000-0000-0000-0000-000000000001','Counter A','counter',1),
('50000000-0000-0000-0000-000000000302','50000000-0000-0000-0000-000000000200','50000000-0000-0000-0000-000000000002','Counter B','counter',2),
('50000000-0000-0000-0000-000000000303','50000000-0000-0000-0000-000000000200','50000000-0000-0000-0000-000000000003','Independent','independent',0);
insert into public.team_count_slots(id,team_id,ordinal) values
('50000000-0000-0000-0000-000000000401','50000000-0000-0000-0000-000000000200',1),('50000000-0000-0000-0000-000000000402','50000000-0000-0000-0000-000000000200',2);
insert into public.team_slot_assignments(id,team_id,slot_id,membership_id) values
('50000000-0000-0000-0000-000000000501','50000000-0000-0000-0000-000000000200','50000000-0000-0000-0000-000000000401','50000000-0000-0000-0000-000000000301'),
('50000000-0000-0000-0000-000000000502','50000000-0000-0000-0000-000000000200','50000000-0000-0000-0000-000000000402','50000000-0000-0000-0000-000000000302');
update public.team_flows set phase='counting',revision=1 where team_id='50000000-0000-0000-0000-000000000200';

-- c(brand, revision, cases, units, weighing) saves as the current user; bpu 10 products.
create function pg_temp.c(b text,r bigint,cs integer,u integer,w jsonb,weight boolean default true,bpu integer default 10)
returns jsonb language sql as $$ select public.save_team_count('50000000-0000-0000-0000-000000000200',gen_random_uuid(),b,r,
  0,cs,u,weight,bpu,case when bpu=1 then 0 else 5 end,100,300,w) $$;
create function pg_temp.w(grams bigint,boxes integer default 0,visual integer default 0) returns jsonb language sql as $$
  select jsonb_build_object('rounds',jsonb_build_array(jsonb_build_object('boxes',boxes,'grams',grams)),'visualCases',visual) $$;
create function pg_temp.r(b text,rev bigint,cs integer,u integer,w jsonb,cmd uuid default gen_random_uuid(),bpu integer default 10)
returns jsonb language sql as $$ select public.save_team_reconciliation('50000000-0000-0000-0000-000000000200',cmd,b,rev,
  0,cs,u,w is not null,bpu,case when bpu=1 then 0 else 5 end,100,300,w) $$;
grant execute on function pg_temp.c(text,bigint,integer,integer,jsonb,boolean,integer),pg_temp.w(bigint,integer,integer),
  pg_temp.r(text,bigint,integer,integer,jsonb,uuid,integer) to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',true);
select throws_ok($q$select pg_temp.c('rec-w',null,0,10,pg_temp.w(1070))$q$,'22023','Weighing does not match the quantity',
  'Weighing: 10.7 units rounds up, 10 is refused');
select is(pg_temp.c('rec-w',null,0,11,pg_temp.w(1070))->>'final_units','1','Weighing: 10.7 units saved as 11');
select throws_ok($q$select pg_temp.c('rec-w',0,0,12,pg_temp.w(1300,1))$q$,'22023','Weighing does not match the quantity',
  'Weighing: tare per box is subtracted (1300 g - 1 box = 10 units)');
select throws_ok($q$select pg_temp.c('rec-w',0,1,10,pg_temp.w(1000))$q$,'22023','Weighing does not match the quantity',
  'Weighing: visual cases must match the cases sent');
select is(pg_temp.c('rec-w',0,1,10,pg_temp.w(1300,1,1))->>'final_cases','2','Weighing: visual case + 10 weighed units');
select throws_ok($q$select pg_temp.c('rec-w',1,0,10,null)$q$,'22023','Invalid weighing','Count by weight requires the weighing');
select throws_ok($q$select pg_temp.c('rec-w',1,0,10,pg_temp.w(1000),false)$q$,'22023','Invalid count','Manual count carries no weighing');
select throws_ok($q$select pg_temp.c('rec-w',1,0,10,'{"rounds":[{"boxes":0,"grams":"1.5"}],"visualCases":0}')$q$,'22023','Invalid weighing','Grams must be whole numbers');
select throws_ok($q$select pg_temp.c('rec-w',1,0,10,'{"rounds":[],"visualCases":0}')$q$,'22023','Invalid weighing','At least one round');
select throws_ok($q$select pg_temp.c('rec-w',1,0,1,pg_temp.w(200,1))$q$,'22023','Insufficient net weight','Net weight must be positive');
select is(pg_temp.c('rec-w',1,0,10,'{"rounds":[{"boxes":0,"grams":500},{"boxes":0,"grams":569}],"visualCases":0}')->>'final_units','0',
  'Weighing: rounds are summed (1069 g = 10.69 = 10 units)');
select pg_temp.c('rec-eq',null,1,0,null,false);
select pg_temp.c('rec-tol',null,0,100,pg_temp.w(10000),true,1);
select pg_temp.c('rec-tol2',null,0,100,pg_temp.w(10000),true,1);
select pg_temp.c('rec-diff',null,0,7,null,false);
select pg_temp.c('rec-miss',null,0,3,null,false);
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000002',true);
select pg_temp.c('rec-w',null,1,0,null,false);
select pg_temp.c('rec-eq',null,1,0,null,false);
select pg_temp.c('rec-tol',null,0,98,pg_temp.w(9800),true,1);
select pg_temp.c('rec-tol2',null,0,99,pg_temp.w(9900),true,1);
select pg_temp.c('rec-diff',null,0,9,null,false);
reset role;
select is((select weighing->>'grossG' from public.team_count_records where brand_code='rec-w' and method='weight'),'1069','Gross weight stored');
select is((select weighing->>'netG' from public.team_count_records where brand_code='rec-w' and method='weight'),'1069','Net weight stored');
select is((select jsonb_array_length(weighing->'rounds') from public.team_count_records where brand_code='rec-w' and method='weight'),2,'Every round stored');
select is((select weighing->>'tareG' from public.team_count_records where brand_code='rec-w' and method='weight'),'300','Tare at entry stored');
select is((select h.weighing->>'boxes' from public.team_count_record_history h join public.team_count_records r on r.id=h.record_id
  where r.brand_code='rec-w' and h.revision=1),'1','Edit history keeps the earlier weighing');

update public.team_memberships set finish_state='requested' where role='counter' and team_id='50000000-0000-0000-0000-000000000200';
update public.team_memberships set finish_state='accepted' where role='counter' and team_id='50000000-0000-0000-0000-000000000200';
update public.team_flows set phase='reconciling',revision=2 where team_id='50000000-0000-0000-0000-000000000200';
set local role authenticated;

select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',true);
select throws_ok($q$select pg_temp.r('rec-diff',2,0,9,null)$q$,'42501',null,'Counter cannot reconcile');
select throws_ok($q$select public.submit_team_reconciliation('50000000-0000-0000-0000-000000000200',2,gen_random_uuid())$q$,'42501',null,'Counter cannot submit');
select is((select count(*) from public.team_reconciliations),0::bigint,'Counters cannot read reconciliations');
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000004',true);
select throws_ok($q$select pg_temp.r('rec-diff',2,0,9,null)$q$,'42501',null,'Admin cannot reconcile');
select throws_ok($q$select public.submit_team_reconciliation('50000000-0000-0000-0000-000000000200',2,gen_random_uuid())$q$,'42501',null,'Admin cannot submit');

select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000003',true);
select throws_ok($q$select pg_temp.r('rec-eq',2,1,0,null)$q$,'P0001','Item does not need reconciliation','Equal item is not reconciled');
select throws_ok($q$select pg_temp.r('rec-tol',2,0,99,null,gen_random_uuid(),1)$q$,'P0001','Item does not need reconciliation',
  'Tolerance item needs the Independent choice first');
select throws_ok($q$select pg_temp.r('rec-diff',1,0,9,null)$q$,'40001',null,'Stale screen cannot reconcile');
select throws_ok($q$select public.submit_team_reconciliation('50000000-0000-0000-0000-000000000200',2,gen_random_uuid())$q$,
  'P0001','Every item must be resolved before submitting','T18: submission blocked while items are pending');
select public.decide_team_item('50000000-0000-0000-0000-000000000200','rec-tol',
  (select id from public.team_count_records where brand_code='rec-tol' and units=98),2,gen_random_uuid());
select public.decide_team_item('50000000-0000-0000-0000-000000000200','rec-tol2',null,2,gen_random_uuid());
select is(pg_temp.r('rec-tol2',2,0,99,null,gen_random_uuid(),1)->>'quantity','99','T17: tolerance item sent to reconciliation takes a count');
select is(pg_temp.r('rec-diff',2,0,8,pg_temp.w(800))->>'quantity','8','R06: reconciliation by weight');
select is(pg_temp.r('rec-diff',2,0,9,null,'50000000-0000-0000-0000-000000000701')->>'quantity','9','R06: corrected reconciliation');
select is(pg_temp.r('rec-diff',2,0,9,null,'50000000-0000-0000-0000-000000000701')->>'quantity','9','T50: exact retry returns the original receipt');
select throws_ok($q$select pg_temp.r('rec-diff',2,0,7,null,'50000000-0000-0000-0000-000000000701')$q$,'22023','Command identifier already used',
  'Command reuse with another quantity is refused');
select is(pg_temp.r('rec-miss',2,0,0,null)->>'quantity','0','T12: missing count reconciled as explicit zero');
select is((select x->'reconciliation'->>'quantity' from jsonb_array_elements(public.read_team_comparison('50000000-0000-0000-0000-000000000200')) x
  where x->>'brandCode'='rec-diff'),'9','Comparison shows the latest reconciliation');
select is((select count(*) from public.team_reconciliations where brand_code='rec-diff'),2::bigint,'Every reconciliation entry is kept');
select is(public.submit_team_reconciliation('50000000-0000-0000-0000-000000000200',2,'50000000-0000-0000-0000-000000000702')->>'revision',
  '3','R07: submission moves the team to admin review');
select is(public.submit_team_reconciliation('50000000-0000-0000-0000-000000000200',2,'50000000-0000-0000-0000-000000000702')->>'revision',
  '3','T50: submission retry returns the same receipt');
select throws_ok($q$select pg_temp.r('rec-diff',3,0,5,null)$q$,'P0001','Reconciliation is only available during reconciliation',
  'No reconciliation after submission');
reset role;

select is((select phase from public.team_flows where team_id='50000000-0000-0000-0000-000000000200'),'admin_review','Phase is admin review');
select is((select count(*) from public.team_result_versions where sealed_at is not null and source_revision=3),1::bigint,'One sealed result version');
create temp view res as select brand_code,quantity_units q,resolution,resolved_by from public.team_result_items;
select results_eq($q$select brand_code,q,resolution,resolved_by from res order by brand_code$q$,
  $q$values ('rec-diff',9::bigint,'reconciled','50000000-0000-0000-0000-000000000303'::uuid),
    ('rec-eq',10,'equal',null),('rec-miss',0,'reconciled','50000000-0000-0000-0000-000000000303'),
    ('rec-tol',98,'weight_tolerance','50000000-0000-0000-0000-000000000303'),
    ('rec-tol2',99,'reconciled','50000000-0000-0000-0000-000000000303'),('rec-w',10,'equal',null)$q$,
  'Result holds every counted product with its resolution and author');
select is((select quantity_units from public.team_count_records where brand_code='rec-diff' and units=7),7::bigint,'Counter originals are unchanged');
select is((select jsonb_array_length(source_counts) from public.team_result_items where brand_code='rec-miss'),1,'Result keeps original counts');
select throws_ok($q$update public.team_reconciliations set units=1$q$,'P0001','Reconciliations are append-only','Reconciliations cannot be rewritten');
select throws_ok($q$delete from public.team_reconciliations$q$,'P0001','Reconciliations are append-only','Reconciliations cannot be deleted');

select * from finish();
rollback;
