import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { sessionHref } from '@/lib/session-href'
import { buttonClass } from '@/components/ui'
import { Icon, type IconName } from '@/components/icons'
import { LocalTime } from '@/components/local-time'

// A navigation sign: icon plate, name, one line of what it does, and a live figure.
function Sign({ href, icon, title, text, figure, unit }: {
  href: string; icon: IconName; title: string; text: string; figure?: number | null; unit?: string
}) {
  return <Link href={href} className="flex items-center gap-3.5 rounded-md border-2 border-ink bg-surface p-3.5 text-ink no-underline hover:bg-[#FFFBEA] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-info">
    <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-ink text-safety"><Icon name={icon} size={26} /></span>
    <span className="flex min-w-0 flex-grow flex-col gap-0.5">
      <span className="font-display text-2xl leading-tight font-bold uppercase">{title}</span>
      <span className="text-sm text-ink-2">{text}</span>
    </span>
    {figure !== undefined && <span className="flex flex-col items-end">
      <span className="font-display text-[32px] leading-none font-bold">{figure ?? '—'}</span>
      <span className="text-xs text-ink-2">{unit}</span>
    </span>}
  </Link>
}

export default async function AdminPage() {
  const supabase = await createClient()
  const [open, closed, solo, items, warehouses] = await Promise.all([
    supabase.from('count_sessions').select('id, created_at, warehouses(name), teams(id, team_flows(team_id))')
      .neq('status', 'fechada').order('created_at', { ascending: false }),
    supabase.from('count_sessions').select('id', { count: 'exact', head: true }).eq('status', 'fechada'),
    supabase.from('solo_sessions').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    supabase.from('inventory_items').select('brand_code', { count: 'exact', head: true }),
    supabase.from('warehouses').select('id', { count: 'exact', head: true }),
  ])
  const sessions = open.data ?? []
  const live = sessions[0]
  const liveTeams = live?.teams.length ?? 0
  const audit = process.env.TEAM_SETUP_ENABLED === 'true'

  return <div className="flex flex-col gap-7">
    <h1 className="m-0 font-display text-[44px] leading-none font-extrabold uppercase">Home</h1>

    {live ? <section aria-label="Count in progress" className="overflow-hidden rounded-md border-2 border-ink bg-surface">
      <div aria-hidden="true" className="h-2.5 bg-[repeating-linear-gradient(135deg,var(--color-safety)_0_14px,var(--color-ink)_14px_28px)]" />
      <div className="flex flex-wrap items-center gap-x-7 gap-y-4 p-5">
        <div className="flex min-w-64 flex-grow flex-col gap-1">
          <span className="flex items-center gap-2 text-sm font-semibold text-ok"><span className="cs-live size-2.5 rounded-full bg-ok" />Count in progress</span>
          <strong className="font-display text-3xl leading-tight font-bold uppercase">
            {/* many-to-one: one warehouse object, typed as array by the client */}
            {(live.warehouses as unknown as { name: string } | null)?.name ?? 'Session'}, started <LocalTime iso={live.created_at} />
          </strong>
          {sessions.length > 1 && <span className="text-[15px] text-ink-2">{sessions.length - 1} more session{sessions.length > 2 ? 's' : ''} in progress.</span>}
        </div>
        <div className="flex flex-col">
          <span className="font-display text-4xl leading-none font-bold">{liveTeams}</span>
          <span className="text-[13px] text-ink-2">team{liveTeams === 1 ? '' : 's'}</span>
        </div>
        <Link href={sessionHref(live.id, live.teams)} className={buttonClass('primary', 'md') + ' no-underline'}><Icon name="live" size={20} />Open live count</Link>
      </div>
    </section> : <section aria-label="No count in progress" className="flex flex-wrap items-center gap-4 rounded-md border border-line bg-surface p-5">
      <span className="flex-grow text-[15px] text-ink-2">No team count in progress.</span>
      <Link href="/admin/sessao" className={buttonClass('primary', 'md') + ' no-underline'}><Icon name="newSession" size={20} />New session</Link>
    </section>}

    <div className="grid gap-7 md:grid-cols-2">
      <section className="flex flex-col gap-3">
        <h2 className="m-0 border-b-2 border-ink pb-1.5 font-display text-2xl font-bold uppercase">Counting</h2>
        <Sign href="/admin/sessao" icon="newSession" title="New session" text="Team count or solo count" />
        <Sign href="/admin/sessoes" icon="live" title="Sessions" text="Follow, close or delete sessions" figure={open.error ? null : sessions.length} unit="in progress" />
        <Sign href={live ? `/admin/sessao/${live.id}/equipes` : '/admin/sessao'} icon="teams" title="Teams" text="Counters, PIN cards, rename" figure={live ? liveTeams : undefined} unit="this session" />
        <Sign href="/admin/solo" icon="solo" title="Solo count" text="Counts by one person" figure={solo.count} unit="open" />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="m-0 border-b-2 border-ink pb-1.5 font-display text-2xl font-bold uppercase">Inventory</h2>
        <Sign href="/admin/inventario" icon="inventory" title="Products" text="Search, edit BINs, activate or deactivate"
          figure={items.count} unit={warehouses.count == null ? 'items' : `items in ${warehouses.count} warehouse${warehouses.count === 1 ? '' : 's'}`} />
        <Sign href="/admin/upload" icon="spreadsheet" title="Import spreadsheet" text="Check an .xlsx, then confirm the import" />
        {audit && <Sign href="/admin/audit" icon="audit" title="Audit Count" text="Final Excel and audit report per session" figure={closed.count} unit="closed sessions" />}
      </section>
    </div>
  </div>
}
