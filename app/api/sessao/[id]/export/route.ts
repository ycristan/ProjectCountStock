import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase-server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'admin') {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const { id: sessionId } = await params

  const [{ data: teams }, { data: inventory }] = await Promise.all([
    supabase.from('teams').select('id, team_name').eq('session_id', sessionId).eq('status', 'reconciliada').order('team_name'),
    supabase.from('inventory_items').select('brand_code, brand_name, bpu, category, category1'),
  ])

  const teamIds = (teams ?? []).map((t) => t.id)
  const { data: reconcItems } = await supabase
    .from('reconciliation_items')
    .select('team_id, brand_code, status, contador_1_cases, contador_1_units, contador_2_cases, contador_2_units, independente_cases, independente_units, reconciliated_cases, reconciliated_units')
    .in('team_id', teamIds)

  const invMap = Object.fromEntries((inventory ?? []).map((i) => [i.brand_code, i]))
  const wb = XLSX.utils.book_new()

  // ── Uma aba por equipe ──────────────────────────────────────────────────────
  for (const team of teams ?? []) {
    const items = (reconcItems ?? []).filter((r) => r.team_id === team.id)
    const codes = [...new Set(items.map((r) => r.brand_code))].sort()

    const headers = [
      'Category', 'Category 1', 'Brand Code', 'Brand Name', 'BPU',
      'Cnt 1 Cases', 'Cnt 1 Units',
      'Cnt 2 Cases', 'Cnt 2 Units',
      'Ind Cases', 'Ind Units',
      'Reconciliation Cases', 'Reconciliation Units',
      'Final Cases', 'Final Units',
    ]

    const rows = codes.map((code) => {
      const r = items.find((i) => i.brand_code === code)
      const inv = invMap[code]
      const isResolvido = r?.status === 'resolvido'
      const finalCases = isResolvido ? (r?.reconciliated_cases ?? r?.independente_cases) : r?.independente_cases
      const finalUnits = isResolvido ? (r?.reconciliated_units ?? r?.independente_units) : r?.independente_units
      return [
        inv?.category ?? '', inv?.category1 ?? '', code, inv?.brand_name ?? code, inv?.bpu ?? '',
        r?.contador_1_cases ?? '', r?.contador_1_units ?? '',
        r?.contador_2_cases ?? '', r?.contador_2_units ?? '',
        r?.independente_cases ?? '', r?.independente_units ?? '',
        isResolvido ? (r?.reconciliated_cases ?? '') : '',
        isResolvido ? (r?.reconciliated_units ?? '') : '',
        finalCases ?? '', finalUnits ?? '',
      ]
    })

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    XLSX.utils.book_append_sheet(wb, ws, team.team_name.slice(0, 31))
  }

  // ── Aba Consolidado ─────────────────────────────────────────────────────────
  const teamList = teams ?? []
  const reconcMap: Record<string, Record<string, typeof reconcItems extends (infer T)[] | null ? T : never>> = {}
  for (const r of reconcItems ?? []) {
    if (!reconcMap[r.team_id]) reconcMap[r.team_id] = {}
    reconcMap[r.team_id][r.brand_code] = r
  }

  const allCodes = [...new Set((reconcItems ?? []).map((r) => r.brand_code))].sort()

  const h1 = ['Brand Name', 'BPU',
    ...teamList.flatMap((t) => [t.team_name, '', '', '', '', '', '', '']),
    'MERGED COUNT', '',
  ]
  const h2 = ['', '',
    ...teamList.flatMap(() => ['INDEPENDENT', '', 'COUNT 1', '', 'COUNT 2', '', 'RECONCILIATION*', '']),
    'CASES', 'UNITS',
  ]
  const h3 = ['', '',
    ...teamList.flatMap(() => ['Cases', 'Units', 'Cases', 'Units', 'Cases', 'Units', 'Cases', 'Units']),
    '', '',
  ]

  const consolidatedRows = allCodes.map((code) => {
    const inv = invMap[code]
    const bpu = inv?.bpu ?? 1
    let totalUnits = 0

    const teamCols = teamList.flatMap((t) => {
      const r = reconcMap[t.id]?.[code]
      if (!r) return ['', '', '', '', '', '', '', '']
      const isResolvido = r.status === 'resolvido'
      const contribCases = isResolvido ? (r.reconciliated_cases ?? r.independente_cases ?? 0) : (r.independente_cases ?? 0)
      const contribUnits = isResolvido ? (r.reconciliated_units ?? r.independente_units ?? 0) : (r.independente_units ?? 0)
      totalUnits += contribCases * bpu + contribUnits
      return [
        r.independente_cases ?? '—', r.independente_units ?? '—',
        r.contador_1_cases ?? '—', r.contador_1_units ?? '—',
        r.contador_2_cases ?? '—', r.contador_2_units ?? '—',
        isResolvido ? (r.reconciliated_cases ?? '—') : '—',
        isResolvido ? (r.reconciliated_units ?? '—') : '—',
      ]
    })

    const mergedCases = Math.floor(totalUnits / bpu)
    const mergedUnits = totalUnits % bpu

    return [inv?.brand_name ?? code, bpu, ...teamCols, mergedCases, mergedUnits]
  })

  const wsConsolidado = XLSX.utils.aoa_to_sheet([h1, h2, h3, ...consolidatedRows])
  XLSX.utils.book_append_sheet(wb, wsConsolidado, 'Consolidado')

  // ponytail: type:'array' retorna Uint8Array, compatível com BodyInit
  const buf: Uint8Array = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })

  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="contagem-${sessionId.slice(0, 8)}.xlsx"`,
    },
  })
}
