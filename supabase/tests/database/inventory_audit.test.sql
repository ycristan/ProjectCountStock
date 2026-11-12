begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- The audit is written at commit, once per product. This test never commits, so after each
-- whole change it fires the pending commit triggers by switching to immediate and back
-- (switching per statement would run them inside the function, between its own statements).

insert into auth.users(id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-000000000a01', 'audit-admin@example.invalid', '{}'),
 ('00000000-0000-0000-0000-000000000a02', 'audit-not-admin@example.invalid', '{"role":"admin"}');
insert into public.app_user_access(user_id, access_kind) values
 ('00000000-0000-0000-0000-000000000a01', 'admin');

create function pg_temp.main() returns uuid language sql as $$ select id from public.warehouses where name = 'Main' $$;
create function pg_temp.item_row(bpu integer default 24, bins jsonb default '["40A"]', name text default 'Audit product')
returns jsonb language sql as $$
 select jsonb_build_object('brand_name', name, 'category', 'Drinks', 'category1', 'Cans',
 'bpu', bpu, 'pallet_size', 0, 'weight_avg', 0, 'bins', bins);
$$;
create function pg_temp.import_row(bpu integer default 24, bins jsonb default '["40A","40B"]')
returns jsonb language sql as $$
 select jsonb_build_array(jsonb_build_object('brand_code', 'AUD1', 'brand_name', 'Edited', 'category', 'Drinks',
 'category1', 'Cans', 'bpu', bpu, 'pallet_size', 0, 'weight_avg', 0, 'brand_active', true, 'bins', bins));
$$;
create function pg_temp.audits() returns bigint language sql as $$ select count(*) from public.inventory_audit where brand_code = 'AUD1' $$;
create function pg_temp.last_audit() returns public.inventory_audit language sql as $$
 select * from public.inventory_audit where brand_code = 'AUD1' order by id desc limit 1 $$;

select has_table('public', 'inventory_audit', 'Audit Inventory table exists');
select ok(not has_table_privilege('anon', 'public.inventory_audit', 'select'), 'No anonymous read');
select ok(not has_table_privilege('authenticated', 'public.inventory_audit', 'insert'), 'Nobody writes the audit directly');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000a01', true);

select lives_ok($$select public.save_inventory_item(pg_temp.main(), 'AUD1', pg_temp.item_row(), true)$$, 'Manual creation');
set constraints all immediate; set constraints all deferred;
select is(pg_temp.audits(), 1::bigint, 'Creation recorded once (product row and BIN row are one change)');
select ok((pg_temp.last_audit()).before is null, 'Creation has no before');
select is((pg_temp.last_audit()).after -> 'bins', '["40A"]'::jsonb, 'After includes the BINs');
select is((pg_temp.last_audit()).after ->> 'warehouse', 'Main', 'After names the warehouse');
select is((pg_temp.last_audit()).actor_id, '00000000-0000-0000-0000-000000000a01'::uuid, 'Author is the admin');
select is((pg_temp.last_audit()).actor_role, 'authenticated', 'Request role recorded');

select lives_ok($$select public.save_inventory_item(pg_temp.main(), 'AUD1', pg_temp.item_row(20, '["40A","40C"]', 'Edited'))$$, 'Edit');
set constraints all immediate; set constraints all deferred;
select is(pg_temp.audits(), 2::bigint, 'Edit with BIN delete+insert recorded once');
select is((pg_temp.last_audit()).before ->> 'bpu', '24', 'Before BPU');
select is((pg_temp.last_audit()).after ->> 'bpu', '20', 'After BPU');
select is((pg_temp.last_audit()).before -> 'bins', '["40A"]'::jsonb, 'Before BINs');
select is((pg_temp.last_audit()).after -> 'bins', '["40A","40C"]'::jsonb, 'After BINs');

select lives_ok($$select public.save_inventory_item(pg_temp.main(), 'AUD1', pg_temp.item_row(20, '["40C","40A"]', 'Edited'))$$, 'Save without changes');
set constraints all immediate; set constraints all deferred;
select is(pg_temp.audits(), 2::bigint, 'Saving the same values records nothing');

select lives_ok($$update public.inventory_items set brand_active = false where brand_code = 'AUD1'$$, 'Status toggle');
set constraints all immediate; set constraints all deferred;
select is(pg_temp.audits(), 3::bigint, 'Toggle recorded');
select is((pg_temp.last_audit()).after ->> 'brand_active', 'false', 'Toggle after is Inactive');

select lives_ok($$select public.import_warehouse_inventory('Main', pg_temp.import_row(20, '["40A","40C"]'))$$, 'Import reactivates');
set constraints all immediate; set constraints all deferred;
select is(pg_temp.audits(), 4::bigint, 'Import change recorded');
select lives_ok($$select public.import_warehouse_inventory('Main', pg_temp.import_row(20, '["40A","40C"]'))$$, 'Same sheet again');
set constraints all immediate; set constraints all deferred;
select is(pg_temp.audits(), 4::bigint, 'Re-importing the same sheet records nothing');

-- Failed change leaves no audit row: the whole transaction, audit included, is undone.
select throws_ok($$select public.save_inventory_item(pg_temp.main(), 'AUD1', pg_temp.item_row(0))$$,
 'P0001', 'BPU must be a positive integer', 'Invalid edit refused');
set constraints all immediate; set constraints all deferred;
select is(pg_temp.audits(), 4::bigint, 'Refused edit records nothing');

select throws_ok($$insert into public.inventory_audit(brand_code, actor_role, after) values ('AUD1', 'x', '{}')$$,
 '42501', null, 'Admin cannot forge an audit row');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000a02', true);
select is((select count(*) from public.inventory_audit), 0::bigint, 'Non-admin (spoofed metadata) reads nothing');

-- Maintenance SQL is recorded too, with no app user.
reset role;
select set_config('request.jwt.claim.sub', '', true);
update public.inventory_items set brand_name = 'Fixed by SQL' where brand_code = 'AUD1';
set constraints all immediate; set constraints all deferred;
select is(pg_temp.audits(), 5::bigint, 'Direct SQL change recorded');
select ok((pg_temp.last_audit()).actor_id is null, 'Maintenance has no app author');
select is((pg_temp.last_audit()).actor_role, 'postgres', 'Maintenance role recorded');

delete from public.inventory_items where brand_code = 'AUD1';
set constraints all immediate; set constraints all deferred;
select is(pg_temp.audits(), 6::bigint, 'Deletion recorded');
select ok((pg_temp.last_audit()).after is null, 'Deletion has no after');
select is((pg_temp.last_audit()).before -> 'bins', '["40A","40C"]'::jsonb, 'Deletion keeps the BINs it had');

-- Append-only for every role, service_role included.
select throws_ok($$update public.inventory_audit set brand_code = 'X'$$, 'P0001', 'Audit Inventory is append-only', 'No update');
select throws_ok($$delete from public.inventory_audit$$, 'P0001', 'Audit Inventory is append-only', 'No delete');
select throws_ok($$truncate public.inventory_audit$$, 'P0001', 'Audit Inventory is append-only', 'No truncate');
set local role service_role;
select throws_ok($$delete from public.inventory_audit$$, 'P0001', 'Audit Inventory is append-only', 'service_role cannot delete either');
reset role;
select is((select count(*) from private.inventory_audit_pending), 0::bigint, 'Nothing left staged');

select * from finish();
rollback;
