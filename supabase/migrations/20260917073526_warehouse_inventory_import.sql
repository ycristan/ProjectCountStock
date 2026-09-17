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


-- Scope public inventory reads to protected assignments, never editable JWT metadata.
create function private.can_read_warehouse(p_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $
  select auth.uid() is not null and (
    exists (select 1 from public.counter_accounts a
      join public.teams t on t.id = a.team_id
      join public.count_sessions s on s.id = t.session_id
      where a.auth_user_id = auth.uid() and s.warehouse_id = p_id)
    or (private.is_solo_counter() and exists (
      select 1 from public.solo_sessions s
      where s.warehouse_id = p_id and s.assigned_to_counter and s.status = 'open'
    ))
  );
$;
revoke all on function private.can_read_warehouse(uuid) from public, anon;
grant execute on function private.can_read_warehouse(uuid) to authenticated;

drop policy counter_read on public.inventory_items;
create policy counter_read on public.inventory_items for select to authenticated
using (private.can_read_warehouse(warehouse_id));
drop policy counter_read on public.item_bin_locations;
create policy counter_read on public.item_bin_locations for select to authenticated
using (exists (select 1 from public.inventory_items i
  where i.brand_code = item_bin_locations.brand_code and private.can_read_warehouse(i.warehouse_id)));
drop policy counter_read on public.count_sessions;
create policy counter_read on public.count_sessions for select to authenticated
using (exists (select 1 from public.teams t where t.session_id = count_sessions.id and t.id = public.my_team_id()));
drop policy all_read on public.combined_results;

-- Reject cross-warehouse writes even via service_role. Inventory transfers are
-- already serialized against session creation and prohibited during active counts.
create function private.guard_count_warehouse()
returns trigger language plpgsql security invoker set search_path = ''
as $
declare wh uuid; item_wh uuid;
begin
  if tg_table_name in ('solo_entries', 'solo_session_items') then
    select warehouse_id into wh from public.solo_sessions where id = new.session_id;
  elsif tg_table_name = 'combined_results' then
    select warehouse_id into wh from public.count_sessions where id = new.session_id;
  else
    select s.warehouse_id into wh from public.count_sessions s
      join public.teams t on t.session_id = s.id where t.id = new.team_id;
  end if;
  select warehouse_id into item_wh from public.inventory_items where brand_code = new.brand_code;
  if wh is null or item_wh is distinct from wh then
    raise exception 'Product does not belong to the session warehouse';
  end if;
  return new;
end;
$;
create trigger guard_count_warehouse before insert or update on public.count_entries
for each row execute function private.guard_count_warehouse();
create trigger guard_reconciliation_warehouse before insert or update on public.reconciliation_items
for each row execute function private.guard_count_warehouse();
create trigger guard_combined_warehouse before insert or update on public.combined_results
for each row execute function private.guard_count_warehouse();
create trigger guard_solo_warehouse before insert or update on public.solo_entries
for each row execute function private.guard_count_warehouse();
create trigger guard_solo_list_warehouse before insert or update on public.solo_session_items
for each row execute function private.guard_count_warehouse();
revoke all on function private.guard_count_warehouse() from public, anon, authenticated;

-- Creation and the selected item list succeed or fail together.
create function public.create_warehouse_solo_session(
  p_title text, p_warehouse_id uuid, p_assigned boolean, p_restrict boolean,
  p_codes text[], p_tare numeric
) returns uuid language plpgsql security invoker set search_path = ''
as $
declare result_id uuid;
begin
  if not public.is_admin() then raise exception 'Unauthorized'; end if;
  perform pg_catalog.pg_advisory_xact_lock(6969, 1);
  if p_title is null or btrim(p_title) = '' then raise exception 'Title is required'; end if;
  if not exists (select 1 from public.warehouses where id = p_warehouse_id) then raise exception 'Warehouse unavailable'; end if;
  if p_assigned is null or p_restrict is null or p_codes is null or p_tare is null or p_tare < 0 then raise exception 'Invalid session settings'; end if;
  if p_restrict and cardinality(p_codes) = 0 then raise exception 'Select at least one product'; end if;
  if exists (select 1 from unnest(p_codes) code where not exists (
    select 1 from public.inventory_items i where i.brand_code = code and i.warehouse_id = p_warehouse_id
  )) then raise exception 'Product does not belong to the session warehouse'; end if;
  insert into public.solo_sessions(title, warehouse_id, assigned_to_counter, restrict_to_list, box_tare_g)
  values (btrim(p_title), p_warehouse_id, p_assigned, p_restrict, p_tare) returning id into result_id;
  if p_restrict then
    insert into public.solo_session_items(session_id, brand_code)
    select result_id, code from (select distinct unnest(p_codes) as code) codes;
  end if;
  return result_id;
end;
$;
revoke all on function public.create_warehouse_solo_session(text, uuid, boolean, boolean, text[], numeric) from public, anon;
grant execute on function public.create_warehouse_solo_session(text, uuid, boolean, boolean, text[], numeric) to authenticated;

CREATE OR REPLACE FUNCTION combine_session_results(p_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $
DECLARE
  v_brand_code TEXT;
  v_bpu        INT;
  v_team       RECORD;
  v_total      BIGINT;
  v_contrib    JSONB;
BEGIN
  perform pg_catalog.pg_advisory_xact_lock(6969, 1);
  if not exists (select 1 from public.count_sessions where id = p_session_id and status <> 'fechada') then
    raise exception 'Session closed or unavailable';
  end if;
  DELETE FROM combined_results WHERE session_id = p_session_id;

  FOR v_brand_code, v_bpu IN
    SELECT ii.brand_code, COALESCE(NULLIF(ii.bpu, 0), 1)
    FROM   inventory_items ii
    WHERE ii.warehouse_id = (select warehouse_id from public.count_sessions where id = p_session_id)
    ORDER BY ii.brand_code
  LOOP
    v_total   := 0;
    v_contrib := '[]'::JSONB;

    FOR v_team IN
      SELECT t.id        AS team_id,
             t.team_name,
             ri.status,
             ri.contador_1_cases,    ri.contador_1_units,
             ri.contador_2_cases,    ri.contador_2_units,
             ri.independente_cases,  ri.independente_units,
             ri.reconciliated_cases, ri.reconciliated_units
      FROM   teams t
      LEFT JOIN reconciliation_items ri
             ON ri.team_id    = t.id
            AND ri.brand_code = v_brand_code
      WHERE  t.session_id = p_session_id
        AND  t.status     = 'reconciliada'
      ORDER BY t.team_name
    LOOP
      IF v_team.status = 'resolvido' THEN
        v_total := v_total
          + (COALESCE(v_team.reconciliated_cases, 0)::BIGINT * v_bpu)
          + COALESCE(v_team.reconciliated_units, 0);
      ELSIF v_team.independente_cases IS NOT NULL THEN
        v_total := v_total
          + (COALESCE(v_team.independente_cases, 0)::BIGINT * v_bpu)
          + COALESCE(v_team.independente_units, 0);
      ELSIF v_team.contador_1_cases IS NOT NULL THEN
        -- ponytail: C1=C2, no discrepancy — C1 is official
        v_total := v_total
          + (COALESCE(v_team.contador_1_cases, 0)::BIGINT * v_bpu)
          + COALESCE(v_team.contador_1_units, 0);
      END IF;

      v_contrib := v_contrib || jsonb_build_array(jsonb_build_object(
        'team_id',             v_team.team_id,
        'team_name',           v_team.team_name,
        'independente_cases',  v_team.independente_cases,
        'independente_units',  v_team.independente_units,
        'contador_1_cases',    v_team.contador_1_cases,
        'contador_1_units',    v_team.contador_1_units,
        'contador_2_cases',    v_team.contador_2_cases,
        'contador_2_units',    v_team.contador_2_units,
        'reconciliated_cases', v_team.reconciliated_cases,
        'reconciliated_units', v_team.reconciliated_units,
        'had_discrepancy',     (v_team.status = 'resolvido')
      ));
    END LOOP;

    INSERT INTO combined_results (
      session_id, brand_code,
      total_cases, total_units,
      contributing_teams, status
    ) VALUES (
      p_session_id, v_brand_code,
      (v_total / v_bpu)::INT,
      (v_total % v_bpu)::INT,
      v_contrib,
      'Avl'
    )
    ON CONFLICT (session_id, brand_code) DO UPDATE SET
      total_cases        = EXCLUDED.total_cases,
      total_units        = EXCLUDED.total_units,
      contributing_teams = EXCLUDED.contributing_teams,
      status             = EXCLUDED.status;
  END LOOP;

  -- fix: encerra a sessão (enum já previa 'fechada', nunca era usado)
  UPDATE count_sessions SET status = 'fechada' WHERE id = p_session_id;
END;
$$;


-- Only server-side, authorized administrative actions may combine results.
revoke all on function public.combine_session_results(uuid) from public, anon, authenticated;
grant execute on function public.combine_session_results(uuid) to service_role;
-- Import remains disabled until all scoped paths pass the integration suite.

-- Replacement upload and scoped session paths ship together with this migration.
grant execute on function public.import_warehouse_inventory(text,jsonb,boolean) to authenticated;
