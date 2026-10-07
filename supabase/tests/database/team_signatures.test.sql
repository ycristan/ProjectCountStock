begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Synthetic fixtures only. Block 11: R08 absent counter, R11 signatures/absences, R12 closing.
-- Users: 1-3 counters A/B/C, 4 Independent, 5-6 admins.
insert into auth.users(id,email) select ('70000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  'sig-'||n||'@example.invalid' from generate_series(1,6) n;
insert into public.app_user_access(user_id,access_kind) values
('70000000-0000-0000-0000-000000000005','admin'),('70000000-0000-0000-0000-000000000006','admin');
insert into public.warehouses(id,name) values('70000000-0000-0000-0000-000000000900','Signature WH');
insert into public.inventory_items(brand_code,brand_name,bpu,pallet_size,weight_avg,warehouse_id) values
('sig-1','Sig 1',10,5,100,'70000000-0000-0000-0000-000000000900'),
('sig-2','Sig 2',10,5,100,'70000000-0000-0000-0000-000000000900');
insert into public.count_sessions(id,warehouse_id,box_tare_g) values('70000000-0000-0000-0000-000000000100','70000000-0000-0000-0000-000000000900',300);
insert into public.teams(id,session_id,team_name) values('70000000-0000-0000-0000-000000000200','70000000-0000-0000-0000-000000000100','Signature team');
insert into public.team_flows(team_id) values('70000000-0000-0000-0000-000000000200');
insert into public.team_memberships(id,team_id,user_id,display_name,role,display_order) values
('70000000-0000-0000-0000-000000000301','70000000-0000-0000-0000-000000000200','70000000-0000-0000-0000-000000000001','Anna Counter','counter',1),
('70000000-0000-0000-0000-000000000302','70000000-0000-0000-0000-000000000200','70000000-0000-0000-0000-000000000002','Ben Counter','counter',2),
('70000000-0000-0000-0000-000000000303','70000000-0000-0000-0000-000000000200','70000000-0000-0000-0000-000000000003','Carl Counter','counter',3),
('70000000-0000-0000-0000-000000000304','70000000-0000-0000-0000-000000000200','70000000-0000-0000-0000-000000000004','Ivy Independent','independent',0);
insert into public.team_count_slots(id,team_id,ordinal) select ('70000000-0000-0000-0000-00000000040'||n)::uuid,
  '70000000-0000-0000-0000-000000000200',n from generate_series(1,3) n;
insert into public.team_slot_assignments(team_id,slot_id,membership_id) select '70000000-0000-0000-0000-000000000200',
  ('70000000-0000-0000-0000-00000000040'||n)::uuid,('70000000-0000-0000-0000-00000000030'||n)::uuid from generate_series(1,3) n;
update public.team_flows set phase='counting',revision=1 where team_id='70000000-0000-0000-0000-000000000200';

create function pg_temp.as_user(n integer) returns void language sql as $$
  select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-'||lpad(n::text,12,'0'),true) $$;
create function pg_temp.flow() returns public.team_flows language sql security definer as $$
  select * from public.team_flows where team_id='70000000-0000-0000-0000-000000000200' $$;
create function pg_temp.c(b text,u integer) returns jsonb language sql as $$
  select public.save_team_count('70000000-0000-0000-0000-000000000200',gen_random_uuid(),b,null,0,0,u,false,10,5,100,300,null) $$;
create function pg_temp.member(n integer) returns uuid language sql as $$ select ('70000000-0000-0000-0000-00000000030'||n)::uuid $$;
create function pg_temp.finish(n integer,action text) returns jsonb language sql as $$
  select case when action='request' then public.request_team_finish('70000000-0000-0000-0000-000000000200',pg_temp.member(n),
      (pg_temp.flow()).revision,gen_random_uuid())
    else public.decide_team_finish('70000000-0000-0000-0000-000000000200',pg_temp.member(n),true,(pg_temp.flow()).revision,gen_random_uuid()) end $$;
create function pg_temp.absent(n integer,reason text,cmd uuid default gen_random_uuid()) returns jsonb language sql as $$
  select public.mark_team_counter_absent('70000000-0000-0000-0000-000000000200',pg_temp.member(n),reason,(pg_temp.flow()).revision,cmd) $$;
create function pg_temp.cmp(b text) returns jsonb language sql as $$
  select x from jsonb_array_elements(public.read_team_comparison('70000000-0000-0000-0000-000000000200')) x where x->>'brandCode'=b $$;
create function pg_temp.sign(cmd uuid default gen_random_uuid(),v uuid default null) returns jsonb language sql as $$
  select public.sign_team_result('70000000-0000-0000-0000-000000000200',coalesce(v,(pg_temp.flow()).result_version_id),cmd) $$;
create function pg_temp.cancel() returns jsonb language sql as $$
  select public.cancel_team_signing('70000000-0000-0000-0000-000000000200',(pg_temp.flow()).result_version_id,gen_random_uuid()) $$;
create function pg_temp.accept() returns jsonb language sql as $$
  select public.review_team_result('70000000-0000-0000-0000-000000000200',(pg_temp.flow()).revision,gen_random_uuid(),true,null) $$;
grant execute on function pg_temp.as_user(integer),pg_temp.flow(),pg_temp.c(text,integer),pg_temp.member(integer),
  pg_temp.finish(integer,text),pg_temp.absent(integer,text,uuid),pg_temp.cmp(text),pg_temp.sign(uuid,uuid),
  pg_temp.cancel(),pg_temp.accept() to authenticated;

set local role authenticated;
select pg_temp.as_user(1); select pg_temp.c('sig-1',10); select pg_temp.c('sig-2',5);
select pg_temp.as_user(2); select pg_temp.c('sig-1',10);
select pg_temp.as_user(3); select pg_temp.c('sig-1',10); select pg_temp.c('sig-2',5);

-- R08: only the Independent records a counter who left, with a reason, during counting.
select pg_temp.as_user(2);
select throws_ok($q$select pg_temp.absent(3,'Went home')$q$,'42501',null,'Counter cannot mark another counter absent');
select pg_temp.as_user(5);
select throws_ok($q$select pg_temp.absent(3,'Went home')$q$,'42501',null,'Admin does not mark absence during counting');
select pg_temp.as_user(4);
select throws_ok($q$select pg_temp.absent(3,'  ')$q$,'22023','Absence needs a reason','Absence needs a reason');
select is(pg_temp.absent(3,'Went home sick','70000000-0000-0000-0000-000000000701')->>'phase','counting','R08: counter marked absent');
select is(public.mark_team_counter_absent('70000000-0000-0000-0000-000000000200',pg_temp.member(3),'Went home sick',1,
  '70000000-0000-0000-0000-000000000701')->>'revision','2','T50: retry returns the original receipt');
-- T25: the absent counter's existing credential no longer counts or reads.
select pg_temp.as_user(3);
select throws_ok($q$select pg_temp.c('sig-2',6)$q$,'42501',null,'T25: absent counter cannot count');
select throws_ok($q$select public.read_team_count('70000000-0000-0000-0000-000000000200')$q$,'42501',null,'T25: absent counter loses access');

-- Remaining counters finish normally (no fail-closed block after an absence).
select pg_temp.as_user(1); select pg_temp.finish(1,'request');
select pg_temp.as_user(4); select pg_temp.finish(1,'accept');
select pg_temp.as_user(2); select pg_temp.finish(2,'request');
select pg_temp.as_user(4);
select is(pg_temp.finish(2,'accept')->>'phase','reconciling','Finishes after an absence open the comparison');
-- T24: the absent counter's counts stay; products he did not count do not require him.
select is(pg_temp.cmp('sig-1')->>'status','equal','T24: absent counter count compared (10/10/10)');
select is(jsonb_array_length(pg_temp.cmp('sig-1')->'cells'),3,'T24: absent counter cell kept for counted product');
select is(pg_temp.cmp('sig-2')->>'status','reconcile','Missing count of a present counter still needs reconciliation');
select is((select x->>'quantity' from jsonb_array_elements(pg_temp.cmp('sig-2')->'cells') x
  where x->>'membershipId'='70000000-0000-0000-0000-000000000303'),'5','Absent counter value is shown');
select public.save_team_reconciliation('70000000-0000-0000-0000-000000000200',gen_random_uuid(),'sig-2',(pg_temp.flow()).revision,
  0,0,5,false,10,5,100,300,null);
select public.submit_team_reconciliation('70000000-0000-0000-0000-000000000200',(pg_temp.flow()).revision,gen_random_uuid());
select pg_temp.as_user(5);
select is(pg_temp.accept()->>'phase','signing','Admin accepts: signature collection opens');

-- R11 screen order: Independent first, then counters ascending.
select is((select string_agg(x->>'name',',' order by ord) from jsonb_array_elements(
  public.read_team_signing('70000000-0000-0000-0000-000000000200')->'participants') with ordinality t(x,ord)),
  'Ivy Independent,Anna Counter,Ben Counter,Carl Counter','R11: Independent first, then counters in order');

-- T37: cancel before any confirmation, then accept again.
select pg_temp.as_user(4);
select throws_ok($q$select pg_temp.cancel()$q$,'42501',null,'Only an admin cancels the collection');
select pg_temp.as_user(5);
create temp table old_version as select (pg_temp.flow()).result_version_id id;
grant select on old_version to authenticated;
select is(pg_temp.cancel()->>'phase','admin_review','T37: cancel before any confirmation');
select is(pg_temp.accept()->>'phase','signing','Collection reopened on the resealed result');
select isnt((pg_temp.flow()).result_version_id,(select id from old_version),'New sealed version after cancel');

-- R11: PIN signature by the person; same version for everyone.
select pg_temp.as_user(1);
select throws_ok($q$select pg_temp.sign(gen_random_uuid(),(select id from old_version))$q$,'40001',null,'Old version cannot be signed');
select is(pg_temp.sign('70000000-0000-0000-0000-000000000702')->>'phase','signing','T36: Anna signs by PIN');
select is(pg_temp.sign('70000000-0000-0000-0000-000000000702')->>'phase','signing','T50: signature retry returns the receipt');
select throws_ok($q$select pg_temp.sign()$q$,'P0001','Already confirmed','No second signature');
select isnt((pg_temp.flow()).frozen_at,null,'R11: first confirmation freezes the team');
-- T38: after the first confirmation nothing can be cancelled or changed.
select pg_temp.as_user(6);
select throws_ok($q$select pg_temp.cancel()$q$,'P0001','First confirmation received; collection cannot be cancelled','T38: no cancel after first confirmation');
select throws_ok($q$select pg_temp.accept()$q$,'P0001',null,'T38: no new admin decision after first confirmation');

-- Counter absent at signature: the Independent formalizes it, without witness.
select pg_temp.as_user(2);
select throws_ok($q$select public.formalize_counter_absence('70000000-0000-0000-0000-000000000200',(pg_temp.flow()).result_version_id,
  pg_temp.member(3),'Absent',gen_random_uuid())$q$,'42501',null,'Counter cannot formalize an absence');
select pg_temp.as_user(4);
select is(public.formalize_counter_absence('70000000-0000-0000-0000-000000000200',(pg_temp.flow()).result_version_id,
  pg_temp.member(3),'Left during counting',gen_random_uuid())->>'phase','signing','Independent formalizes Carl absence');

-- T40: Independent absent: admin records the reason; it counts only after a witness.
select pg_temp.as_user(5);
select is(public.record_independent_absence('70000000-0000-0000-0000-000000000200',(pg_temp.flow()).result_version_id,
  'Called away',gen_random_uuid())->>'witness','pending','T40: admin records Independent absence');
select is((select x->'confirmation'->>'witnessed' from jsonb_array_elements(
  public.read_team_signing('70000000-0000-0000-0000-000000000200')->'participants') x where x->>'role'='independent'),
  'false','T40: absence pending until a witness confirms');
select pg_temp.as_user(4);
select throws_ok($q$select public.witness_independent_absence('70000000-0000-0000-0000-000000000200',(pg_temp.flow()).result_version_id,
  gen_random_uuid())$q$,'42501',null,'Independent cannot witness own absence');
select pg_temp.as_user(3);
select throws_ok($q$select public.witness_independent_absence('70000000-0000-0000-0000-000000000200',(pg_temp.flow()).result_version_id,
  gen_random_uuid())$q$,'42501',null,'Absent counter cannot witness');
select pg_temp.as_user(2);
select is(pg_temp.sign()->>'phase','signing','T40: every other confirmation in, but the unwitnessed absence keeps the team open');
select pg_temp.as_user(1);
-- R12: the witness completes the last confirmation; the team closes and every access is revoked at once.
select is(public.witness_independent_absence('70000000-0000-0000-0000-000000000200',(pg_temp.flow()).result_version_id,
  gen_random_uuid())->>'phase','closed','Present counter witnesses the absence; R12: last confirmation closes the team');
select throws_ok($q$select public.read_team_count('70000000-0000-0000-0000-000000000200')$q$,'42501',null,'Closed team: access revoked');
reset role;
select is((select count(*) from public.team_memberships where team_id='70000000-0000-0000-0000-000000000200'
  and access_revoked_at is null),0::bigint,'R12: every membership revoked');
select isnt((pg_temp.flow()).closed_at,null,'R12: closing time recorded');
select results_eq($q$select m.display_name,c.kind,c.witness_user_id is not null from public.team_confirmations c
    join public.team_memberships m on m.id=c.membership_id join public.team_flows f on f.result_version_id=c.version_id
    order by m.display_order$q$,
  $q$values ('Ivy Independent','absence',true),('Anna Counter','pin',false),('Ben Counter','pin',false),('Carl Counter','absence',false)$q$,
  'Each confirmation keeps its modality, person and witness');
-- T44: nothing changes after closing, not even for privileged operations.
select throws_ok($q$update public.team_count_records set units=1 where brand_code='sig-1'$q$,'P0001','Team results are frozen','T44: counts immutable');
select throws_ok($q$update public.team_flows set phase='signing',revision=revision+1 where team_id='70000000-0000-0000-0000-000000000200'$q$,
  'P0001','Closed team is immutable','T44: team cannot reopen');
select throws_ok($q$delete from public.team_confirmations$q$,'P0001','Confirmations are append-only','T44: confirmations cannot be deleted');
select throws_ok($q$update public.team_confirmations set reason='x' where reason is not null$q$,'P0001','Confirmations are append-only',
  'T44: confirmations cannot be rewritten');
select throws_ok($q$delete from public.team_departures$q$,'P0001','Departures are append-only','Departures cannot be deleted');

select * from finish();
rollback;
