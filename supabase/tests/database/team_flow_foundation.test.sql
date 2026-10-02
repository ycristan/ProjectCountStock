begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- All identities and stock are synthetic; transaction is rolled back.
insert into auth.users(id,email,raw_user_meta_data)
select ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 'foundation-'||n||'@example.invalid', case when n=7 then '{"role":"admin"}'::jsonb else '{}'::jsonb end
from generate_series(1,7) n;
insert into public.app_user_access(user_id,access_kind) values('10000000-0000-0000-0000-000000000006','admin');
insert into public.warehouses(id,name) values('10000000-0000-0000-0000-000000000090','Foundation Other');
insert into public.inventory_items(brand_code,brand_name,bpu,pallet_size) values
('foundation-a','Synthetic A',20,0),('foundation-b','Synthetic B',1,0);
insert into public.inventory_items(brand_code,brand_name,bpu,pallet_size,warehouse_id)
values('foundation-other','Other warehouse',10,0,'10000000-0000-0000-0000-000000000090');
insert into public.count_sessions(id) values('10000000-0000-0000-0000-000000000100'),('10000000-0000-0000-0000-000000000101');
insert into public.teams(id,session_id,team_name) values
('10000000-0000-0000-0000-000000000200','10000000-0000-0000-0000-000000000100','A'),('10000000-0000-0000-0000-000000000201','10000000-0000-0000-0000-000000000101','B'),('10000000-0000-0000-0000-000000000202','10000000-0000-0000-0000-000000000101','Legacy');
insert into public.counter_accounts(team_id,auth_user_id,role,username)
values('10000000-0000-0000-0000-000000000202','10000000-0000-0000-0000-000000000007','contador_1','foundation-legacy');
insert into public.team_flows(team_id) values('10000000-0000-0000-0000-000000000200'),('10000000-0000-0000-0000-000000000201');
select throws_ok($q$insert into public.team_flows(team_id) values('10000000-0000-0000-0000-000000000202')$q$,'P0001','Legacy or closed team cannot be activated silently','T53: no silent legacy activation');
select throws_ok($q$update public.team_flows set phase='closed',revision=1,closed_at=now(),frozen_at=now() where team_id='10000000-0000-0000-0000-000000000200'$q$,'P0001','Invalid team phase transition','Cannot skip directly to closed');
select throws_ok($q$update public.team_flows set phase='counting',revision=1 where team_id='10000000-0000-0000-0000-000000000200'$q$,'P0001','Team requires independent and assigned counting positions','Cannot start incomplete team');
insert into public.team_memberships(id,team_id,user_id,display_name,role,display_order) values
('10000000-0000-0000-0000-000000000301','10000000-0000-0000-0000-000000000200','10000000-0000-0000-0000-000000000001','Counter 1','counter',1),
('10000000-0000-0000-0000-000000000302','10000000-0000-0000-0000-000000000200','10000000-0000-0000-0000-000000000002','Counter 2','counter',2),
('10000000-0000-0000-0000-000000000303','10000000-0000-0000-0000-000000000200','10000000-0000-0000-0000-000000000003','Independent','independent',0),
('10000000-0000-0000-0000-000000000304','10000000-0000-0000-0000-000000000200','10000000-0000-0000-0000-000000000004','Counter 3','counter',3),
('10000000-0000-0000-0000-000000000305','10000000-0000-0000-0000-000000000200','10000000-0000-0000-0000-000000000005','Counter 4','counter',4),
('10000000-0000-0000-0000-000000000313','10000000-0000-0000-0000-000000000201','10000000-0000-0000-0000-000000000003','Independent','independent',0);
insert into public.team_count_slots(id,team_id,ordinal)
select ('10000000-0000-0000-0000-'||lpad((400+n)::text,12,'0'))::uuid,'10000000-0000-0000-0000-000000000200',n from generate_series(1,4) n;
insert into public.team_slot_assignments(id,team_id,slot_id,membership_id)
select ('10000000-0000-0000-0000-'||lpad((500+n)::text,12,'0'))::uuid,'10000000-0000-0000-0000-000000000200',
('10000000-0000-0000-0000-'||lpad((400+n)::text,12,'0'))::uuid,
('10000000-0000-0000-0000-'||lpad((case when n<=2 then 300+n else 301+n end)::text,12,'0'))::uuid
from generate_series(1,4) n;
select is((select count(*) from public.team_memberships where team_id='10000000-0000-0000-0000-000000000200'),5::bigint, 'T01: five participants without fixed role columns');
select throws_ok($q$insert into public.team_memberships(team_id,user_id,display_name,role,display_order) values('10000000-0000-0000-0000-000000000200','10000000-0000-0000-0000-000000000007','Second independent','independent',5)$q$,'23505',null,'Only one active independent per team');
select throws_ok($q$insert into public.team_slot_assignments(team_id,slot_id,membership_id) values('10000000-0000-0000-0000-000000000200','10000000-0000-0000-0000-000000000401','10000000-0000-0000-0000-000000000303')$q$,'P0001','Assignment requires an active counter','T05: independent cannot receive ordinary counting assignment');
select throws_ok($q$insert into public.team_slot_assignments(team_id,slot_id,membership_id) values('10000000-0000-0000-0000-000000000201','10000000-0000-0000-0000-000000000401','10000000-0000-0000-0000-000000000313')$q$,'P0001','Assignment requires an active counter','Cannot cross team assignment boundaries');
update public.team_flows set phase='counting',revision=1 where team_id='10000000-0000-0000-0000-000000000200';
insert into public.team_count_records(id,team_id,assignment_id,slot_id,brand_code,units,method,bpu_at_entry) values
('10000000-0000-0000-0000-000000000601','10000000-0000-0000-0000-000000000200','10000000-0000-0000-0000-000000000501','10000000-0000-0000-0000-000000000401','foundation-a',10,'manual',20),
('10000000-0000-0000-0000-000000000602','10000000-0000-0000-0000-000000000200','10000000-0000-0000-0000-000000000502','10000000-0000-0000-0000-000000000402','foundation-a',12,'weight',20);
select throws_ok($q$insert into public.team_count_records(team_id,assignment_id,slot_id,brand_code,units,method,bpu_at_entry) values('10000000-0000-0000-0000-000000000200','10000000-0000-0000-0000-000000000501','10000000-0000-0000-0000-000000000401','foundation-other',1,'manual',10)$q$,'P0001','Product does not belong to team warehouse','T03: cross warehouse count denied');
select throws_ok($q$insert into public.team_count_records(team_id,assignment_id,slot_id,brand_code,units,method,bpu_at_entry) values('10000000-0000-0000-0000-000000000200','10000000-0000-0000-0000-000000000501','10000000-0000-0000-0000-000000000402','foundation-b',0,'manual',1)$q$,'P0001','Counting position does not match author assignment','Count cannot claim another position');
update public.team_count_records set units=11,revision=1 where id='10000000-0000-0000-0000-000000000601';
select is((select quantity_units from public.team_count_record_history where record_id='10000000-0000-0000-0000-000000000601'),10::bigint, 'Earlier quantity preserved');
select throws_ok($q$update public.team_count_records set assignment_id='10000000-0000-0000-0000-000000000502',slot_id='10000000-0000-0000-0000-000000000402',revision=2 where id='10000000-0000-0000-0000-000000000601'$q$,'P0001','Count authorship cannot change','Original author cannot be reassigned');
select throws_ok($q$update public.team_count_record_history set units=0 where record_id='10000000-0000-0000-0000-000000000601'$q$,'P0001','Count history is append-only','T44: prior revision cannot be overwritten');
select throws_ok($q$delete from public.team_count_records where id='10000000-0000-0000-0000-000000000601'$q$,'P0001','Team flow records cannot be deleted','Counts cannot be erased');
select throws_ok($q$insert into public.count_entries(team_id,counter_role,brand_code) values('10000000-0000-0000-0000-000000000200','contador_1','foundation-a')$q$,'P0001','Legacy writes cannot change a versioned team','Old count route cannot bypass new model');
select throws_ok($q$update public.count_sessions set status='fechada' where id='10000000-0000-0000-0000-000000000100'$q$,'P0001','Use the versioned team session workflow','Old session closing cannot bypass new flow');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select is((select count(*) from public.team_count_records),1::bigint, 'T04: counter reads only own count');
select is((select count(*) from public.team_flows),1::bigint, 'Participant sees only own team');
select is(jsonb_array_length(public.my_team_flow_contexts()),1,'Identity: one context for ordinary counter');
select is(public.my_team_flow_contexts()->0->>'role','counter','Identity: protected counter role');
select is(public.my_team_flow_contexts()->0->>'membershipId','10000000-0000-0000-0000-000000000301','Identity: authenticated person maps to own membership');
select is(jsonb_array_length(public.my_team_flow_contexts('10000000-0000-0000-0000-000000000201')),0,'Identity: cannot select unrelated team');
select is((select count(*) from public.team_count_record_history),1::bigint, 'Own prior revision remains readable');
select throws_ok($q$update public.team_count_records set units=99$q$,'42501',null,'Direct client writes forbidden');
select throws_ok($q$update public.team_memberships set finish_state='accepted'$q$,'42501',null,'Cannot self approve through table');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select is((select count(*) from public.team_count_record_history),0::bigint, 'T04: other counter history remains blind');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select is((select count(*) from public.team_flows),2::bigint, 'T31: independent can have two scoped memberships');
select is((select count(*) from public.team_count_records),2::bigint, 'Independent monitors all team counts');
select is(jsonb_array_length(public.my_team_flow_contexts()),2,'Identity: shared independent receives both contexts');
select is(public.my_team_flow_contexts('10000000-0000-0000-0000-000000000201')->0->>'teamId','10000000-0000-0000-0000-000000000201','Identity: explicit team context retained');
select is(public.my_team_flow_contexts('10000000-0000-0000-0000-000000000200')->0->>'revision','1','Identity: revision returned without numeric truncation');
select throws_ok($q$insert into public.team_count_records(team_id,assignment_id,slot_id,brand_code,units,method,bpu_at_entry) values('10000000-0000-0000-0000-000000000200','10000000-0000-0000-0000-000000000501','10000000-0000-0000-0000-000000000401','foundation-b',1,'manual',1)$q$,'42501',null,'Independent cannot write directly');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000007',true);
select is((select count(*) from public.team_flows),0::bigint, 'Editable metadata cannot grant access');
select is(jsonb_array_length(public.my_team_flow_contexts()),0,'Identity: forged role does not create memberships');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000006',true);
select is((select count(*) from public.team_count_records),2::bigint, 'Protected admin monitors records');
select is(jsonb_array_length(public.my_team_flow_contexts()),0,'Identity: admin monitoring is not counter participation');
select throws_ok($q$update public.team_count_records set units=1$q$,'42501',null,'Admin has no quantity write grant');
reset role;
set local role service_role;
select throws_ok($q$update public.team_count_records set units=1$q$,'42501',null,'No service-role direct write bypass exposed by foundation');
select throws_ok($q$select public.my_team_flow_contexts()$q$,'42501',null,'Identity: service credential cannot impersonate current participant');
reset role;
set local role anon;
select throws_ok($q$select * from public.team_count_records$q$,'42501',null,'Anonymous cannot read counts');
select throws_ok($q$select public.my_team_flow_contexts()$q$,'42501',null,'Identity: anonymous lookup denied');
reset role;
update public.team_memberships set finish_state='requested' where id='10000000-0000-0000-0000-000000000301';
select throws_ok($q$update public.team_count_records set units=12,revision=2 where id='10000000-0000-0000-0000-000000000601'$q$,'P0001','Participant cannot count now','T06: request immediately blocks edits at DB');
update public.team_memberships set finish_state='counting' where id='10000000-0000-0000-0000-000000000301';
update public.team_count_records set units=12,revision=2 where id='10000000-0000-0000-0000-000000000601';
select is((select revision from public.team_count_records where id='10000000-0000-0000-0000-000000000601'),2::bigint, 'T07: rejected request allows edits again');
-- Storage-level proof only: does NOT expose/approve a BPU-correction command.
update public.team_count_records set cases=20,units=0,revision=3 where id='10000000-0000-0000-0000-000000000601';
select is((select quantity_units from public.team_count_records where id='10000000-0000-0000-0000-000000000601'),400::bigint,'Original cases retained as 20 times BPU 20');
update public.team_count_records set bpu_at_entry=24,revision=4 where id='10000000-0000-0000-0000-000000000601';
select is((select quantity_units from public.team_count_records where id='10000000-0000-0000-0000-000000000601'),480::bigint,'Physical cases allow approved future recalculation without recount');
select is((select cases from public.team_count_record_history where record_id='10000000-0000-0000-0000-000000000601' and revision=3),20,'Historical physical cases preserved');
select throws_ok($q$update public.team_memberships set finish_state='accepted' where id='10000000-0000-0000-0000-000000000302'$q$,'P0001','Invalid individual finish transition','Cannot accept without request');
select throws_ok($q$update public.team_flows set phase='reconciling',revision=2 where team_id='10000000-0000-0000-0000-000000000200'$q$,'P0001','All required individual finishes must be accepted','T08: premature reconciliation blocked');
update public.team_memberships set finish_state='requested' where team_id='10000000-0000-0000-0000-000000000200' and role='counter';
update public.team_memberships set finish_state='accepted' where team_id='10000000-0000-0000-0000-000000000200' and role='counter';
update public.team_flows set phase='reconciling',revision=2 where team_id='10000000-0000-0000-0000-000000000200';
update public.team_flows set phase='admin_review',revision=3 where team_id='10000000-0000-0000-0000-000000000200';
-- Synthetic resolved result fixture, not a reconciliation UI/authorization test.
update public.team_flows set result_version_id=private.build_team_result_snapshot(
 '10000000-0000-0000-0000-000000000200',3,'10000000-0000-0000-0000-000000000303',
 '[{"brand_code":"foundation-a","quantity_units":480,"resolution":"reconciled","resolved_by":"10000000-0000-0000-0000-000000000303"}]'::jsonb),
 phase='signing',revision=4 where team_id='10000000-0000-0000-0000-000000000200';
