begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Synthetic fixtures only. Inventory is read once per screen; counts stay blind.
insert into auth.users(id,email) select ('30000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  'inv-read-'||n||'@example.invalid' from generate_series(1,5) n;
insert into public.app_user_access(user_id,access_kind) values('30000000-0000-0000-0000-000000000004','admin');
insert into public.warehouses(id,name) values
('30000000-0000-0000-0000-000000000900','Inventory read A'),('30000000-0000-0000-0000-000000000901','Inventory read B');
insert into public.inventory_items(brand_code,brand_name,bpu,pallet_size,weight_avg,warehouse_id,brand_active) values
('invread-a1','Read A1',10,5,100,'30000000-0000-0000-0000-000000000900',true),
('invread-a2','Read A2',1,0,0,'30000000-0000-0000-0000-000000000900',false),
('invread-b1','Read B1',10,5,100,'30000000-0000-0000-0000-000000000901',true);
insert into public.item_bin_locations(brand_code,bin_location) values('invread-a1','40B'),('invread-a1','10A');
insert into public.count_sessions(id,warehouse_id,box_tare_g) values('30000000-0000-0000-0000-000000000100','30000000-0000-0000-0000-000000000900',250);
insert into public.teams(id,session_id,team_name) values('30000000-0000-0000-0000-000000000200','30000000-0000-0000-0000-000000000100','Read team');
insert into public.team_flows(team_id) values('30000000-0000-0000-0000-000000000200');
insert into public.team_memberships(id,team_id,user_id,display_name,role,display_order) values
('30000000-0000-0000-0000-000000000301','30000000-0000-0000-0000-000000000200','30000000-0000-0000-0000-000000000001','Counter A','counter',1),
('30000000-0000-0000-0000-000000000302','30000000-0000-0000-0000-000000000200','30000000-0000-0000-0000-000000000002','Counter B','counter',2),
('30000000-0000-0000-0000-000000000303','30000000-0000-0000-0000-000000000200','30000000-0000-0000-0000-000000000003','Independent','independent',0);
insert into public.team_count_slots(id,team_id,ordinal) values
('30000000-0000-0000-0000-000000000401','30000000-0000-0000-0000-000000000200',1),('30000000-0000-0000-0000-000000000402','30000000-0000-0000-0000-000000000200',2);
insert into public.team_slot_assignments(id,team_id,slot_id,membership_id) values
('30000000-0000-0000-0000-000000000501','30000000-0000-0000-0000-000000000200','30000000-0000-0000-0000-000000000401','30000000-0000-0000-0000-000000000301'),
('30000000-0000-0000-0000-000000000502','30000000-0000-0000-0000-000000000200','30000000-0000-0000-0000-000000000402','30000000-0000-0000-0000-000000000302');
update public.team_flows set phase='counting',revision=1 where team_id='30000000-0000-0000-0000-000000000200';
insert into public.team_count_records(team_id,assignment_id,slot_id,brand_code,cases,units,bpu_at_entry,method) values
('30000000-0000-0000-0000-000000000200','30000000-0000-0000-0000-000000000501','30000000-0000-0000-0000-000000000401','invread-a1',2,3,10,'manual'),
('30000000-0000-0000-0000-000000000200','30000000-0000-0000-0000-000000000502','30000000-0000-0000-0000-000000000402','invread-a1',1,0,10,'manual');

set local role anon;
select throws_ok($q$select public.read_team_inventory('30000000-0000-0000-0000-000000000200')$q$,'42501',null,'Anonymous cannot read team inventory');
reset role;
set local role authenticated;

select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000005',true);
select throws_ok($q$select public.read_team_inventory('30000000-0000-0000-0000-000000000200')$q$,'42501','Team access unavailable','Outsider cannot read team inventory');

select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select is((select jsonb_agg(x->>'brand_code' order by x->>'brand_code') from jsonb_array_elements(public.read_team_inventory('30000000-0000-0000-0000-000000000200')) x),
  '["invread-a1","invread-a2"]'::jsonb,'Counter reads only the session warehouse, active and inactive');
select is((select x from jsonb_array_elements(public.read_team_inventory('30000000-0000-0000-0000-000000000200')) x where x->>'brand_code'='invread-a1'),
  '{"brand_code":"invread-a1","brand_name":"Read A1","brand_active":true,"bpu":10,"pallet_size":5,"weight_avg":100,"box_tare_g":250,"bins":["10A","40B"]}'::jsonb,
  'Inventory carries the fields the count form needs');
select ok(not (public.read_team_count('30000000-0000-0000-0000-000000000200') ? 'items'),'Team state no longer resends the inventory');
select is(jsonb_array_length(public.read_team_count('30000000-0000-0000-0000-000000000200')->'records'),1,'Counter still sees only own records');
select is(public.read_team_count('30000000-0000-0000-0000-000000000200')->>'warehouseName','Inventory read A','Team state keeps the warehouse name');

select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000003',true);
select is(jsonb_array_length(public.read_team_count('30000000-0000-0000-0000-000000000200')->'records'),2,'Independent monitors every counter');
select is(jsonb_array_length(public.read_team_inventory('30000000-0000-0000-0000-000000000200')),2,'Independent consults the same inventory');

select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000004',true);
select is(jsonb_array_length(public.read_team_inventory('30000000-0000-0000-0000-000000000200')),2,'Admin monitor reads the inventory');

reset role;
update public.team_memberships set access_revoked_at=clock_timestamp() where id='30000000-0000-0000-0000-000000000301';
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select throws_ok($q$select public.read_team_inventory('30000000-0000-0000-0000-000000000200')$q$,'42501','Team access unavailable','Revoked counter loses inventory access');

select * from finish();
rollback;
