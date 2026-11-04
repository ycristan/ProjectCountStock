-- Performance only: who can read does not change.
-- counter_read called can_read_warehouse() once per row, and Postgres tests it
-- before the admin policy, so admins paid for it too (~350 ms per 1,000-row page,
-- measured on 2026-11-04). The set of readable warehouses is now computed once
-- per query (~4 ms for the same page). Security definer: counters cannot read
-- the warehouses table directly.

create function private.readable_warehouse_ids()
returns uuid[] language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(w.id), '{}')
  from public.warehouses w
  where private.can_read_warehouse(w.id);
$$;
revoke all on function private.readable_warehouse_ids() from public, anon;
grant execute on function private.readable_warehouse_ids() to authenticated;

alter policy counter_read on public.inventory_items
  using (warehouse_id = any ((select private.readable_warehouse_ids())::uuid[]));

alter policy counter_read on public.item_bin_locations
  using (exists (select 1 from public.inventory_items i
    where i.brand_code = item_bin_locations.brand_code
      and i.warehouse_id = any ((select private.readable_warehouse_ids())::uuid[])));
