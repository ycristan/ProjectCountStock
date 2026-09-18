begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-000000000801', 'wh-admin@example.invalid', '{}'),
 ('00000000-0000-0000-0000-000000000802', 'wh-not-admin@example.invalid', '{"role":"admin"}');
insert into public.app_user_access(user_id, access_kind) values
 ('00000000-0000-0000-0000-000000000801', 'admin');

create function pg_temp.import_item(code text, bpu integer default 24, active boolean default true,
 bins jsonb default '["40B"]', pallet integer default 0, weight numeric default 0)
returns jsonb language sql as $$
 select jsonb_build_object('brand_code', code, 'brand_name', 'Test ' || code,
 'category', 'Drinks', 'category1', 'Cans', 'bpu', bpu, 'brand_active', active,
 'bins', bins, 'pallet_size', pallet, 'weight_avg', weight);
$$;
-- Inject a failure AFTER inventory upsert, to prove the whole RPC rolls back.
create function pg_temp.fail_import_bin() returns trigger language plpgsql as $$
begin
 if new.bin_location = 'FAIL_BIN' then raise exception 'Synthetic BIN failure'; end if;
 return new;
end;
$$;
create trigger test_fail_import_bin before insert on public.item_bin_locations
for each row execute function pg_temp.fail_import_bin();

select has_table('public', 'warehouses', 'Dynamic warehouse registry exists');
select ok(has_function_privilege('authenticated',
 'public.import_warehouse_inventory(text,jsonb,boolean)', 'execute'),
 'Authenticated import is exposed only with protected admin check and warehouse scoping');
select ok(not has_function_privilege('anon',
 'public.import_warehouse_inventory(text,jsonb,boolean)', 'execute'), 'No anonymous import permission');
select ok(not has_table_privilege('anon', 'public.warehouses', 'select'), 'No anonymous warehouse listing');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000801', true);

select throws_ok($$select public.import_warehouse_inventory('Main','[]')$$,
 'P0001', 'An empty import is not allowed', 'Empty import cannot deactivate everything');
select throws_ok($$select public.import_warehouse_inventory('Main','{}')$$,
 'P0001', 'Items must be an array', 'Wrong payload shape rejected');
select throws_ok($$select public.import_warehouse_inventory('Service',jsonb_build_array(pg_temp.import_item('s')))$$,
 'P0001', 'New warehouse requires explicit administrator confirmation', 'Unknown warehouse needs confirmation');
select is((select count(*) from public.warehouses), 1::bigint, 'Unconfirmed warehouse not created');

select lives_ok($$select public.import_warehouse_inventory('Service',jsonb_build_array(pg_temp.import_item('s')),true)$$,
 'Confirmed warehouse created with product');
select lives_ok($$select public.import_warehouse_inventory('Third',jsonb_build_array(pg_temp.import_item('t')),true)$$,
 'Third warehouse works without hardcoded limit');
select lives_ok($$select public.import_warehouse_inventory('Main',
 jsonb_build_array(pg_temp.import_item('006323',24,true,'["old"]',80,330),pg_temp.import_item('absent')))$$,
 'Import creates Main products');
select lives_ok($$select public.import_warehouse_inventory(' MAIN ',
 jsonb_build_array(pg_temp.import_item('006323',24,false,'[]')))$$, 'Main normalization updates same warehouse');
select is((select count(*) from public.warehouses),3::bigint,'Name case/space does not duplicate warehouse');
select results_eq($$select brand_active,pallet_size,weight_avg from public.inventory_items where brand_code='006323'$$,
 $$values (false,0,0::numeric)$$,'Inactive status and zero optional values overwrite previous data');
select is((select count(*) from public.item_bin_locations where brand_code='006323'),0::bigint,'Empty BIN array clears old BINs');
select is((select brand_active from public.inventory_items where brand_code='absent'),false,'Missing Main product becomes inactive');
select results_eq($$select brand_code,brand_active from public.inventory_items where brand_code in ('s','t') order by brand_code$$,
 $$values ('s'::text,true),('t'::text,true)$$,'Other warehouses remain active and unchanged');
select throws_ok($$select public.import_warehouse_inventory('Main',
 jsonb_build_array(pg_temp.import_item('same'),pg_temp.import_item(' same ')))$$,
 'P0001','Duplicate Brand Code; choose one row before importing','Database independently rejects duplicate codes');
select throws_ok($$select public.import_warehouse_inventory('Main',jsonb_build_array(pg_temp.import_item('bad',0)))$$,
 'P0001','BPU must be a positive integer','Database rejects zero BPU');
select throws_ok($$select public.import_warehouse_inventory('Main',
 jsonb_build_array(pg_temp.import_item('bad') - 'category'))$$,
 'P0001','Required inventory text is missing: category','Required category checked at database boundary');
select throws_ok($$select public.import_warehouse_inventory('Main',
 jsonb_build_array(pg_temp.import_item('bad') || '{"brand_active":"FALSE"}'))$$,
 'P0001','Status must be boolean','String status cannot bypass normalized payload contract');
