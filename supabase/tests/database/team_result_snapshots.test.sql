begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Storage fixtures intentionally do not claim reconciliation/signature UI coverage.
insert into auth.users(id,email)
select ('30000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'snapshot-'||n||'@example.invalid' from generate_series(1,5) n;
insert into public.app_user_access(user_id,access_kind) values('30000000-0000-0000-0000-000000000004','admin');
insert into public.warehouses(id,name) values('30000000-0000-0000-0000-000000000090','Snapshot Warehouse');
insert into public.inventory_items(brand_code,brand_name,bpu,pallet_size,weight_avg,brand_active,warehouse_id)
values('snapshot-a','Original label',20,5,10,true,'30000000-0000-0000-0000-000000000090'),
('snapshot-uncounted','Not counted',1,0,0,false,'30000000-0000-0000-0000-000000000090');
insert into public.item_bin_locations(brand_code,bin_location) values('snapshot-a','40B');
insert into public.count_sessions(id,warehouse_id) values('30000000-0000-0000-0000-000000000100','30000000-0000-0000-0000-000000000090');
insert into public.teams(id,session_id,team_name) values('30000000-0000-0000-0000-000000000200','30000000-0000-0000-0000-000000000100','Original team');
insert into public.team_flows(team_id) values('30000000-0000-0000-0000-000000000200');
insert into public.team_memberships(id,team_id,user_id,display_name,role,display_order) values
('30000000-0000-0000-0000-000000000301','30000000-0000-0000-0000-000000000200','30000000-0000-0000-0000-000000000001','First counter','counter',1),
('30000000-0000-0000-0000-000000000302','30000000-0000-0000-0000-000000000200','30000000-0000-0000-0000-000000000002','Second counter','counter',2),
('30000000-0000-0000-0000-000000000303','30000000-0000-0000-0000-000000000200','30000000-0000-0000-0000-000000000003','Independent','independent',0);
insert into public.team_count_slots(id,team_id,ordinal) values('30000000-0000-0000-0000-000000000401','30000000-0000-0000-0000-000000000200',1),('30000000-0000-0000-0000-000000000402','30000000-0000-0000-0000-000000000200',2);
insert into public.team_slot_assignments(id,team_id,slot_id,membership_id) values
('30000000-0000-0000-0000-000000000501','30000000-0000-0000-0000-000000000200','30000000-0000-0000-0000-000000000401','30000000-0000-0000-0000-000000000301'),('30000000-0000-0000-0000-000000000502','30000000-0000-0000-0000-000000000200','30000000-0000-0000-0000-000000000402','30000000-0000-0000-0000-000000000302');
update public.team_flows set phase='counting',revision=1 where team_id='30000000-0000-0000-0000-000000000200';
insert into public.team_count_records(team_id,assignment_id,slot_id,brand_code,cases,method,bpu_at_entry) values
('30000000-0000-0000-0000-000000000200','30000000-0000-0000-0000-000000000501','30000000-0000-0000-0000-000000000401','snapshot-a',10,'manual',20),
('30000000-0000-0000-0000-000000000200','30000000-0000-0000-0000-000000000502','30000000-0000-0000-0000-000000000402','snapshot-a',10,'weight',20);
select throws_ok($q$select private.build_team_result_snapshot('30000000-0000-0000-0000-000000000200',1,'30000000-0000-0000-0000-000000000303','[{"brand_code":"snapshot-a","quantity_units":200,"resolution":"reconciled","resolved_by":"30000000-0000-0000-0000-000000000303"}]'::jsonb)$q$,'P0001','Result snapshot requires current admin review','Cannot snapshot during counting');

update public.team_memberships set finish_state='requested' where team_id='30000000-0000-0000-0000-000000000200' and role='counter';
update public.team_memberships set finish_state='accepted' where team_id='30000000-0000-0000-0000-000000000200' and role='counter';
update public.team_flows set phase='reconciling',revision=2 where team_id='30000000-0000-0000-0000-000000000200';
update public.team_flows set phase='admin_review',revision=3 where team_id='30000000-0000-0000-0000-000000000200';
select throws_ok($q$update public.team_flows set phase='signing',revision=4 where team_id='30000000-0000-0000-0000-000000000200'$q$,'P0001','Signing requires a sealed current result version','Cannot enter signing without complete result');

select throws_ok($q$select private.build_team_result_snapshot('30000000-0000-0000-0000-000000000200',2,'30000000-0000-0000-0000-000000000303','[{"brand_code":"snapshot-a","quantity_units":200,"resolution":"reconciled","resolved_by":"30000000-0000-0000-0000-000000000303"}]'::jsonb)$q$,'P0001','Result snapshot requires current admin review','Stale result revision rejected');

select throws_ok($q$select private.build_team_result_snapshot('30000000-0000-0000-0000-000000000200',3,'30000000-0000-0000-0000-000000000303','[]'::jsonb)$q$,'P0001','Result snapshot must contain exactly the counted products','Omitted counted product rejects whole snapshot');

select is((select count(*) from public.team_result_versions),0::bigint,'Failed builder leaves no partial version');
select throws_ok($q$select private.build_team_result_snapshot('30000000-0000-0000-0000-000000000200',3,'30000000-0000-0000-0000-000000000303','[{"brand_code":"snapshot-a","quantity_units":200,"resolution":"reconciled","resolved_by":"30000000-0000-0000-0000-000000000303"},{"brand_code":"snapshot-uncounted","quantity_units":0,"resolution":"reconciled","resolved_by":"30000000-0000-0000-0000-000000000303"}]'::jsonb)$q$,'P0001','Result product was not counted by this team','Uncounted product cannot be invented in team result');

select throws_ok($q$select private.build_team_result_snapshot('30000000-0000-0000-0000-000000000200',3,'30000000-0000-0000-0000-000000000303','[{"brand_code":"snapshot-a","quantity_units":200,"resolution":"reconciled","resolved_by":"30000000-0000-0000-0000-000000000301"}]'::jsonb)$q$,'P0001','Only independent can be attributed a reconciliation','Regular counter cannot be labelled reconciler');

select lives_ok($q$select private.build_team_result_snapshot('30000000-0000-0000-0000-000000000200',3,'30000000-0000-0000-0000-000000000303','[{"brand_code":"snapshot-a","quantity_units":200,"resolution":"reconciled","resolved_by":"30000000-0000-0000-0000-000000000303"}]'::jsonb)$q$,'Complete result version can be built internally');
select is((select bpu from public.team_result_items),20,'BPU copied by database');
select is((select final_cases from public.team_result_items),10::bigint,'Official cases use copied BPU');
select is((select jsonb_array_length(source_counts) from public.team_result_items),2,'Both original sources are retained, not summed');
select is((select jsonb_array_length(participants) from public.team_result_versions),3,'All variable participants retained');
select is((select participants->0->>'role' from public.team_result_versions),'independent','Preserved participant order starts with independent');
select throws_ok($q$update public.team_result_items set quantity_units=1$q$,'P0001','Result items are immutable','Cannot rewrite official quantity');

select throws_ok($q$delete from public.team_result_items$q$,'P0001','Result items are immutable','Cannot erase official item');

select throws_ok($q$update public.team_result_versions set team_name='Changed'$q$,'P0001','Result version is immutable','Cannot rewrite sealed header');

select throws_ok($q$delete from public.team_result_versions$q$,'P0001','Result versions cannot be deleted','Cannot erase result version');

select throws_ok($q$insert into public.team_result_items(version_id,team_id,brand_code,quantity_units,resolution,resolved_by)
select id,team_id,'snapshot-a',1,'reconciled','30000000-0000-0000-0000-000000000303' from public.team_result_versions$q$,'P0001','Sealed result cannot receive more products','Cannot append to sealed version');

-- Catalog changes do not rewrite the preserved report.
update public.inventory_items set brand_name='New label',brand_active=false,category='Changed category' where brand_code='snapshot-a';
update public.warehouses set name='Renamed warehouse' where id='30000000-0000-0000-0000-000000000090';
update public.teams set team_name='Renamed team' where id='30000000-0000-0000-0000-000000000200';
update public.item_bin_locations set bin_location='99Z' where brand_code='snapshot-a';
select is((select brand_name from public.team_result_items),'Original label','T49: item label preserved');
select is((select brand_active from public.team_result_items),true,'T49: item status preserved');
select is((select bin_locations->>0 from public.team_result_items),'40B','Original location preserved');
select is((select warehouse_name from public.team_result_versions),'Snapshot Warehouse','Warehouse label preserved');
select is((select team_name from public.team_result_versions),'Original team','Team label preserved');
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select is((select count(*) from public.team_result_items),0::bigint,'Snapshot does not leak another counter result');
select throws_ok($q$select private.build_team_result_snapshot('30000000-0000-0000-0000-000000000200',3,'30000000-0000-0000-0000-000000000303','[{"brand_code":"snapshot-a","quantity_units":200,"resolution":"reconciled","resolved_by":"30000000-0000-0000-0000-000000000303"}]'::jsonb)$q$,'42501',null,'Client cannot invoke internal builder');

select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000003',true);
select is((select count(*) from public.team_result_items),1::bigint,'Independent monitors preserved results');
select throws_ok($q$update public.team_result_items set quantity_units=1$q$,'42501',null,'Independent has no direct snapshot writes');

select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000005',true);
select is((select count(*) from public.team_result_versions),0::bigint,'Unrelated identity sees no snapshot');
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000004',true);
select is((select count(*) from public.team_result_items),1::bigint,'Protected admin reads result');
select throws_ok($q$select private.build_team_result_snapshot('30000000-0000-0000-0000-000000000200',3,'30000000-0000-0000-0000-000000000303','[{"brand_code":"snapshot-a","quantity_units":200,"resolution":"reconciled","resolved_by":"30000000-0000-0000-0000-000000000303"}]'::jsonb)$q$,'42501',null,'Admin cannot invoke quantity snapshot builder');

reset role;
set local role service_role;
select throws_ok($q$select private.build_team_result_snapshot('30000000-0000-0000-0000-000000000200',3,'30000000-0000-0000-0000-000000000303','[{"brand_code":"snapshot-a","quantity_units":200,"resolution":"reconciled","resolved_by":"30000000-0000-0000-0000-000000000303"}]'::jsonb)$q$,'42501',null,'Service role has no unchecked builder permission');

select throws_ok($q$update public.team_result_items set quantity_units=1$q$,'42501',null,'Service role has no direct snapshot writes');

reset role;
set local role anon;
select throws_ok($q$select * from public.team_result_items$q$,'42501',null,'Anonymous cannot read result');

reset role;
update public.team_flows set phase='signing',revision=4,
 result_version_id=(select id from public.team_result_versions where source_revision=3) where team_id='30000000-0000-0000-0000-000000000200';
-- Cancellation before first confirmation preserves old version but releases pointer.
update public.team_flows set phase='admin_review',revision=5,result_version_id=null where team_id='30000000-0000-0000-0000-000000000200';
select throws_ok($q$update public.team_flows set phase='signing',revision=6,result_version_id=(select id from public.team_result_versions where source_revision=3) where team_id='30000000-0000-0000-0000-000000000200'$q$,'P0001','Signing requires a sealed current result version','Cannot sign a superseded review version');

select lives_ok($q$select private.build_team_result_snapshot('30000000-0000-0000-0000-000000000200',5,'30000000-0000-0000-0000-000000000303','[{"brand_code":"snapshot-a","quantity_units":240,"resolution":"reconciled","resolved_by":"30000000-0000-0000-0000-000000000303"}]'::jsonb)$q$,'New review creates another immutable version');
select is((select quantity_units from public.team_result_items i join public.team_result_versions v on v.id=i.version_id where v.source_revision=3),200::bigint,'Older official version retained');
select is((select quantity_units from public.team_result_items i join public.team_result_versions v on v.id=i.version_id where v.source_revision=5),240::bigint,'New official version stored separately');
update public.team_flows set phase='signing',revision=6,
 result_version_id=(select id from public.team_result_versions where source_revision=5) where team_id='30000000-0000-0000-0000-000000000200';
update public.team_flows set frozen_at=now(),revision=7 where team_id='30000000-0000-0000-0000-000000000200';
select throws_ok($q$update public.team_flows set result_version_id=(select id from public.team_result_versions where source_revision=3),revision=8 where team_id='30000000-0000-0000-0000-000000000200'$q$,'P0001','Selected result version cannot change','First confirmation prevents switching result version');

update public.team_flows set phase='closed',closed_at=now(),revision=8 where team_id='30000000-0000-0000-0000-000000000200';
select throws_ok($q$update public.team_result_items set bpu=24$q$,'P0001','Result items are immutable','Signed BPU cannot be edited');

set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000003',true);
select is((select count(*) from public.team_result_items),0::bigint,'Closed team access includes result snapshots');
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000004',true);
select is((select count(*) from public.team_result_items),2::bigint,'Admin retains both immutable versions');
reset role;
select * from finish();
rollback;
