import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

// ponytail: mesma regra da tela (CombinacaoClient.getMerged) — valor oficial do item
// por equipe: resolvido → reconciliação; senão → Contador 1 (C1=C2, independente não conta mais).
// independente_cases só é usado se preenchido (fluxo legado); hoje vem NULL.
type ReconcRow = {
  status: string
  contador_1_cases: number | null
  contador_1_units: number | null
  independente_cases: number | null
  independente_units: number | null
  reconciliated_cases: number | null
  reconciliated_units: number | null
}

function official(r: ReconcRow): { cases: number; units: number } {
  if (r.status === 'resolvido')
    return { cases: r.reconciliated_cases ?? 0, units: r.reconciliated_units ?? 0 }
  if (r.independente_cases !== null)
    return { cases: r.independente_cases, units: r.independente_units ?? 0 }
  return { cases: r.contador_1_cases ?? 0, units: r.contador_1_units ?? 0 }
}

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

  const [{ data: reconcItems }, { data: { users } }] = await Promise.all([
    supabase
      .from('reconciliation_items')
      .select('team_id, brand_code, status, contador_1_cases, contador_1_units, contador_2_cases, contador_2_units, independente_cases, independente_units, reconciliated_cases, reconciliated_units')
      .in('team_id', teamIds),
    createAdminClient().auth.admin.listUsers({ perPage: 1000 }),
  ])

  const invMap = Object.fromEntries((inventory ?? []).map((i) => [i.brand_code, i]))

  // countersMap[teamId][role] = full_name (from auth.users metadata)
  const countersMap: Record<string, Record<string, string>> = {}
  for (const u of users ?? []) {
    const tid = u.user_metadata?.team_id as string
    const role = u.user_metadata?.counter_role as string
    const name = u.user_metadata?.full_name as string
    if (tid && role && teamIds.includes(tid)) {
      if (!countersMap[tid]) countersMap[tid] = {}
      countersMap[tid][role] = name ?? ''
    }
  }

  function roleLabel(teamId: string, role: 'independente' | 'contador_1' | 'contador_2', fallback: string) {
    const name = countersMap[teamId]?.[role]
    return name ? `${fallback}: ${name}` : fallback
  }

  const wb = XLSX.utils.book_new()

  for (const team of teams ?? []) {
    const items = (reconcItems ?? []).filter((r) => r.team_id === team.id)
    const codes = [...new Set(items.map((r) => r.brand_code))].sort()

    const ind = roleLabel(team.id, 'independente', 'Independent')
    const c1  = roleLabel(team.id, 'contador_1',   'Count 1')
    const c2  = roleLabel(team.id, 'contador_2',   'Count 2')

    const headers = [
      'Category', 'Category 1', 'Brand Code', 'Brand Name', 'BPU',
      `${c1} Cases`, `${c1} Units`,
      `${c2} Cases`, `${c2} Units`,
      `${ind} Cases`, `${ind} Units`,
      'Reconciliation Cases', 'Reconciliation Units',
      'Final Cases', 'Final Units',
    ]

    const rows = codes.map((code) => {
      const r = items.find((i) => i.brand_code === code)
      const inv = invMap[code]
      const isResolvido = r?.status === 'resolvido'
      const fin = r ? official(r) : null
      return [
        inv?.category ?? '', inv?.category1 ?? '', code, inv?.brand_name ?? code, inv?.bpu ?? '',
        r?.contador_1_cases ?? '', r?.contador_1_units ?? '',
        r?.contador_2_cases ?? '', r?.contador_2_units ?? '',
        r?.independente_cases ?? '', r?.independente_units ?? '',
        isResolvido ? (r?.reconciliated_cases ?? '') : '',
        isResolvido ? (r?.reconciliated_units ?? '') : '',
        fin?.cases ?? '', fin?.units ?? '',
      ]
    })

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    XLSX.utils.book_append_sheet(wb, ws, team.team_name.slice(0, 31))
  }

  const teamList = teams ?? []
  const reconcMap: Record<string, Record<string, typeof reconcItems extends (infer T)[] | null ? T : never>> = {}
  for (const r of reconcItems ?? []) {
    if (!reconcMap[r.team_id]) reconcMap[r.team_id] = {}
    reconcMap[r.team_id][r.brand_code] = r
  }

  const allCodes = [...new Set((reconcItems ?? []).map((r) => r.brand_code))].sort()

  const h1 = ['Category', 'Category 1', 'Brand Code', 'Brand Name', 'BPU',
    ...teamList.flatMap((t) => [t.team_name, '', '', '', '', '', '', '']),
    'MERGED COUNT', '',
  ]
  const h2 = ['', '', '', '', '',
    ...teamList.flatMap((t) => [
      roleLabel(t.id, 'independente', 'Independent'), '',
      roleLabel(t.id, 'contador_1',   'Count 1'),     '',
      roleLabel(t.id, 'contador_2',   'Count 2'),     '',
      'RECONCILIATION*', '',
    ]),
    'CASES', 'UNITS',
  ]
  const h3 = ['', '', '', '', '',
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
      const off = official(r)
      totalUnits += off.cases * bpu + off.units
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

    return [inv?.category ?? '', inv?.category1 ?? '', code, inv?.brand_name ?? code, bpu, ...teamCols, mergedCases, mergedUnits]
  })

  const wsConsolidado = XLSX.utils.aoa_to_sheet([h1, h2, h3, ...consolidatedRows])
  XLSX.utils.book_append_sheet(wb, wsConsolidado, 'Consolidado')

  // ponytail: TS 5.7 tornou Uint8Array genérico — cast necessário para BodyInit
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as unknown as BodyInit

  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="contagem-${sessionId.slice(0, 8)}.xlsx"`,
    },
  })
}
