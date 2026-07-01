import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase-admin'
import { SoloBuscaClient } from './_components/SoloBuscaClient'

export default async function SoloBuscaPage() {
  const jar = await cookies()
  const sessionId = jar.get('solo_session_id')?.value
  if (!sessionId) redirect('/solo')

  const admin = createAdminClient()
  const [{ data: session }, { data: inventory }, { data: entries }] = await Promise.all([
    admin.from('solo_sessions').select('id, title, counter_name').eq('id', sessionId).eq('status', 'open').maybeSingle(),
    admin.from('inventory_items').select('brand_code, brand_name, bpu, pallet_size, category, category1').order('brand_code'),
    admin.from('solo_entries').select('brand_code, final_cases, final_units').eq('session_id', sessionId),
  ])

  if (!session) redirect('/solo')

  return (
    <SoloBuscaClient
      sessionTitle={session.title}
      counterName={session.counter_name ?? undefined}
      inventory={inventory ?? []}
      initialEntries={entries ?? []}
    />
  )
}
