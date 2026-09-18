import { isAdmin } from '@/lib/authorization'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchAllRows } from '@/lib/fetch-all-rows'
import type { ItemBusca } from '@/actions/contagem'
import { SoloCountClient } from './_components/SoloCountClient'

export default async function AdminSoloDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!(await isAdmin())) notFound()
  const admin = createAdminClient()

  const { data: session } = await admin.from('solo_sessions')
    .select('id, title, status, assigned_to_counter, restrict_to_list, counter_name, box_tare_g, warehouse_id')
    .eq('id', id).single()
  if (!session) notFound()
  const [inventory, entries, listItemsRaw] = await Promise.all([
    fetchAllRows<{ brand_code: string; brand_name: string; bpu: number; pallet_size: number; weight_avg: number | null; brand_active: boolean }>(
      (from, to) =>
        admin
          .from('inventory_items')
          .select('brand_code, brand_name, bpu, pallet_size, weight_avg, brand_active')
          .eq('warehouse_id', session.warehouse_id)
          .order('brand_code')
          .range(from, to)
    ),
    fetchAllRows<{
      brand_code: string
      brand_name: string
      pallets: number
      cases: number
      units: number
      final_cases: number
      final_units: number
    }>((from, to) =>
      admin
        .from('solo_entries')
        .select('brand_code, brand_name, pallets, cases, units, final_cases, final_units')
        .eq('session_id', id)
        .range(from, to)
    ),
    fetchAllRows<{ brand_code: string }>((from, to) =>
      admin.from('solo_session_items').select('brand_code').eq('session_id', id).range(from, to)
    ),
  ])

  if (!session) notFound()

  const binRows = await fetchAllRows<{ brand_code: string; bin_location: string }>((from, to) => admin.from('item_bin_locations').select('brand_code, bin_location, inventory_items!inner(warehouse_id)').eq('inventory_items.warehouse_id', session.warehouse_id).range(from, to))
  const binsByCode: Record<string, string[]> = {}
  for (const row of binRows) (binsByCode[row.brand_code] ??= []).push(row.bin_location)
  const entryMap = Object.fromEntries(entries.map((e) => [e.brand_code, e]))
  const nameByCode = Object.fromEntries(inventory.map((i) => [i.brand_code, i.brand_name]))
  const listItems = listItemsRaw.map((li) => ({ brand_code: li.brand_code, brand_name: nameByCode[li.brand_code] ?? '' }))

  const items: ItemBusca[] = inventory.map((i) => {
    const e = entryMap[i.brand_code]
    return {
      brand_active: i.brand_active,
      brand_code: i.brand_code,
      brand_name: i.brand_name,
      bpu: i.bpu,
      pallet_size: i.pallet_size,
      weight_avg: i.weight_avg ?? 0,
      box_tare_g: session.box_tare_g,
      bins: binsByCode[i.brand_code] ?? [],
      jaContado: !!e,
      entryExistente: e ? { pallets: e.pallets, cases: e.cases, units: e.units } : null,
    }
  })

  return (
    <SoloCountClient
      sessionId={id}
      title={session.title}
      status={session.status}
      items={items}
      entries={entries.map((e) => ({
        brand_code: e.brand_code,
        brand_name: e.brand_name,
        final_cases: e.final_cases,
        final_units: e.final_units,
      }))}
      assignedToCounter={session.assigned_to_counter}
      restrictToList={session.restrict_to_list}
      counterName={session.counter_name}
      listItems={listItems}
    />
  )
}
