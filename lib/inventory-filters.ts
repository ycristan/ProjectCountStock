// Excel-style column filters and sorting for the inventory table. Pure logic, no React.
import type { ItemInventario } from '@/actions/inventario'

export type ColumnKey = 'status' | 'brand_code' | 'brand_name' | 'category' | 'category1' | 'bpu' | 'pallet_size'
  | 'weight_avg' | 'bin1' | 'bin2' | 'bin3' | 'bin4'

export const COLUMNS: { key: ColumnKey; label: string; numeric: boolean }[] = [
  { key: 'status', label: 'Status', numeric: false },
  { key: 'brand_code', label: 'Brand Code', numeric: false },
  { key: 'brand_name', label: 'Brand Name', numeric: false },
  { key: 'category', label: 'Category', numeric: false },
  { key: 'category1', label: 'Category1', numeric: false },
  { key: 'bpu', label: 'BPU', numeric: true },
  { key: 'pallet_size', label: 'Pallet Size', numeric: true },
  { key: 'weight_avg', label: 'Weight AVG', numeric: true },
  { key: 'bin1', label: 'BIN Location 1', numeric: false },
  { key: 'bin2', label: 'BIN Location 2', numeric: false },
  { key: 'bin3', label: 'BIN Location 3', numeric: false },
  { key: 'bin4', label: 'BIN Location 4', numeric: false },
]

export const BLANK = '(Blank)'

export type SortState = { key: ColumnKey; dir: 'asc' | 'desc' } | null
// A column with an entry keeps only rows whose display value is in the set.
export type FilterState = { selected: Partial<Record<ColumnKey, ReadonlySet<string>>>; sort: SortState }

export const EMPTY_FILTERS: FilterState = { selected: {}, sort: null }

const isNumeric = (key: ColumnKey) => COLUMNS.find((c) => c.key === key)?.numeric === true

export function cellValue(item: ItemInventario, key: ColumnKey): string {
  switch (key) {
    case 'status': return item.brand_active ? 'Active' : 'Inactive'
    case 'bpu': case 'pallet_size': case 'weight_avg': {
      const n = Number(item[key])
      return n ? String(n) : BLANK
    }
    case 'bin1': case 'bin2': case 'bin3': case 'bin4':
      return (item.bins[Number(key[3]) - 1] ?? '').trim() || BLANK
    default:
      return String(item[key] ?? '').trim() || BLANK
  }
}

function compareValues(key: ColumnKey, a: string, b: string): number {
  if (a === BLANK || b === BLANK) return a === b ? 0 : a === BLANK ? -1 : 1
  if (isNumeric(key)) return Number(a) - Number(b)
  // Natural order: digit runs compare by value, so 3 < 5 < 17 < 1111 (not 1111 < 3).
  return NATURAL.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0)
}

const NATURAL = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

// Search inside a filter's value list: exact match first, then values starting with the text,
// then the rest that contain it; each group keeps the column order.
export function searchValues(values: string[], query: string): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return values
  const exact: string[] = [], starts: string[] = [], contains: string[] = []
  for (const v of values) {
    const l = v.toLowerCase()
    if (l === q) exact.push(v)
    else if (l.startsWith(q)) starts.push(v)
    else if (l.includes(q)) contains.push(v)
  }
  return [...exact, ...starts, ...contains]
}

export function activeFilterKeys(state: FilterState): ColumnKey[] {
  return Object.keys(state.selected) as ColumnKey[]
}

function passes(item: ItemInventario, selected: FilterState['selected'], skip?: ColumnKey): boolean {
  for (const key of Object.keys(selected) as ColumnKey[]) {
    if (key !== skip && !selected[key]!.has(cellValue(item, key))) return false
  }
  return true
}

// Values offered for one column: taken from the rows the OTHER columns' filters leave, like Excel.
export function distinctValues(items: ItemInventario[], state: FilterState, key: ColumnKey): string[] {
  const seen = new Set<string>()
  for (const item of items) if (passes(item, state.selected, key)) seen.add(cellValue(item, key))
  return [...seen].sort((a, b) => compareValues(key, a, b))
}

export function applyFilters(items: ItemInventario[], state: FilterState): ItemInventario[] {
  const rows = activeFilterKeys(state).length ? items.filter((item) => passes(item, state.selected)) : items
  if (!state.sort) return rows
  const { key, dir } = state.sort
  const sign = dir === 'asc' ? 1 : -1
  return rows
    .map((item) => ({ item, v: cellValue(item, key) }))
    .sort((a, b) => sign * compareValues(key, a.v, b.v))
    .map((x) => x.item)
}
