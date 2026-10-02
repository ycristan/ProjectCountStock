-- Reviewed operational repair, NOT an automatically applied migration.
-- psql -v source_id=... -v target_id=... -v source_hash=... -v target_hash=...
--      -v apply=false -f supabase/maintenance/recover-split-inventory.sql
-- Defaults to ROLLBACK. Use apply=true only after an approved fresh dry run.
\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply false
\endif
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select pg_advisory_xact_lock(6969,1);
-- Freeze the affected state while checking and repairing; do not disable triggers.
lock table public.inventory_items, public.item_bin_locations, public.warehouses,
 public.count_sessions, public.solo_sessions, public.teams, public.counter_accounts,
 public.count_entries, public.reconciliation_items, public.combined_results,
 public.solo_entries, public.solo_session_items in share row exclusive mode;
create temporary table repair_request on commit drop as
select :'source_id'::uuid as source_id, :'target_id'::uuid as target_id,
 :'source_hash'::text as source_hash, :'target_hash'::text as target_hash;
do $repair$
declare r record; actual text;
begin
 select * into strict r from repair_request;
 if r.source_id = r.target_id then raise exception 'Source and destination must differ'; end if;
 if (select count(*) from public.warehouses where id in (r.source_id,r.target_id)) <> 2 then
   raise exception 'Both warehouses must exist'; end if;
 if exists(select 1 from public.count_sessions where warehouse_id in (r.source_id,r.target_id) and status <> 'fechada')
 or exists(select 1 from public.solo_sessions where warehouse_id in (r.source_id,r.target_id) and status <> 'closed') then
   raise exception 'Close source and destination counts before repairing inventory';
 end if;
 if not exists(select 1 from public.inventory_items where warehouse_id=r.source_id) then
   raise exception 'Source is empty; do not replay a completed repair'; end if;
 select md5(coalesce(string_agg(to_jsonb(i)::text,E'\n' order by brand_code),'')) into actual
 from public.inventory_items i where warehouse_id=r.source_id;
 if actual is distinct from r.source_hash then raise exception 'Source changed since review'; end if;
 select md5(coalesce(string_agg(to_jsonb(i)::text,E'\n' order by brand_code),'')) into actual
 from public.inventory_items i where warehouse_id=r.target_id;
 if actual is distinct from r.target_hash then raise exception 'Destination changed since review'; end if;
end;
$repair$;
-- Exact expected inventory: only source membership and absent-product Status change.
-- Source products were omitted from the replacement upload; retain them as Inactive.
create temporary table repair_expected_inventory on commit drop as
select i.brand_code, to_jsonb(i) || case when i.warehouse_id=r.source_id
 then jsonb_build_object('warehouse_id',r.target_id,'brand_active',false)
 else '{}'::jsonb end as content
from public.inventory_items i cross join repair_request r;
create temporary table repair_history(name text primary key, content jsonb) on commit drop;
do $snapshot$
declare tab text; snapshot jsonb;
begin
 foreach tab in array array['warehouses','item_bin_locations','count_sessions','teams','counter_accounts',
 'count_entries','reconciliation_items','combined_results','solo_sessions','solo_entries','solo_session_items'] loop
   execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), ''[]''::jsonb) from public.%I t',tab) into snapshot;
   insert into repair_history values(tab,snapshot);
 end loop;
end;
$snapshot$;
update public.inventory_items i set warehouse_id=r.target_id, brand_active=false
from repair_request r where i.warehouse_id=r.source_id;
do $verify$
declare tab text; snapshot jsonb;
begin
 if exists(
   (select brand_code,content from repair_expected_inventory
    except select brand_code,to_jsonb(i) from public.inventory_items i)
   union all
   (select brand_code,to_jsonb(i) from public.inventory_items i
    except select brand_code,content from repair_expected_inventory)
 ) then raise exception 'Unexpected inventory change; entire repair rolled back'; end if;
 foreach tab in array array['warehouses','item_bin_locations','count_sessions','teams','counter_accounts',
 'count_entries','reconciliation_items','combined_results','solo_sessions','solo_entries','solo_session_items'] loop
   execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), ''[]''::jsonb) from public.%I t',tab) into snapshot;
   if snapshot is distinct from (select content from repair_history where name=tab) then
     raise exception 'History changed in %; entire repair rolled back',tab;
   end if;
 end loop;
end;
$verify$;
select w.name, count(i.brand_code) as total,
 count(i.brand_code) filter(where i.brand_active) as active,
 count(i.brand_code) filter(where not i.brand_active) as inactive
from public.warehouses w left join public.inventory_items i on i.warehouse_id=w.id
where w.id in (select source_id from repair_request union all select target_id from repair_request)
group by w.name order by w.name;
\if :apply
 commit;
\else
 rollback;
\endif