update public.team_flows set phase='admin_review',result_version_id=null,revision=5 where team_id='10000000-0000-0000-0000-000000000200';
select is((select phase from public.team_flows where team_id='10000000-0000-0000-0000-000000000200'),'admin_review', 'T37: cancel collection before freeze');
-- Synthetic resolved result fixture, not a reconciliation UI/authorization test.
update public.team_flows set result_version_id=private.build_team_result_snapshot(
 '10000000-0000-0000-0000-000000000200',5,'10000000-0000-0000-0000-000000000303',
 '[{"brand_code":"foundation-a","quantity_units":480,"resolution":"reconciled","resolved_by":"10000000-0000-0000-0000-000000000303"}]'::jsonb),
 phase='signing',revision=6 where team_id='10000000-0000-0000-0000-000000000200';
update public.team_flows set frozen_at=now(),revision=7 where team_id='10000000-0000-0000-0000-000000000200';
select throws_ok($q$update public.team_flows set phase='admin_review',frozen_at=null,revision=8 where team_id='10000000-0000-0000-0000-000000000200'$q$,'P0001','First confirmation cannot be undone','T38: frozen results cannot reopen');
select throws_ok($q$update public.team_count_records set units=99,revision=3 where id='10000000-0000-0000-0000-000000000601'$q$,'P0001','Team results are frozen','T44: privileged quantity edits blocked when frozen');
select throws_ok($q$update public.team_memberships set display_name='Changed' where id='10000000-0000-0000-0000-000000000301'$q$,'P0001','Team results are frozen','Signed attribution cannot change');
update public.team_flows set phase='closed',closed_at=now(),revision=8 where team_id='10000000-0000-0000-0000-000000000200';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select is((select count(*) from public.team_flows),1::bigint, 'T33: closing A preserves independent access to B');
select is(jsonb_array_length(public.my_team_flow_contexts()),1,'Identity: closing A preserves shared independent B context');
select is(jsonb_array_length(public.my_team_flow_contexts('10000000-0000-0000-0000-000000000200')),0,'Identity: closed context unavailable even with old identity');
select is((select count(*) from public.team_count_records),0::bigint, 'T45: old identity can no longer read closed A counts');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000006',true);
select is((select count(*) from public.team_count_records),2::bigint, 'Admin retains historical read access');
reset role;
select throws_ok($q$update public.team_flows set revision=9 where team_id='10000000-0000-0000-0000-000000000200'$q$,'P0001','Closed team is immutable','Closed flow metadata immutable');
select throws_ok($q$delete from public.teams where id='10000000-0000-0000-0000-000000000200'$q$,'23503',null,'Parent deletion cannot cascade away team');
select throws_ok($q$delete from auth.users where id='10000000-0000-0000-0000-000000000001'$q$,'23503',null,'Auth deletion cannot erase participant attribution');
select * from finish();
rollback;
