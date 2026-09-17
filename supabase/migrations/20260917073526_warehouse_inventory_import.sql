-- DRAFT: deploy only together with scoped application reads/writes.
-- Existing records acquire Main through an ADD COLUMN constant default, not UPDATE:
-- no closed-session trigger is disabled and no recorded quantity is rewritten.
create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name = btrim(name) and name <> ''),
  name_key text generated always as (lower(btrim(name))) stored unique,
  created_at timestamptz not null default now()
);
alter table public.warehouses enable row level security;
revoke all on public.warehouses from public, anon, authenticated;
grant select, insert, update on public.warehouses to authenticated;
grant all on public.warehouses to service_role;
create policy warehouses_admin on public.warehouses for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));

do $migration$
declare main_id uuid;
begin
  insert into public.warehouses(name) values ('Main') returning id into main_id;
  execute format('alter table public.inventory_items add column warehouse_id uuid not null default %L::uuid references public.warehouses(id)', main_id);
  execute format('alter table public.count_sessions add column warehouse_id uuid not null default %L::uuid references public.warehouses(id)', main_id);
  execute format('alter table public.solo_sessions add column warehouse_id uuid not null default %L::uuid references public.warehouses(id)', main_id);
end;
$migration$;
create index inventory_items_warehouse_code_idx on public.inventory_items(warehouse_id, brand_code);
create index count_sessions_warehouse_status_idx on public.count_sessions(warehouse_id, status);
create index solo_sessions_warehouse_status_idx on public.solo_sessions(warehouse_id, status);

-- Take the existing lifecycle lock BEFORE row locks, including direct table writes.
-- This serializes inventory/session changes but not ordinary reads or count entries.
-- It prevents concurrent session creation from bypassing transfer/BPU checks.
create function private.lock_inventory_lifecycle()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(6969, 1);
  return null;
end;
$$;
create trigger inventory_lifecycle_lock before insert or update or delete on public.inventory_items
for each statement execute function private.lock_inventory_lifecycle();
create trigger count_session_lifecycle_lock before insert or update or delete on public.count_sessions
for each statement execute function private.lock_inventory_lifecycle();
create trigger solo_session_lifecycle_lock before insert or update or delete on public.solo_sessions
for each statement execute function private.lock_inventory_lifecycle();

create function private.guard_inventory_warehouse()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if new.warehouse_id is distinct from old.warehouse_id and (
    exists (select 1 from public.count_sessions
      where warehouse_id in (old.warehouse_id, new.warehouse_id) and status <> 'fechada')
    or exists (select 1 from public.solo_sessions
      where warehouse_id in (old.warehouse_id, new.warehouse_id) and status <> 'closed')
  ) then raise exception 'Cannot transfer a product while its source or destination warehouse has an active count'; end if;
  -- The future dual-admin flow must be a dedicated audited operation. Ordinary
  -- edit/import cannot use it implicitly; current solo guard also remains active.
  if new.bpu is distinct from old.bpu and exists (
    select 1 from public.count_sessions where status <> 'fechada'
  ) then raise exception 'BPU correction during a team count requires the dedicated two-admin approval flow'; end if;
  return new;
end;
$$;
create trigger guard_inventory_warehouse before update on public.inventory_items
for each row execute function private.guard_inventory_warehouse();

create function private.guard_session_warehouse()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if new.warehouse_id is distinct from old.warehouse_id then
    raise exception 'A session warehouse cannot be changed';
  end if;
  return new;
end;
$$;
create trigger guard_count_session_warehouse before update on public.count_sessions
for each row execute function private.guard_session_warehouse();
create trigger guard_solo_session_warehouse before update on public.solo_sessions
for each row execute function private.guard_session_warehouse();

revoke all on function private.lock_inventory_lifecycle(),
  private.guard_inventory_warehouse(), private.guard_session_warehouse()
from public, anon, authenticated;

-- Atomic import. SECURITY INVOKER retains the caller's RLS and checks protected
-- admin identity explicitly. No client-supplied role or warehouse ID is trusted.
create function public.import_warehouse_inventory(
  p_warehouse_name text,
  p_items jsonb,
  p_create_warehouse boolean default false
)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  target_id uuid;
  item jsonb;
  field text;
  bin jsonb;
  deactivated integer;
