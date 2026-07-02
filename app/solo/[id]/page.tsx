import { notFound, redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'
import { PinForm } from './_components/PinForm'

export default async function SoloCounterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = createAdminClient()
  const { data: session } = await admin
    .from('solo_sessions')
    .select('id, title, counter_name, access_pin, status')
    .eq('id', id)
    .single()

  if (!session || !session.access_pin) notFound()

  if (session.status !== 'open') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-slate-500 text-sm">This session is closed.</p>
      </div>
    )
  }

  const cookieStore = await cookies()
  const existing = cookieStore.get(`solo_pin_${id}`)
  if (existing?.value === session.access_pin) {
    redirect(`/solo/${id}/contar`)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-bold text-slate-900 mb-1">{session.title}</h1>
        {session.counter_name && (
          <p className="text-sm text-slate-500 mb-6">Hi, {session.counter_name}</p>
        )}
        <PinForm sessionId={id} />
      </div>
    </div>
  )
}
