import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { isAdmin } from '@/lib/authorization'

// Audit Count menu: every team-flow session, with the full history of what each person entered.
export default async function AuditCountPage() {
  if (process.env.TEAM_SETUP_ENABLED !== 'true' || !(await isAdmin())) notFound()
  const db = await createClient()
  const { data: sessions } = await db.from('count_sessions')
    .select('id,status,created_at,warehouses(name),teams!inner(id,team_flows!inner(team_id))')
    .order('created_at', { ascending: false })
  return <section className="space-y-4">
    <h1 className="text-xl font-semibold">Audit Count</h1>
    <p className="text-sm">Every count, edit, weighing, reconciliation, recount, decision and signature of each team session.</p>
    <ul className="space-y-2">{(sessions ?? []).map(s => <li key={s.id} className="border rounded-xl p-3 flex justify-between gap-2">
      <span>{(s.warehouses as unknown as { name: string } | null)?.name ?? 'Warehouse'} — {new Date(s.created_at).toLocaleDateString()}
        {' — '}{s.status === 'fechada' ? 'Closed' : 'Open'}</span>
      <span className="flex gap-3">
        <a className="underline" href={'/api/sessao/' + s.id + '/audit-export'}>Audit Count</a>
        {s.status === 'fechada' && <a className="underline" href={'/api/sessao/' + s.id + '/team-export'}>Final Excel</a>}
      </span>
    </li>)}</ul>
    {!sessions?.length && <p>No team sessions yet.</p>}
  </section>
}
