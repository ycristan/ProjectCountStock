begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-000000000901', 'save-admin@example.invalid', '{}'),
 ('00000000-0000-0000-0000-000000000902', 'save-not-admin@example.invalid', '{"role":"admin"}');
insert into public.app_user_access(user_id, access_kind) values
 ('00000000-0000-0000-0000-000000000901', 'admin');
insert into public.warehouses(id, name) values ('00000000-0000-0000-0000-000000000911', 'Service');
insert into public.inventory_items(brand_code, brand_name, bpu, category, category1, warehouse_id) values
 ('0901', 'Edit me', 20, 'Drinks', 'Cans', (select id from public.warehouses where name = 'Main')),
 ('0902', 'Elsewhere', 6, 'Food', 'Tins', '00000000-0000-0000-0000-000000000911');
insert into public.item_bin_locations(brand_code, bin_location) values ('0901', 'OLD1'), ('0901', 'OLD2');

create function pg_temp.main() returns uuid language sql as $$ select id from public.warehouses where name = 'Main' $$;
create function pg_temp.item_row(bpu numeric default 24, bins jsonb default '["40A"]', name text default 'Edited')
returns jsonb language sql as $$
 select jsonb_build_object('brand_name', name, 'category', 'Drinks', 'category1', 'Cans',
 'bpu', bpu, 'pallet_size', 80, 'weight_avg', 330.5, 'bins', bins);
$$;
-- Injected failure while writing BINs proves the product update rolls back with it.
create function pg_temp.fail_bin() returns trigger language plpgsql as $$
begin
 if new.bin_location = 'FAIL_BIN' then raise exception 'Synthetic BIN failure'; end if;
 return new;
end;
$$;
create trigger test_fail_bin before insert on public.item_bin_locations
for each row execute function pg_temp.fail_bin();

select ok(has_function_privilege('authenticated', 'public.save_inventory_item(uuid,text,jsonb,boolean)', 'execute'),
 'Administrators call it as authenticated; the function checks admin itself');
select ok(not has_function_privilege('anon', 'public.save_inventory_item(uuid,text,jsonb,boolean)', 'execute'),
 'No anonymous access');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000902', true);
select throws_ok($$select public.save_inventory_item(pg_temp.main(), '0901', pg_temp.item_row())$$,
 'P0001', 'Unauthorized', 'Spoofed user_metadata does not authorize editing');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000901', true);
select lives_ok($$select public.save_inventory_item(pg_temp.main(), '0901', pg_temp.item_row(24, '["40A","40B"]'))$$,
 'Edit saves product and BINs');
select results_eq($$select brand_name, bpu, pallet_size, weight_avg from public.inventory_items where brand_code = '0901'$$,
 $$values ('Edited'::text, 24, 80, 330.5::numeric)$$, 'Product fields updated');
select results_eq($$select bin_location from public.item_bin_locations where brand_code = '0901' order by 1$$,
 $$values ('40A'::text), ('40B'::text)$$, 'Old BINs replaced');

select throws_ok($$select public.save_inventory_item(pg_temp.main(), '0901', pg_temp.item_row(30, '["FAIL_BIN"]', 'Broken'))$$,
 'P0001', 'Synthetic BIN failure', 'BIN failure aborts the edit');
select results_eq($$select brand_name, bpu from public.inventory_items where brand_code = '0901'$$,
 $$values ('Edited'::text, 24)$$, 'Failed edit leaves the product unchanged');
select results_eq($$select bin_location from public.item_bin_locations where brand_code = '0901' order by 1$$,
 $$values ('40A'::text), ('40B'::text)$$, 'Failed edit keeps the previous BINs (the old defect lost them)');

select throws_ok($$select public.save_inventory_item(pg_temp.main(), '0901', pg_temp.item_row(0))$$,
 'P0001', 'BPU must be a positive integer', 'BPU zero rejected');
select throws_ok($$select public.save_inventory_item(pg_temp.main(), '0901', pg_temp.item_row(2.5))$$,
 'P0001', 'BPU must be a positive integer', 'Fractional BPU rejected');
select throws_ok($$select public.save_inventory_item(pg_temp.main(), '0901', pg_temp.item_row(24, '["a","b","c","d","e"]'))$$,
 'P0001', 'At most four BINs are allowed', 'Fifth BIN rejected');
