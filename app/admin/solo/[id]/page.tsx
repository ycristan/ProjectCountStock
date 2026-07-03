import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase-admin'
import type { ItemBusca } from '@/actions/contagem'
import { SoloCountClient } from './_components/SoloCountClient'

export default async function AdminSoloDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = createAdminClient()

  const [{ data: session }, { data: inventory }, { data: entries }] = await Promise.all([
    admin.from('solo_sessions').select('id, title, status').eq('id', id).single(),
    admin.from('inventory_items').select('brand_code, brand_name, bpu, pallet_size, weight_avg').order('brand_code').range(0, 9999), // ponytail: PostgREST caps unranged selects at 1000 rows; inventory has 2000+ items, raise if it passes 10k
    admin.from('solo_entries').select('brand_code, brand_name, pallets, cases, units, final_cases, final_units').eq('session_id', id).range(0, 9999),
  ])

  if (!session) notFound()

  const entryMap = Object.fromEntries((entries ?? []).map((e) => [e.brand_code, e]))

  const items: ItemBusca[] = (inventory ?? []).map((i) => {
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
      entries={(entries ?? []).map((e) => ({
        brand_code: e.brand_code,
        brand_name: e.brand_name,
        final_cases: e.final_cases,
        final_units: e.final_units,
      }))}
    />
  )
}
