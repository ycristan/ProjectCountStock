// Final team-count workbook (block 12, columns approved by Yuri on 2026-10-07):
// one sheet per team, "Consolidado" with each team's final and the total, and
// "Template Import Reconc" unchanged from the legacy export. Pure: rows only.

type Cell = string | number
export type Sheet = { name: string; rows: Cell[][] }

export type TeamReportItem = {
  brand_code: string; brand_name: string; category: string | null; category1: string | null; bpu: number
  quantity_units: number; resolution: 'equal' | 'weight_tolerance' | 'reconciled'
  source_counts: { membership_id: string; quantity_units: number }[]
}
export type TeamReport = {
  teamId: string; name: string
  participants: { membership_id: string; name: string; role: string; order: number }[]
  items: TeamReportItem[]; recounted: string[]
}
export type ConsolidatedItem = {
  brand_code: string; brand_name: string; category: string | null; category1: string | null; bpu: number
  brand_active: boolean; final_cases: number; final_units: number; uncounted: boolean
  team_quantities: { teamId: string; quantity: number }[]
}

const split = (quantity: number, bpu: number): Cell[] => [Math.floor(quantity / bpu), quantity % bpu]
const RESOLUTION = { equal: 'Equal', weight_tolerance: 'Weight tolerance', reconciled: 'Reconciled' } as const

// Excel sheet names: max 31 chars, no []:*?/\ and unique in the workbook.
function sheetNames(names: string[]) {
  const used = new Set(['consolidado', 'template import reconc'])
  return names.map(raw => {
    const base = raw.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Team'
    let name = base
    for (let n = 2; used.has(name.toLowerCase()); n++) name = base.slice(0, 31 - String(n).length - 1) + ' ' + n
    used.add(name.toLowerCase())
    return name
  })
}

export function teamSessionSheets(teams: TeamReport[], consolidated: ConsolidatedItem[]): Sheet[] {
  const names = sheetNames(teams.map(t => t.name))
  const byCode = (a: { brand_code: string }, b: { brand_code: string }) => a.brand_code.localeCompare(b.brand_code)
  const teamSheets = teams.map((team, index): Sheet => {
    const counters = team.participants.filter(p => p.role === 'counter').sort((a, b) => a.order - b.order)
    const header = ['Category', 'Category 1', 'Brand Code', 'Brand Name', 'BPU',
      ...counters.flatMap(c => ['Counter ' + c.order + ' — ' + c.name + ' Cases', 'Counter ' + c.order + ' — ' + c.name + ' Units']),
      'Reconciled Cases', 'Reconciled Units', 'Final Cases', 'Final Units', 'Resolution']
    const rows = [...team.items].sort(byCode).map((item): Cell[] => {
      const counts = counters.flatMap((c): Cell[] => {
        const source = item.source_counts.find(s => s.membership_id === c.membership_id)
        return source ? split(source.quantity_units, item.bpu) : ['', '']
      })
      const final = split(item.quantity_units, item.bpu)
      const recounted = team.recounted.includes(item.brand_code)
      return [item.category ?? '', item.category1 ?? '', item.brand_code, item.brand_name, item.bpu, ...counts,
        ...(item.resolution === 'reconciled' ? final : ['', '']), ...final,
        recounted ? 'Recounted' : RESOLUTION[item.resolution]]
    })
    return { name: names[index], rows: [header, ...rows] }
  })
  const lines = [...consolidated].sort(byCode)
  const consolidatedSheet: Sheet = { name: 'Consolidado', rows: [
    ['Category', 'Category 1', 'Brand Code', 'Brand Name', 'BPU', 'Status',
      ...teams.flatMap(t => [t.name + ' Cases', t.name + ' Units']), 'TOTAL Cases', 'TOTAL Units', 'Note'],
    ...lines.map((item): Cell[] => [item.category ?? '', item.category1 ?? '', item.brand_code, item.brand_name, item.bpu,
      item.brand_active ? 'Active' : 'Inactive',
      ...teams.flatMap((t): Cell[] => {
        const counted = item.team_quantities.find(q => q.teamId === t.teamId)
        return counted ? split(counted.quantity, item.bpu) : ['', '']
      }),
      item.final_cases, item.final_units, item.uncounted ? 'Not counted' : '']),
  ] }
  // Unchanged import format: every consolidated line, uncounted actives with 0.
  const template: Sheet = { name: 'Template Import Reconc', rows: [
    ['Brand Code', 'Outer (qty)', 'Units (qty)', 'Status'],
    ...lines.map(item => [item.brand_code, item.final_cases, item.final_units, 'Avl']),
  ] }
  return [...teamSheets, consolidatedSheet, template]
}