select throws_ok($$select public.save_inventory_item(pg_temp.main(), '0901', pg_temp.item_row(24, '["40A"]', ' '))$$,
 'P0001', 'Required inventory text is missing: brand_name', 'Blank name rejected');
select throws_ok($$select public.save_inventory_item(pg_temp.main(), '0902', pg_temp.item_row())$$,
 'P0001', 'Product not found in this warehouse', 'A tab cannot edit another warehouse''s product');
select lives_ok($$select public.save_inventory_item(pg_temp.main(), '0901', pg_temp.item_row(24, '[]'))$$,
 'Empty BIN list is allowed');
select is((select count(*) from public.item_bin_locations where brand_code = '0901'), 0::bigint, 'All BINs removed');

-- Manual creation.
select lives_ok($$select public.save_inventory_item(pg_temp.main(), ' 007 ', pg_temp.item_row(12, '["9Z"]', 'New one'), true)$$,
 'Manual creation in the tab''s warehouse');
select results_eq($$select brand_code, brand_active, warehouse_id = pg_temp.main() from public.inventory_items where brand_name = 'New one'$$,
 $$values ('007'::text, true, true)$$, 'Code trimmed, leading zeros kept, active, in the tab warehouse');
select results_eq($$select bin_location from public.item_bin_locations where brand_code = '007'$$,
 $$values ('9Z'::text)$$, 'New product BIN saved');
select throws_ok($$select public.save_inventory_item(pg_temp.main(), '0902', pg_temp.item_row(), true)$$,
 'P0001', 'Brand Code 0902 already exists in Service', 'Code from another warehouse blocked, naming it');
update public.inventory_items set brand_active = false where brand_code = '0901';
select throws_ok($$select public.save_inventory_item(pg_temp.main(), '0901', pg_temp.item_row(), true)$$,
 'P0001', 'Brand Code 0901 already exists in Main', 'Inactive product is never duplicated');
select is((select count(*) from public.inventory_items where brand_code in ('0901','0902')), 2::bigint, 'No duplicates created');
select throws_ok($$select public.save_inventory_item(pg_temp.main(), '  ', pg_temp.item_row(), true)$$,
 'P0001', 'Brand Code is required', 'Blank code rejected');
select throws_ok($$select public.save_inventory_item(pg_temp.main(), 'FAILNEW', pg_temp.item_row(24, '["FAIL_BIN"]'), true)$$,
 'P0001', 'Synthetic BIN failure', 'BIN failure aborts creation');
select is((select count(*) from public.inventory_items where brand_code = 'FAILNEW'), 0::bigint, 'Failed creation leaves no product');

-- Existing BPU guards still apply through this function.
reset role;
insert into public.count_sessions(id, warehouse_id) values ('00000000-0000-0000-0000-000000000921', pg_temp.main());
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000901', true);
select throws_ok($$select public.save_inventory_item(pg_temp.main(), '0901', pg_temp.item_row(30))$$,
 'P0001', 'BPU correction during a team count requires the dedicated two-admin approval flow',
 'Open team session freezes BPU');
select lives_ok($$select public.save_inventory_item(pg_temp.main(), '0901', pg_temp.item_row(24, '[]', 'Name only'))$$,
 'Other fields still editable during a team count');
select throws_ok($$select public.save_inventory_item(pg_temp.main(), 'TEAMNEW', pg_temp.item_row(), true)$$,
 'P0001', 'New products cannot be added while a team count is open in this warehouse',
 'Manual creation blocked in the warehouse with an open team count (Yuri, 10/11)');
select lives_ok($$select public.save_inventory_item('00000000-0000-0000-0000-000000000911', 'OTHERWH', pg_temp.item_row(), true)$$,
 'Another warehouse can still receive manual products');
reset role;
update public.count_sessions set status = 'fechada' where id = '00000000-0000-0000-0000-000000000921';
insert into public.solo_sessions(id, title, warehouse_id) values ('00000000-0000-0000-0000-000000000922', 'Solo guard', pg_temp.main());
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000901', true);
select throws_ok($$select public.save_inventory_item(pg_temp.main(), '0901', pg_temp.item_row(30))$$,
 'P0001', 'BPU cannot change while a solo count is open', 'Open solo session freezes BPU');
select lives_ok($$select public.save_inventory_item(pg_temp.main(), 'SOLONEW', pg_temp.item_row(), true)$$,
 'Closed team count and an open solo count do not block manual creation');

reset role;
select * from finish();
rollback;
