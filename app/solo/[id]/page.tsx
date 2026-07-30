import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchAllRows } from '@/lib/fetch-all-rows'
import type { ItemBusca } from '@/actions/contagem'
import { SoloCounterClient } from './_components/SoloCounterClient'

export default async function SoloCounterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'counter' || user.user_metadata?.is_solo_counter !== true) {
    notFound()
  }

  const admin = createAdminClient()
  const { data: session } = await admin
    .from('solo_sessions')
    .select('id, title, status, assigned_to_counter, restrict_to_list, counter_name')
    .eq('id', id)
    .single()

  if (!session || !session.assigned_to_counter || session.status !== 'open') notFound()

  const [inventory, entries, listItems] = await Promise.all([
    fetchAllRows<{ brand_code: string; brand_name: string; bpu: number; pallet_size: number; weight_avg: number | null }>(
      (from, to) =>
        admin
          .from('inventory_items')
          .select('brand_code, brand_name, bpu, pallet_size, weight_avg')
          .eq('brand_active', true)
          .order('brand_code')
          .range(from, to)
    ),
    fetchAllRows<{ brand_code: string; pallets: number; cases: number; units: number }>((from, to) =>
      admin.from('solo_entries').select('brand_code, pallets, cases, units').eq('session_id', id).range(from, to)
    ),
    session.restrict_to_list
      ? fetchAllRows<{ brand_code: string }>((from, to) =>
          admin.from('solo_session_items').select('brand_code').eq('session_id', id).range(from, to)
        )
      : Promise.resolve([] as { brand_code: string }[]),
  ])

  const allowedCodes = session.restrict_to_list ? new Set(listItems.map((i) => i.brand_code)) : null
  const entryMap = Object.fromEntries(entries.map((e) => [e.brand_code, e]))

  const items: ItemBusca[] = inventory
    .filter((i) => !allowedCodes || allowedCodes.has(i.brand_code))
    .map((i) => {
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

  return <SoloCounterClient sessionId={id} title={session.title} counterName={session.counter_name} items={items} />
}
