import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase-admin'
import { SoloSessionActions } from './_components/SoloSessionActions'

export default async function AdminSoloDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = createAdminClient()

  const [{ data: session }, { data: entries }, { data: inventory }] = await Promise.all([
    admin.from('solo_sessions').select('id, title, counter_name, access_pin, status, created_at').eq('id', id).single(),
    admin.from('solo_entries').select('brand_code, brand_name, final_cases, final_units, counted_at').eq('session_id', id).order('counted_at', { ascending: false }),
    admin.from('inventory_items').select('brand_code, category, category1'),
  ])

  if (!session) notFound()

  const invMap = Object.fromEntries((inventory ?? []).map((i) => [i.brand_code, i]))

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/solo" className="text-slate-400 hover:text-slate-900 text-sm">← Solo Count</Link>
        <span className="text-slate-300">/</span>
        <h2 className="text-xl font-semibold text-slate-900">{session.title}</h2>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          {session.counter_name && (
            <div className="text-sm text-slate-600">Counter: <strong>{session.counter_name}</strong></div>
          )}
          <div className="text-sm text-slate-600">
            PIN: <span className="font-mono font-bold">{session.access_pin}</span>
            {' — share this with the counter: '}
            <span className="font-mono text-blue-700">/solo</span>
          </div>
          <div className="text-sm text-slate-600">
            Created: {new Date(session.created_at).toLocaleDateString('en-GB')}
          </div>
          <div className="text-sm">
            Status:{' '}
            <span className={`font-semibold ${session.status === 'open' ? 'text-green-700' : 'text-slate-500'}`}>
              {session.status}
            </span>
          </div>
        </div>
        <SoloSessionActions sessionId={id} status={session.status} />
      </div>

      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-900">{(entries ?? []).length} items counted</h3>
        <a
          href={`/api/solo/${id}/export`}
          className="text-sm font-semibold text-slate-700 border border-slate-300 hover:bg-slate-50 rounded-xl px-4 py-2"
        >
          ↓ Export Excel
        </a>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Category</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Brand Code</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Brand Name</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Cases</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Units</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!(entries ?? []).length ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-400">No entries yet.</td>
              </tr>
            ) : (
              (entries ?? []).map((e) => {
                const inv = invMap[e.brand_code]
                return (
                  <tr key={e.brand_code} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-xs text-slate-500">{inv?.category ?? '—'}</td>
                    <td className="px-4 py-3 font-bold text-slate-700">{e.brand_code}</td>
                    <td className="px-4 py-3 text-slate-600">{e.brand_name ?? '—'}</td>
                    <td className="px-4 py-3 text-center font-mono">{e.final_cases}</td>
                    <td className="px-4 py-3 text-center font-mono">{e.final_units}</td>
                    <td className="px-4 py-3 text-right text-xs text-slate-400">
                      {new Date(e.counted_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
