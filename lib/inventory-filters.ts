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
  return isNumeric(key) ? Number(a) - Number(b) : a.localeCompare(b)
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