begin
  if not public.is_admin() then raise exception 'Unauthorized'; end if;
  if p_warehouse_name is null or btrim(p_warehouse_name) = '' then
    raise exception 'Warehouse name is required';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Items must be an array';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'An empty import is not allowed';
  end if;
  -- Revalidate at the database boundary, even if TypeScript already validated.
  for item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(item) is distinct from 'object' then raise exception 'Invalid inventory row'; end if;
    foreach field in array array['brand_code', 'brand_name', 'category', 'category1'] loop
      if jsonb_typeof(item -> field) is distinct from 'string' or btrim(item ->> field) = '' then
        raise exception 'Required inventory text is missing: %', field;
      end if;
    end loop;
    foreach field in array array['bpu', 'pallet_size', 'weight_avg'] loop
      if jsonb_typeof(item -> field) is distinct from 'number' then
        raise exception 'Invalid inventory number: %', field;
      end if;
      if (item ->> field)::numeric < 0 then raise exception 'Negative inventory number: %', field; end if;
    end loop;
    if (item ->> 'bpu')::numeric < 1
      or (item ->> 'bpu')::numeric <> trunc((item ->> 'bpu')::numeric)
      or (item ->> 'bpu')::numeric > 2147483647 then raise exception 'BPU must be a positive integer'; end if;
    if (item ->> 'pallet_size')::numeric <> trunc((item ->> 'pallet_size')::numeric)
      or (item ->> 'pallet_size')::numeric > 2147483647 then raise exception 'Pallet Size must be a non-negative integer'; end if;
    if jsonb_typeof(item -> 'brand_active') is distinct from 'boolean' then raise exception 'Status must be boolean'; end if;
    if jsonb_typeof(item -> 'bins') is distinct from 'array' then raise exception 'BINs must be an array'; end if;
    if jsonb_array_length(item -> 'bins') > 4 then raise exception 'At most four BINs are allowed'; end if;
    for bin in select value from jsonb_array_elements(item -> 'bins') loop
      if jsonb_typeof(bin) is distinct from 'string' or btrim(bin #>> '{}') = '' then
        raise exception 'BIN must be a non-empty string';
      end if;
    end loop;
  end loop;
  if exists (
    select 1 from jsonb_array_elements(p_items) r
    group by btrim(r ->> 'brand_code') having count(*) > 1
  ) then raise exception 'Duplicate Brand Code; choose one row before importing'; end if;

  -- One transaction lock covers imports to different WHS too: a global Brand Code
  -- can move between them. No XLSX parsing or network I/O occurs under this lock.
  perform pg_catalog.pg_advisory_xact_lock(6969, 1);
  select id into target_id from public.warehouses
  where name_key = lower(btrim(p_warehouse_name)) for update;
  if target_id is null then
    if p_create_warehouse is distinct from true then
      raise exception 'New warehouse requires explicit administrator confirmation';
    end if;
    insert into public.warehouses(name) values (btrim(p_warehouse_name))
    returning id into target_id;
  end if;

  insert into public.inventory_items (
    brand_code, brand_name, category, category1, bpu, pallet_size,
    weight_avg, brand_active, warehouse_id
  )
  select btrim(r.brand_code), btrim(r.brand_name), btrim(r.category), btrim(r.category1),
    r.bpu, r.pallet_size, r.weight_avg, r.brand_active, target_id
  from jsonb_to_recordset(p_items) as r(
    brand_code text, brand_name text, category text, category1 text,
    bpu integer, pallet_size integer, weight_avg numeric, brand_active boolean
  )
  order by btrim(r.brand_code)
  on conflict (brand_code) do update set
    brand_name = excluded.brand_name, category = excluded.category, category1 = excluded.category1,
    bpu = excluded.bpu, pallet_size = excluded.pallet_size, weight_avg = excluded.weight_avg,
    brand_active = excluded.brand_active, warehouse_id = excluded.warehouse_id;

  delete from public.item_bin_locations b
  using jsonb_array_elements(p_items) r
  where b.brand_code = btrim(r ->> 'brand_code');
  insert into public.item_bin_locations(brand_code, bin_location)
  select distinct btrim(r ->> 'brand_code'), btrim(bin.value)
  from jsonb_array_elements(p_items) r
  cross join lateral jsonb_array_elements_text(r -> 'bins') bin;

  update public.inventory_items i set brand_active = false
  where i.warehouse_id = target_id and i.brand_active
    and not exists (select 1 from jsonb_array_elements(p_items) r
      where btrim(r ->> 'brand_code') = i.brand_code);
  get diagnostics deactivated = row_count;
  return jsonb_build_object('warehouse_id', target_id,
    'imported', jsonb_array_length(p_items), 'deactivated', deactivated);
end;
$$;
-- Deliberately unavailable to API callers during this draft stage. Integration
-- will grant EXECUTE only when scoped reads/writes and the replacement UI are ready.
revoke all on function public.import_warehouse_inventory(text, jsonb, boolean)
from public, anon, authenticated, service_role;
