-- Every old field must remain byte-for-byte equivalent as JSON, including dates,
-- quantities and closed session metadata. Only warehouse_id is new.
do $$
declare original record; actual jsonb; main_id uuid; tab text; wrong bigint;
begin
 for original in select * from migration_probe.snapshots loop
   execute format('select jsonb_agg(to_jsonb(t)-''warehouse_id'' order by (to_jsonb(t)-''warehouse_id'')::text) from public.%I t',original.name) into actual;
   if actual is distinct from original.content then
     raise exception 'Warehouse migration changed historical fields in %',original.name;
   end if;
 end loop;
 select id into strict main_id from public.warehouses where name_key='main';
 foreach tab in array array['inventory_items','count_sessions','solo_sessions'] loop
   execute format('select count(*) from public.%I where warehouse_id is distinct from $1',tab) into wrong using main_id;
   if wrong <> 0 then raise exception 'Existing records not assigned to Main in %',tab; end if;
 end loop;
 if (select count(*) from pg_trigger where tgname in ('guard_solo_session_lifecycle',
 'guard_solo_entry_write','guard_solo_list_write','guard_inventory_bpu') and tgenabled='O') <> 4 then
   raise exception 'Existing protections were disabled during migration';
 end if;
 raise notice 'PASS: 9 historical tables unchanged, existing products/sessions assigned to Main, 4 guards enabled';
end;
$$;
drop schema migration_probe cascade;
