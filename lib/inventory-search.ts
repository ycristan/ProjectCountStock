import type { ItemBusca } from '@/actions/contagem'

// Lowercase without spaces, hyphens, dots, slashes and underscores: "T-05" finds BIN "T05" and vice versa.
const compact = (s: string) => s.toLowerCase().replace(/[\s\-./_]/g, '')

// Any part of the code, a BIN or the name matches (Yuri, 30/10).
// Closest first: exact code/BIN, then code/BIN start, then name start, then anywhere.
function rank(item: ItemBusca, q: string): number {
  const code = compact(item.brand_code)
  const bins = item.bins.map(compact)
  const name = compact(item.brand_name)
  if (code === q || bins.includes(q)) return 0
  if (code.startsWith(q) || bins.some((b) => b.startsWith(q))) return 1
  if (name.startsWith(q)) return 2
  if (code.includes(q) || name.includes(q) || bins.some((b) => b.includes(q))) return 3
  return -1
}

export function filterItems(items: ItemBusca[], q: string): ItemBusca[] {
  const ql = compact(q)
  if (!ql) return []
  return items
    .map((item) => ({ item, r: rank(item, ql) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.item.brand_name.localeCompare(b.item.brand_name))
    .map((x) => x.item)
}
