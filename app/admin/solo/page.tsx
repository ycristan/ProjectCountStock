import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase-admin'
import { SoloCreateForm } from './_components/SoloCreateForm'

export default async function AdminSoloPage() {
  const admin = createAdminClient()
  const { data: sessions } = await admin
    .from('solo_sessions')
    .select('id, title, counter_name, access_pin, status, created_at')
    .order('created_at', { ascending: false })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-slate-900">Solo Count</h2>
        <Link href="/admin" className="text-sm text-slate-400 hover:text-slate-900">← Dashboard</Link>
      </div>

      <SoloCreateForm />

      <div className="mt-6 space-y-3">
        {(sessions ?? []).map((s) => (
          <div
            key={s.id}
            className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4"
          >
            <div>
              <div className="font-semibold text-slate-900">{s.title}</div>
              {s.counter_name && <div className="text-sm text-slate-500">{s.counter_name}</div>}
              <div className="text-xs text-slate-400 mt-1">
                PIN: <span className="font-mono font-bold">{s.access_pin}</span>
                {' · '}
                {new Date(s.created_at).toLocaleDateString('en-GB')}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span
                className={`text-xs font-semibold px-2 py-1 rounded-full ${
                  s.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {s.status}
              </span>
              <Link
                href={`/admin/solo/${s.id}`}
                className="text-xs font-semibold text-blue-700 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50"
              >
                View →
              </Link>
            </div>
          </div>
        ))}
        {!(sessions ?? []).length && (
          <p className="text-sm text-slate-400 text-center py-8">No solo sessions yet.</p>
        )}
      </div>
    </div>
  )
}
