// Inventory numbers typed by an admin. Comma and point are both decimal separators: a browser
// number field silently turned "2,5" into 25. At most 2 decimals, so "1.250" (a thousands
// separator) is refused instead of read as 1.25. Empty means 0 (optional fields).
export function parseInventoryNumber(text: string, integer: boolean): number | null {
  const t = text.trim()
  if (t === '') return 0
  const ok = integer ? /^\d+$/.test(t) : /^\d+([.,]\d{1,2})?$/.test(t)
  return ok ? Number(t.replace(',', '.')) : null
}

// Reads BPU, Pallet Size and Weight AVG; returns the error message for the first bad one.
export function parseInventoryNumbers(form: { bpu: string; pallet_size: string; weight_avg: string }):
  { bpu: number; pallet_size: number; weight_avg: number } | { error: string } {
  const bpu = parseInventoryNumber(form.bpu, true)
  if (bpu === null) return { error: 'BPU must be a whole number.' }
  const pallet_size = parseInventoryNumber(form.pallet_size, true)
  if (pallet_size === null) return { error: 'Pallet Size must be a whole number.' }
  const weight_avg = parseInventoryNumber(form.weight_avg, false)
  if (weight_avg === null) return { error: 'Weight AVG must be a number with up to 2 decimals, e.g. 2.5 or 2,5.' }
  return { bpu, pallet_size, weight_avg }
}
