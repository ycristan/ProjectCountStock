import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/fetch-all-rows'

export type ReportInventoryItem = {
  brand_code: string; brand_name: string; bpu: number; category: string; category1: string
}

// Admin report callers authorize first. Historical membership comes from recorded
// codes, not the product's current WHS. Never use this for live counter searches.
export async function loadHistoricalInventory(db: SupabaseClient, recordedCodes: string[]): Promise<ReportInventoryItem[]> {
  const codes = [...new Set(recordedCodes)].sort()
  const rows: ReportInventoryItem[] = []
  // Bound URL size; fetchAllRows still respects the server's row cap.
  for (let offset = 0; offset < codes.length; offset += 200) {
    const batch = codes.slice(offset, offset + 200)
    rows.push(...await fetchAllRows<ReportInventoryItem>((from, to) =>
      db.from('inventory_items').select('brand_code, brand_name, bpu, category, category1')
        .in('brand_code', batch).order('brand_code').range(from, to)
    ))
  }
  return rows
}
