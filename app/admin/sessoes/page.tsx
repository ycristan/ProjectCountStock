import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'

export default async function SessoesPage() {
  const supabase = await createClient()

  const { data: sessoes } = await supabase
    .from('count_sessions')
    .select('id, created_at, status')
    .order('created_at', { ascending: false })

  return (
    <div>
      <h2 className="text-xl font-semibold text-slate-900 mb-6">Sessões de Contagem</h2>
      {!sessoes || sessoes.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhuma sessão criada ainda.</p>
      ) : (
        <div className="space-y-3">
          {sessoes.map((s) => (
            <div
              key={s.id}
              className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex items-center justify-between"
            >
              <div>
                <div className="text-sm font-medium text-slate-900">
                  {new Date(s.created_at).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">Status: {s.status}</div>
              </div>
              <Link
                href={`/admin/sessao/${s.id}/progresso`}
                className="text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                Ver progresso →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