select throws_ok($$select public.import_warehouse_inventory('Main',
 jsonb_build_array(pg_temp.import_item('bad',24,true,'["1","2","3","4","5"]')))$$,
 'P0001','At most four BINs are allowed','Extra BINs not silently discarded');

select lives_ok($$select public.import_warehouse_inventory('Main',
 jsonb_build_array(pg_temp.import_item('006323'),pg_temp.import_item('absent')))$$,'Prepare rollback fixture');
select throws_ok($$select public.import_warehouse_inventory('Main',
 jsonb_build_array(pg_temp.import_item('006323',24,false,'["FAIL_BIN"]')))$$,
 'P0001','Synthetic BIN failure','Later BIN failure aborts import');
select results_eq($$select brand_code,brand_active from public.inventory_items
 where brand_code in ('006323','absent') order by brand_code$$,
 $$values ('006323'::text,true),('absent'::text,true)$$,'Earlier item changes and inactivation rolled back');
select results_eq($$select bin_location from public.item_bin_locations where brand_code='006323'$$,
 $$values ('40B'::text)$$,'Deleted old BIN restored on failure');
select throws_ok($$select public.import_warehouse_inventory('Rollback WHS',
 jsonb_build_array(pg_temp.import_item('new',24,true,'["FAIL_BIN"]')),true)$$,
 'P0001','Synthetic BIN failure','Failure in new warehouse also rolls back');
select is((select count(*) from public.warehouses where name='Rollback WHS'),0::bigint,'Failed import leaves no empty new warehouse');
select is((select count(*) from public.inventory_items where brand_code='new'),0::bigint,'Failed import leaves no new product');

insert into public.count_sessions(id,warehouse_id) values
 ('00000000-0000-0000-0000-000000000811',(select id from public.warehouses where name='Main'));
select throws_ok($$select public.import_warehouse_inventory('Service',jsonb_build_array(pg_temp.import_item('006323')))$$,
 'P0001','Cannot transfer a product while its source or destination warehouse has an active count',
 'Active source prevents transfer through upload');
select throws_ok($$update public.inventory_items set warehouse_id=(select id from public.warehouses where name='Main') where brand_code='s'$$,
 'P0001','Cannot transfer a product while its source or destination warehouse has an active count',
 'Active destination prevents direct transfer');
select throws_ok($$select public.import_warehouse_inventory('Main',jsonb_build_array(pg_temp.import_item('006323',30)))$$,
 'P0001','BPU correction during a team count requires the dedicated two-admin approval flow',
 'Ordinary import cannot bypass team BPU approval');
select throws_ok($$update public.count_sessions set warehouse_id=(select id from public.warehouses where name='Service')
 where id='00000000-0000-0000-0000-000000000811'$$,
 'P0001','A session warehouse cannot be changed','Session warehouse identity cannot drift');
update public.count_sessions set status='fechada' where id='00000000-0000-0000-0000-000000000811';

insert into public.solo_sessions(id,title,warehouse_id) values
 ('00000000-0000-0000-0000-000000000812','Solo guard',(select id from public.warehouses where name='Service'));
select throws_ok($$select public.import_warehouse_inventory('Service',jsonb_build_array(pg_temp.import_item('006323')))$$,
 'P0001','Cannot transfer a product while its source or destination warehouse has an active count',
 'Open solo destination prevents transfer');
select throws_ok($$select public.import_warehouse_inventory('Main',jsonb_build_array(pg_temp.import_item('006323',30)))$$,
 'P0001','BPU cannot change while a solo count is open','Existing solo BPU protection survives import');
-- Closing solo is intentionally server-only in the existing schema.
set local role service_role;
update public.solo_sessions set status='closed' where id='00000000-0000-0000-0000-000000000812';
set local role authenticated;
select lives_ok($$select public.import_warehouse_inventory('Service',
 jsonb_build_array(pg_temp.import_item('006323'),pg_temp.import_item('s')))$$,'Transfer allowed after counts close');
select is((select count(*) from public.inventory_items where brand_code='006323'),1::bigint,'Transfer retains globally unique Brand Code');
select is((select w.name from public.inventory_items i join public.warehouses w on w.id=i.warehouse_id where i.brand_code='006323'),
 'Service','Transferred item has destination warehouse');
select lives_ok($$update public.warehouses set name='Service Renamed' where name='Service'$$,'Warehouse rename allowed');
select is((select w.name from public.solo_sessions s join public.warehouses w on w.id=s.warehouse_id
 where s.id='00000000-0000-0000-0000-000000000812'),'Service Renamed','Rename preserves closed session relationship');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000802', true);
select throws_ok($$select public.import_warehouse_inventory('Main',jsonb_build_array(pg_temp.import_item('intruder')))$$,
 'P0001','Unauthorized','Spoofed metadata does not authorize import');
select is((select count(*) from public.warehouses),0::bigint,'Non-admin cannot list registry in draft stage');
reset role;
select * from finish();
rollback;
