begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Synthetic fixtures only. Block 8 (R07): admin review and selective recount rounds.
insert into auth.users(id,email) select ('60000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  'rev-'||n||'@example.invalid' from generate_series(1,5) n;
insert into public.app_user_access(user_id,access_kind) values
('60000000-0000-0000-0000-000000000004','admin'),('60000000-0000-0000-0000-000000000005','admin');
insert into public.warehouses(id,name) values('60000000-0000-0000-0000-000000000900','Review WH');
insert into public.inventory_items(brand_code,brand_name,bpu,pallet_size,weight_avg,warehouse_id) values
('rev-eq','Rev Eq',10,5,100,'60000000-0000-0000-0000-000000000900'),
('rev-diff','Rev Diff',10,5,100,'60000000-0000-0000-0000-000000000900'),
('rev-tol','Rev Tol',1,0,100,'60000000-0000-0000-0000-000000000900'),
('rev-miss','Rev Miss',10,5,100,'60000000-0000-0000-0000-000000000900'),
('rev-never','Rev Never',10,5,100,'60000000-0000-0000-0000-000000000900');
insert into public.count_sessions(id,warehouse_id,box_tare_g) values('60000000-0000-0000-0000-000000000100','60000000-0000-0000-0000-000000000900',300);
insert into public.teams(id,session_id,team_name) values('60000000-0000-0000-0000-000000000200','60000000-0000-0000-0000-000000000100','Review team');
insert into public.team_flows(team_id) values('60000000-0000-0000-0000-000000000200');
insert into public.team_memberships(id,team_id,user_id,display_name,role,display_order) values
('60000000-0000-0000-0000-000000000301','60000000-0000-0000-0000-000000000200','60000000-0000-0000-0000-000000000001','Counter A','counter',1),
('60000000-0000-0000-0000-000000000302','60000000-0000-0000-0000-000000000200','60000000-0000-0000-0000-000000000002','Counter B','counter',2),
('60000000-0000-0000-0000-000000000303','60000000-0000-0000-0000-000000000200','60000000-0000-0000-0000-000000000003','Independent','independent',0);
insert into public.team_count_slots(id,team_id,ordinal) values
('60000000-0000-0000-0000-000000000401','60000000-0000-0000-0000-000000000200',1),('60000000-0000-0000-0000-000000000402','60000000-0000-0000-0000-000000000200',2);
insert into public.team_slot_assignments(id,team_id,slot_id,membership_id) values
('60000000-0000-0000-0000-000000000501','60000000-0000-0000-0000-000000000200','60000000-0000-0000-0000-000000000401','60000000-0000-0000-0000-000000000301'),
('60000000-0000-0000-0000-000000000502','60000000-0000-0000-0000-000000000200','60000000-0000-0000-0000-000000000402','60000000-0000-0000-0000-000000000302');
update public.team_flows set phase='counting',revision=1 where team_id='60000000-0000-0000-0000-000000000200';

create function pg_temp.w(grams bigint) returns jsonb language sql as $$
  select jsonb_build_object('rounds',jsonb_build_array(jsonb_build_object('boxes',0,'grams',grams)),'visualCases',0) $$;
-- c(): count as the current user (manual unless weighing given); r(): reconcile as the current user.
create function pg_temp.c(b text,u integer,w jsonb default null,bpu integer default 10)
returns jsonb language sql as $$ select public.save_team_count('60000000-0000-0000-0000-000000000200',gen_random_uuid(),b,null,
  0,0,u,w is not null,bpu,case when bpu=1 then 0 else 5 end,100,300,w) $$;
create function pg_temp.r(b text,rev bigint,u integer,bpu integer default 10)
returns jsonb language sql as $$ select public.save_team_reconciliation('60000000-0000-0000-0000-000000000200',gen_random_uuid(),b,rev,
  0,0,u,false,bpu,case when bpu=1 then 0 else 5 end,100,300,null) $$;
create function pg_temp.rev() returns bigint language sql security definer as $$
  select revision from public.team_flows where team_id='60000000-0000-0000-0000-000000000200' $$;
create function pg_temp.review(accept boolean,brands text[],rev bigint default null,cmd uuid default gen_random_uuid())
returns jsonb language sql as $$ select public.review_team_result('60000000-0000-0000-0000-000000000200',
  coalesce(rev,pg_temp.rev()),cmd,accept,brands) $$;
create function pg_temp.submit() returns jsonb language sql as $$
  select public.submit_team_reconciliation('60000000-0000-0000-0000-000000000200',pg_temp.rev(),gen_random_uuid()) $$;
create function pg_temp.cmp(b text) returns jsonb language sql as $$
  select x from jsonb_array_elements(public.read_team_comparison('60000000-0000-0000-0000-000000000200')) x where x->>'brandCode'=b $$;
grant execute on function pg_temp.w(bigint),pg_temp.c(text,integer,jsonb,integer),pg_temp.r(text,bigint,integer,integer),
  pg_temp.rev(),pg_temp.review(boolean,text[],bigint,uuid),pg_temp.submit(),pg_temp.cmp(text) to authenticated;
create function pg_temp.as_user(n integer) returns void language sql as $$
  select set_config('request.jwt.claim.sub','60000000-0000-0000-0000-'||lpad(n::text,12,'0'),true) $$;
grant execute on function pg_temp.as_user(integer) to authenticated;

set local role authenticated;
select pg_temp.as_user(1);
select pg_temp.c('rev-eq',10); select pg_temp.c('rev-diff',7); select pg_temp.c('rev-miss',3);
select pg_temp.c('rev-tol',100,pg_temp.w(10000),1);
select pg_temp.as_user(2);
select pg_temp.c('rev-eq',10); select pg_temp.c('rev-diff',9);
select pg_temp.c('rev-tol',99,pg_temp.w(9900),1);
reset role;
update public.team_memberships set finish_state='requested' where role='counter' and team_id='60000000-0000-0000-0000-000000000200';
update public.team_memberships set finish_state='accepted' where role='counter' and team_id='60000000-0000-0000-0000-000000000200';
update public.team_flows set phase='reconciling',revision=2 where team_id='60000000-0000-0000-0000-000000000200';

set local role authenticated;
select pg_temp.as_user(3);
select public.decide_team_item('60000000-0000-0000-0000-000000000200','rev-tol',
  (select id from public.team_count_records where brand_code='rev-tol' and units=99),2,gen_random_uuid());
select pg_temp.r('rev-diff',2,8); select pg_temp.r('rev-miss',2,3);
select is(pg_temp.submit()->>'revision','3','Setup: team submitted to the admin');

-- Who may review.
select throws_ok($q$select pg_temp.review(true,null)$q$,'42501',null,'Independent cannot review');
select pg_temp.as_user(1);
select throws_ok($q$select pg_temp.review(true,null)$q$,'42501',null,'Counter cannot review');

-- Input checks.
select pg_temp.as_user(4);
select throws_ok($q$select pg_temp.review(false,array['rev-never'])$q$,'22023','Only products counted by this team can be returned',
  'T20: product never counted by the team cannot be returned');
select throws_ok($q$select pg_temp.review(false,array[]::text[])$q$,'22023','Select at least one product to recount','Return needs a selection');
select throws_ok($q$select pg_temp.review(true,array['rev-eq'])$q$,'22023','Accepting takes no product selection','Accept takes no selection');
select throws_ok($q$select pg_temp.review(true,null,2)$q$,'40001',null,'Stale screen cannot review');

-- T20: equal, reconciled and tolerance products are all selectable.
select is(pg_temp.review(false,array['rev-eq','rev-diff','rev-tol','rev-eq'],3,'60000000-0000-0000-0000-000000000701')->>'phase',
  'reconciling','T20: return reopens reconciliation');
select is(pg_temp.review(false,array['rev-eq','rev-diff','rev-tol','rev-eq'],3,'60000000-0000-0000-0000-000000000701')->>'revision',
  '4','T50: exact retry returns the original receipt');
select throws_ok($q$select pg_temp.review(true,null,3,'60000000-0000-0000-0000-000000000701')$q$,'22023','Command identifier already used',
  'Command reuse with another decision is refused');
-- T23: the other admin decided on the same screen; the second decision fails.
select pg_temp.as_user(5);
select throws_ok($q$select pg_temp.review(true,null,3)$q$,'P0001','Review is only available after submission',
  'T23: simultaneous admin decision does not overwrite the first');

-- T22: counters stay locked; the Independent recounts only the selected products.
select pg_temp.as_user(1);
select throws_ok($q$select pg_temp.c('rev-diff',5)$q$,'42501','Counting is blocked','T22: counter cannot edit during a recount round');
select pg_temp.as_user(3);
select is(pg_temp.cmp('rev-eq')->>'selected','true','Selected product is marked in the comparison');
select is(pg_temp.cmp('rev-miss')->>'selected','false','Product not selected is not marked');
select is(pg_temp.cmp('rev-diff')->'reconciliation','null'::jsonb,'Selected product waits for a new recount');
select throws_ok($q$select pg_temp.r('rev-miss',4,4)$q$,'P0001','Item is not in the recount round','Product not selected keeps its result');
select throws_ok($q$select public.decide_team_item('60000000-0000-0000-0000-000000000200','rev-tol',null,4,gen_random_uuid())$q$,
  'P0001','Decisions are closed during a recount round','No new tolerance choice during a round');
select throws_ok($q$select pg_temp.submit()$q$,'P0001','Every item must be resolved before submitting','Round needs every selected recount');
select pg_temp.r('rev-eq',4,11); select pg_temp.r('rev-diff',4,9); select pg_temp.r('rev-tol',4,100,1);
select is(pg_temp.submit()->>'revision','5','Recount round resubmitted');

-- T21: second round on a subset.
select pg_temp.as_user(5);
select is(pg_temp.review(false,array['rev-diff'])->>'revision','6','Second round returns one product');
select pg_temp.as_user(3);
select is(pg_temp.cmp('rev-eq')->>'selected','false','Earlier round product is not reopened');
select is(pg_temp.cmp('rev-eq')->'reconciliation'->>'quantity','11','Earlier round recount stays current');
select pg_temp.r('rev-diff',6,10);
select is(pg_temp.submit()->>'revision','7','Second round resubmitted');
select is(jsonb_array_length(public.read_team_reviews('60000000-0000-0000-0000-000000000200')),2,'Both rounds kept in the history');
select is((select x->>'round' from jsonb_array_elements(public.read_team_reviews('60000000-0000-0000-0000-000000000200')) x
  where x->'brands'='["rev-diff"]'),'2','Rounds are numbered in order');

select pg_temp.as_user(4);
select is(pg_temp.review(true,null)->>'phase','signing','Admin accepts the result');
select throws_ok($q$select pg_temp.review(false,array['rev-eq'],7)$q$,'P0001','Review is only available after submission',
  'No return after acceptance');
reset role;

select is((select phase from public.team_flows where team_id='60000000-0000-0000-0000-000000000200'),'signing','Phase is signing');
select is((select v.source_revision from public.team_flows f join public.team_result_versions v on v.id=f.result_version_id
  where f.team_id='60000000-0000-0000-0000-000000000200'),7::bigint,'Accepted version is the latest submission');
create temp view res as select i.brand_code,i.quantity_units q,i.resolution from public.team_result_items i
  join public.team_flows f on f.result_version_id=i.version_id;
select results_eq($q$select brand_code,q,resolution from res order by brand_code$q$,
  $q$values ('rev-diff',10::bigint,'reconciled'),('rev-eq',11,'reconciled'),('rev-miss',3,'reconciled'),('rev-tol',100,'reconciled')$q$,
  'T21: latest recount is official; products outside the rounds keep their result');
select results_eq($q$select v.source_revision,i.quantity_units from public.team_result_items i
    join public.team_result_versions v on v.id=i.version_id where i.brand_code='rev-diff' order by 1$q$,
  $q$values (3::bigint,8::bigint),(5,9),(7,10)$q$,'Every submitted version is kept');
select is((select count(*) from public.team_reconciliations where brand_code='rev-diff'),3::bigint,'Every recount is kept');
select is((select count(*) from public.team_count_records where brand_code='rev-diff' and units in (7,9)),2::bigint,'Counter originals are unchanged');
select is((select string_agg(decision,',' order by decided_at) from public.team_admin_reviews),'return,return,accept','Every admin decision is kept');
select is((select count(distinct decided_by) from public.team_admin_reviews),2::bigint,'Each decision keeps its admin');
select throws_ok($q$update public.team_admin_reviews set decision='accept'$q$,'P0001','Admin reviews are append-only','Reviews cannot be rewritten');
select throws_ok($q$delete from public.team_recount_items$q$,'P0001','Admin reviews are append-only','Round products cannot be deleted');

select * from finish();
rollback;
