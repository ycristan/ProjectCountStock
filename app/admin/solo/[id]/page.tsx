import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchAllRows } from '@/lib/fetch-all-rows'
import type { ItemBusca } from '@/actions/contagem'
import { SoloCountClient } from './_components/SoloCountClient'

export default async function AdminSoloDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = createAdminClient()

  const [{ data: session }, inventory, entries] = await Promise.all([
    admin.from('solo_sessions').select('id, title, status').eq('id', id).single(),
    fetchAllRows<{ brand_code: string; brand_name: string; bpu: number; pallet_size: number; weight_avg: number | null }>(
      (from, to) =>
        admin
          .from('inventory_items')
          .select('brand_code, brand_name, bpu, pallet_size, weight_avg')
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
  ])

  if (!session) notFound()

  const entryMap = Object.fromEntries(entries.map((e) => [e.brand_code, e]))

  const items: ItemBusca[] = inventory.map((i) => {
    const e = entryMap[i.brand_code]
    return {
      brand_code: i.brand_code,
      brand_name: i.brand_name,
      bpu: i.bpu,
      pallet_size: i.pallet_size,
      weight_avg: i.weight_avg ?? 0,
      box_tare_g: 300,
      bins: [],
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
    />
  )
}
