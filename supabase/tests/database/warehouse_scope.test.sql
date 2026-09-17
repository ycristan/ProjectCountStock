begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,raw_user_meta_data) values
('00000000-0000-0000-0000-000000000901','scope-admin@example.invalid','{}'),
('00000000-0000-0000-0000-000000000902','scope-counter@example.invalid','{}'),
('00000000-0000-0000-0000-000000000903','scope-intruder@example.invalid','{"role":"admin"}');
insert into public.app_user_access(user_id,access_kind) values
('00000000-0000-0000-0000-000000000901','admin'),
('00000000-0000-0000-0000-000000000902','team_counter');
insert into public.warehouses(id,name) values ('00000000-0000-0000-0000-000000000910','Scope Service');
insert into public.inventory_items(brand_code,brand_name,bpu,pallet_size,brand_active,warehouse_id) values
('scope-main','Main product',1,0,false,(select id from public.warehouses where name='Main')),
('scope-service','Service product',1,0,true,'00000000-0000-0000-0000-000000000910');
insert into public.item_bin_locations(brand_code,bin_location) values ('scope-main','40B'),('scope-service','40B');
insert into public.count_sessions(id,warehouse_id) values
('00000000-0000-0000-0000-000000000911',(select id from public.warehouses where name='Main'));
insert into public.teams(id,session_id,team_name) values
('00000000-0000-0000-0000-000000000912','00000000-0000-0000-0000-000000000911','Scope team');
insert into public.counter_accounts(auth_user_id,team_id,role,username) values
('00000000-0000-0000-0000-000000000902','00000000-0000-0000-0000-000000000912','contador_1','scope-counter');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000902',true);
select results_eq($$select brand_code from public.inventory_items where brand_code like 'scope-%' order by brand_code$$,
$$values ('scope-main'::text)$$,'Counter sees only assigned warehouse, including inactive product');
select results_eq($$select brand_code from public.item_bin_locations where bin_location='40B' and brand_code like 'scope-%'$$,
$$values ('scope-main'::text)$$,'Identical BIN in another warehouse never leaks');
select lives_ok($$insert into public.count_entries(team_id,counter_role,brand_code,pallets,cases,units,final_cases,final_units)
values ('00000000-0000-0000-0000-000000000912','contador_1','scope-main',0,0,2,2,0)$$,
'Inactive item remains countable in own warehouse');
select throws_ok($$insert into public.count_entries(team_id,counter_role,brand_code,pallets,cases,units,final_cases,final_units)
values ('00000000-0000-0000-0000-000000000912','contador_1','scope-service',0,0,2,2,0)$$,
'P0001','Product does not belong to the session warehouse','Direct API cannot count another warehouse');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000903',true);
select is((select count(*) from public.inventory_items where brand_code like 'scope-%'),0::bigint,'Spoofed admin has no inventory scope');
select throws_ok($$select public.create_warehouse_solo_session('Bad','00000000-0000-0000-0000-000000000910',false,false,'{}',300)$$,
'P0001','Unauthorized','Solo session RPC verifies protected admin access');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000901',true);
select throws_ok($$select public.create_warehouse_solo_session('Atomic failure','00000000-0000-0000-0000-000000000910',true,true,array['scope-main'],300)$$,
'P0001','Product does not belong to the session warehouse','Wrong-warehouse restricted list rejected');
select is((select count(*) from public.solo_sessions where title='Atomic failure'),0::bigint,'Invalid list leaves no orphan session');
select lives_ok($$select public.create_warehouse_solo_session('Scope solo','00000000-0000-0000-0000-000000000910',true,true,array['scope-service'],300)$$,
'Valid scoped solo session and list created together');
select lives_ok($$select public.create_warehouse_solo_session('Scope free','00000000-0000-0000-0000-000000000910',true,false,'{}',300)$$,
'Unrestricted solo remains scoped to warehouse');
select throws_ok($$insert into public.solo_entries(session_id,brand_code,units)
select id,'scope-main',1 from public.solo_sessions where title='Scope free'$$,
'P0001','Product does not belong to the session warehouse','Admin solo entry also checks warehouse');
select throws_ok($$insert into public.solo_session_items(session_id,brand_code)
select id,'scope-main' from public.solo_sessions where title='Scope solo'$$,
'P0001','Product does not belong to the session warehouse','Restricted list cannot include another warehouse');

reset role;
update public.teams set status='reconciliada' where id='00000000-0000-0000-0000-000000000912';
set local role service_role;
select lives_ok($$select public.combine_session_results('00000000-0000-0000-0000-000000000911')$$,'Combine own warehouse');
select is((select count(*) from public.combined_results where session_id='00000000-0000-0000-0000-000000000911' and brand_code='scope-service'),0::bigint,
'Combined report never includes another warehouse as zero-count inventory');
select is((select count(*) from public.combined_results where session_id='00000000-0000-0000-0000-000000000911' and brand_code='scope-main'),1::bigint,
'Combined report includes own inactive inventory');
select throws_ok($$select public.combine_session_results('00000000-0000-0000-0000-000000000911')$$,
'P0001','Session closed or unavailable','Closed combined results cannot be recalculated');
reset role;
select * from finish();
rollback;
