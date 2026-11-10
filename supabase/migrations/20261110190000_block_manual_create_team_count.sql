-- Yuri decided (10/11): manual product creation is blocked while a team count is open in
-- that same warehouse. Other warehouses and solo counts are not affected. Same function as
-- 20261110100000, with only the new check; no existing rows are changed.
create or replace function public.save_inventory_item(
  p_warehouse_id uuid,
  p_brand_code text,
  p_item jsonb,
  p_create boolean default false
)
returns void language plpgsql security invoker set search_path = ''
as $$
declare
  v_code text := btrim(coalesce(p_brand_code, ''));
  v_where text;
  field text;
  bin jsonb;
begin
  if not public.is_admin() then raise exception 'Unauthorized'; end if;
  if v_code = '' then raise exception 'Brand Code is required'; end if;
  if p_warehouse_id is null then raise exception 'Warehouse is required'; end if;
  if jsonb_typeof(p_item) is distinct from 'object' then raise exception 'Invalid inventory row'; end if;
  -- Same rules as the spreadsheet import (import_warehouse_inventory).
  foreach field in array array['brand_name', 'category', 'category1'] loop
    if jsonb_typeof(p_item -> field) is distinct from 'string' or btrim(p_item ->> field) = '' then
      raise exception 'Required inventory text is missing: %', field;
    end if;
  end loop;
  foreach field in array array['bpu', 'pallet_size', 'weight_avg'] loop
    if jsonb_typeof(p_item -> field) is distinct from 'number' then
      raise exception 'Invalid inventory number: %', field;
    end if;
    if (p_item ->> field)::numeric < 0 then raise exception 'Negative inventory number: %', field; end if;
  end loop;
  if (p_item ->> 'bpu')::numeric < 1
    or (p_item ->> 'bpu')::numeric <> trunc((p_item ->> 'bpu')::numeric)
    or (p_item ->> 'bpu')::numeric > 2147483647 then raise exception 'BPU must be a positive integer'; end if;
  if (p_item ->> 'pallet_size')::numeric <> trunc((p_item ->> 'pallet_size')::numeric)
    or (p_item ->> 'pallet_size')::numeric > 2147483647 then raise exception 'Pallet Size must be a non-negative integer'; end if;
  if jsonb_typeof(p_item -> 'bins') is distinct from 'array' then raise exception 'BINs must be an array'; end if;
  if jsonb_array_length(p_item -> 'bins') > 4 then raise exception 'At most four BINs are allowed'; end if;
  for bin in select value from jsonb_array_elements(p_item -> 'bins') loop
    if jsonb_typeof(bin) is distinct from 'string' or btrim(bin #>> '{}') = '' then
      raise exception 'BIN must be a non-empty string';
    end if;
  end loop;

  if p_create then
    -- Same lock as opening/closing a count session, so a session cannot open between check and insert.
    perform pg_catalog.pg_advisory_xact_lock(6969, 1);
    if exists (select 1 from public.count_sessions where warehouse_id = p_warehouse_id and status <> 'fechada') then
      raise exception 'New products cannot be added while a team count is open in this warehouse';
    end if;
    -- Brand Code is unique in the whole application, inactive products included.
    select w.name into v_where from public.inventory_items i
      join public.warehouses w on w.id = i.warehouse_id where i.brand_code = v_code;
    if found then raise exception 'Brand Code % already exists in %', v_code, v_where; end if;
    begin
      insert into public.inventory_items(brand_code, brand_name, bpu, pallet_size, weight_avg,
        category, category1, brand_active, warehouse_id)
      values (v_code, btrim(p_item ->> 'brand_name'), (p_item ->> 'bpu')::integer,
        (p_item ->> 'pallet_size')::integer, (p_item ->> 'weight_avg')::numeric,
        btrim(p_item ->> 'category'), btrim(p_item ->> 'category1'), true, p_warehouse_id);
    exception when unique_violation then
      -- Two administrators creating the same code at once: the second one loses.
      raise exception 'Brand Code % already exists', v_code;
    end;
  else
    update public.inventory_items set
      brand_name = btrim(p_item ->> 'brand_name'),
      bpu = (p_item ->> 'bpu')::integer,
      pallet_size = (p_item ->> 'pallet_size')::integer,
      weight_avg = (p_item ->> 'weight_avg')::numeric,
      category = btrim(p_item ->> 'category'),
      category1 = btrim(p_item ->> 'category1')
    where brand_code = v_code and warehouse_id = p_warehouse_id;
    if not found then raise exception 'Product not found in this warehouse'; end if;
    delete from public.item_bin_locations where brand_code = v_code;
  end if;

  insert into public.item_bin_locations(brand_code, bin_location)
  select distinct v_code, btrim(value #>> '{}') from jsonb_array_elements(p_item -> 'bins');
end;
$$;

revoke all on function public.save_inventory_item(uuid,text,jsonb,boolean) from public, anon, service_role;
grant execute on function public.save_inventory_item(uuid,text,jsonb,boolean) to authenticated;
