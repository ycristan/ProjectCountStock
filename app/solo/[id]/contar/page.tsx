import { notFound, redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'
import type { ItemBusca } from '@/actions/contagem'
import { BuscaClient } from '@/app/(counter)/busca/_components/BuscaClient'
import { lancarSoloContagemCounter } from '@/actions/solo'

export default async function SoloCounterContarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = createAdminClient()

  const { data: session } = await admin
    .from('solo_sessions')
    .select('id, title, access_pin, status, counter_name')
    .eq('id', id)
    .single()

  if (!session || !session.access_pin) notFound()

  const cookieStore = await cookies()
  const pinCookie = cookieStore.get(`solo_pin_${id}`)
  if (!pinCookie || pinCookie.value !== session.access_pin) {
    redirect(`/solo/${id}`)
  }

  if (session.status !== 'open') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-slate-500 text-sm">This session is closed.</p>
      </div>
    )
  }

  const [{ data: inventory }, { data: entries }] = await Promise.all([
    admin.from('inventory_items').select('brand_code, brand_name, bpu, pallet_size, weight_avg').order('brand_code'),
    admin.from('solo_entries').select('brand_code, pallets, cases, units').eq('session_id', id),
  ])

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
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-md mx-auto px-4 pt-6 pb-24">
        <BuscaClient
          items={items}
          onSubmit={lancarSoloContagemCounter.bind(null, id)}
          headerSlot={
            <div className="mb-4">
              <div className="text-xs text-slate-400 uppercase tracking-wide font-semibold">{session.title}</div>
              {session.counter_name && (
                <div className="text-sm text-slate-600">{session.counter_name}</div>
              )}
            </div>
          }
        />
      </div>
    </div>
  )
}
