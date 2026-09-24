import type { ItemBusca } from '@/actions/contagem'

export function filterItems(items: ItemBusca[], q: string): ItemBusca[] {
  const ql = q.trim().toLowerCase()
  if (!ql) return []

  if (/^\d+$/.test(ql)) {
    // Pure digits → brand_code prefix + BIN prefix combined, sorted ascending
    const byCode = items.filter((i) => i.brand_code.toLowerCase().startsWith(ql))
    const codeSet = new Set(byCode.map((i) => i.brand_code))
    const byBin = items.filter(
      (i) => !codeSet.has(i.brand_code) && i.bins.some((b) => b.toLowerCase().startsWith(ql))
    )
    return [...byCode, ...byBin].sort((a, b) => a.brand_code.localeCompare(b.brand_code))
  }

  if (/^\d/.test(ql)) {
    // Starts with digit, has letters → BIN prefix only (e.g. "40A")
    return items
      .filter((i) => i.bins.some((b) => b.toLowerCase().startsWith(ql)))
      .sort((a, b) => a.brand_code.localeCompare(b.brand_code))
  }

  // Starts with letter → brand_name contains, case-insensitive, sorted alphabetically
  return items
    .filter((i) => i.brand_name.toLowerCase().includes(ql))
    .sort((a, b) => a.brand_name.localeCompare(b.brand_name))
}
