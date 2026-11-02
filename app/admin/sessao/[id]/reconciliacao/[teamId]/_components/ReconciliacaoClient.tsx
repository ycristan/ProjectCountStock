'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Notice, PageTop, Tag, cardClass, segmentClass, segmentGroupClass, tableWrapClass, thClass } from '@/components/ui'
import { createClient } from '@/lib/supabase-client'

type ReconcItem = {
  id: string
  brand_code: string
  brand_name: string
  bin_location: string | null
  status: 'combinado' | 'discrepancia' | 'resolvido'
  contador_1_cases: number | null
  contador_1_units: number | null
  contador_2_cases: number | null
  contador_2_units: number | null
  independente_cases: number | null
  independente_units: number | null
  reconciliated_cases: number | null
  reconciliated_units: number | null
}

type Props = {
  sessionId: string
  teamId: string
  teamName: string
  teamStatus: string
  items: ReconcItem[]
  counterNames: { contador_1: string; contador_2: string; independente: string }
}

function formatVal(cases: number | null, units: number | null): string {
  if (cases === null) return '—'
  return `${cases}+${units}`
}

export function ReconciliacaoClient({
  sessionId,
  teamId,
  teamName,
  teamStatus,
  items,
  counterNames,
}: Props) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'discrepancias' | 'combinados'>('discrepancias')

  useEffect(() => {
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null
    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token
      if (!token) return
      supabase.realtime.setAuth(token)
      channel = supabase
        .channel('reconciliacao-admin')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reconciliation_items', filter: `team_id=eq.${teamId}` }, () => router.refresh())
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'teams', filter: `id=eq.${teamId}` }, () => router.refresh())
        .subscribe()
    })
    return () => { if (channel) supabase.removeChannel(channel) }
  }, [teamId, router])

  const combinados = items.filter((i) => i.status === 'combinado')
  const discrepancias = items.filter((i) => i.status === 'discrepancia')
  const resolvidos = items.filter((i) => i.status === 'resolvido')
  const isReconciliada = teamStatus === 'reconciliada'

  const tabItems = activeTab === 'discrepancias' ? [...discrepancias, ...resolvidos] : combinados

  const stat = (value: number, label: string, color = '') => (
    <div className={cardClass + ' flex flex-1 flex-col p-3.5'}>
      <span className={'font-display text-[34px] leading-none font-bold ' + color}>{value}</span>
      <span className="text-[13px] text-ink-2">{label}</span>
    </div>
  )

  return (
    <div>
      <PageTop back={{ href: `/admin/sessao/${sessionId}/progresso`, label: 'Progress' }}
        kicker={`Independent: ${counterNames.independente}`}
        title={<span className="flex flex-wrap items-center gap-3">Reconciliation — {teamName}{isReconciliada && <Tag tone="ok">Reconciled</Tag>}</span>} />

      <div className="mb-4 flex gap-3">
        {stat(combinados.length, 'Matched', 'text-ok')}
        {stat(discrepancias.length, 'Remaining discrepancies', discrepancias.length > 0 ? 'text-alert' : '')}
        {stat(resolvidos.length, 'Reconciled', 'text-info')}
      </div>

      {!isReconciliada && (
        <div className="mb-4"><Notice tone="warn"><strong>{counterNames.independente}</strong> is carrying out reconciliation of discrepancy items on their device.</Notice></div>
      )}

      <div role="group" aria-label="Items" className={segmentGroupClass + ' mb-4 w-fit'}>
        <button type="button" aria-pressed={activeTab === 'discrepancias'} onClick={() => setActiveTab('discrepancias')} className={segmentClass(activeTab === 'discrepancias')}>
          Discrepancies ({discrepancias.length} remaining)
        </button>
        <button type="button" aria-pressed={activeTab === 'combinados'} onClick={() => setActiveTab('combinados')} className={segmentClass(activeTab === 'combinados')}>
          Matched ({combinados.length})
        </button>
      </div>

      <div className={tableWrapClass}>
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="bg-ink text-ground">
              <th className={thClass}>Item</th>
              <th className={thClass + ' text-right'}>{counterNames.contador_1} (C1)</th>
              <th className={thClass + ' text-right'}>{counterNames.contador_2} (C2)</th>
              <th className={thClass + ' text-right'}>{counterNames.independente} (Ind)</th>
              {activeTab === 'discrepancias' && <th className={thClass + ' text-right'}>Reconciled</th>}
            </tr>
          </thead>
          <tbody>
            {tabItems.map((item) => (
              <tr key={item.id} className={'border-t border-ground-2 ' + (item.status === 'discrepancia' ? 'bg-diff/10' : '')}>
                <td className="px-3 py-2.5">
                  <span className="font-mono text-xs font-semibold text-ink-2">{item.brand_code}</span><br />
                  <strong>{item.brand_name}</strong>
                  {item.bin_location && <><br /><span className="text-xs text-ink-2">{item.bin_location}</span></>}
                </td>
                <td className="px-3 py-2.5 text-right font-display text-xl font-bold">{formatVal(item.contador_1_cases, item.contador_1_units)}</td>
                <td className="px-3 py-2.5 text-right font-display text-xl font-bold">{formatVal(item.contador_2_cases, item.contador_2_units)}</td>
                <td className="px-3 py-2.5 text-right font-display text-xl font-bold">{formatVal(item.independente_cases, item.independente_units)}</td>
                {activeTab === 'discrepancias' && (
                  <td className="px-3 py-2.5 text-right">
                    {item.status === 'resolvido'
                      ? <span className="font-display text-xl font-bold text-ok">{formatVal(item.reconciliated_cases, item.reconciliated_units)}</span>
                      : <Tag tone="diff">Pending</Tag>}
                  </td>
                )}
              </tr>
            ))}
            {tabItems.length === 0 && (
              <tr>
                <td colSpan={activeTab === 'discrepancias' ? 5 : 4} className="px-3 py-6 text-center text-[15px] text-ink-2">
                  {activeTab === 'discrepancias' ? 'No pending discrepancies.' : 'No matched items.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
