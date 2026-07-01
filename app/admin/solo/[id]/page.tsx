import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase-admin'
import { SoloCountClient } from './_components/SoloCountClient'

export default async function AdminSoloDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = createAdminClient()

  const [{ data: session }, { data: inventory }, { data: entries }] = await Promise.all([
    admin.from('solo_sessions').select('id, title, status').eq('id', id).single(),
    admin.from('inventory_items').select('brand_code, brand_name, bpu, pallet_size').order('brand_code'),
    admin.from('solo_entries').select('brand_code, brand_name, final_cases, final_units').eq('session_id', id),
  ])

  if (!session) notFound()

  return (
    <SoloCountClient
      sessionId={id}
      title={session.title}
      status={session.status}
      inventory={inventory ?? []}
      initialEntries={entries ?? []}
    />
  )
}
