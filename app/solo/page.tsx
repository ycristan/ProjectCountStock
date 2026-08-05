import Link from 'next/link'
import { listarSoloSessoesAtribuidas } from '@/actions/solo'

export default async function SoloListPage() {
  const sessions = await listarSoloSessoesAtribuidas()

  return (
    <div>
      <h2 className="text-xl font-semibold text-slate-900 mb-4">Solo Counts assigned to you</h2>
      <div className="space-y-3">
        {sessions.map((s) => (
          <Link
            key={s.id}
            href={`/solo/${s.id}`}
            className="block bg-white border border-slate-200 rounded-xl p-4 hover:bg-slate-50"
          >
            <div className="font-semibold text-slate-900">{s.title}</div>
            {s.counter_name && (
              <div className="text-xs text-slate-400 mt-1">Counted by {s.counter_name}</div>
            )}
          </Link>
        ))}
        {sessions.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-8">No solo counts assigned to you right now.</p>
        )}
      </div>
    </div>
  )
}
