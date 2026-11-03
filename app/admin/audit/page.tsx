import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { isAdmin } from '@/lib/authorization'
import { PageTop, Tag, buttonClass, cardClass } from '@/components/ui'

// Audit Count menu: every team-flow session, with the full history of what each person entered.
export default async function AuditCountPage() {
  if (process.env.TEAM_SETUP_ENABLED !== 'true' || !(await isAdmin())) notFound()
  const db = await createClient()
  const { data: sessions } = await db.from('count_sessions')
    .select('id,status,created_at,warehouses(name),teams!inner(id,team_flows!inner(team_id))')
    .order('created_at', { ascending: false })
  return <section>
    <PageTop back={{ href: '/admin', label: 'Home' }} title="Audit Count" />
    <p className="m-0 mb-4 max-w-prose text-[15px] text-ink-2">Every count, edit, weighing, reconciliation, recount, decision and signature of each team session.</p>
    <ul className="m-0 flex list-none flex-col gap-3 p-0">{(sessions ?? []).map(s => <li key={s.id} className={cardClass + ' flex flex-wrap items-center justify-between gap-3 p-3.5'}>
      <div className="flex min-w-0 flex-col gap-1">
        <strong className="text-base">{(s.warehouses as unknown as { name: string } | null)?.name ?? 'Warehouse'}</strong>
        <span className="flex items-center gap-2 text-[13px] text-ink-2">{new Date(s.created_at).toLocaleDateString()}
          <Tag tone={s.status === 'fechada' ? 'neutral' : 'ok'}>{s.status === 'fechada' ? 'Closed' : 'Open'}</Tag></span>
      </div>
      <div className="flex flex-wrap gap-2">
        <a className={buttonClass('outline', 'sm') + ' no-underline'} href={'/api/sessao/' + s.id + '/audit-export'}>Audit Count</a>
        {s.status === 'fechada' && <a className={buttonClass('outline', 'sm') + ' no-underline'} href={'/api/sessao/' + s.id + '/team-export'}>Final Excel</a>}
      </div>
    </li>)}</ul>
    {!sessions?.length && <p className="m-0 text-[15px] text-ink-2">No team sessions yet.</p>}
  </section>
}
