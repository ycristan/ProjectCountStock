'use server'

import { createClient } from '@/lib/supabase-server'
import { fetchAllRows } from '@/lib/fetch-all-rows'
import { isAdmin } from '@/lib/authorization'

export type ItemInventario = {
  brand_code: string
  brand_name: string
  bpu: number
  pallet_size: number
  weight_avg: number
  category: string
  category1: string
  brand_active: boolean
  bins: string[]
}

// One warehouse at a time: tabs never mix inventories (decision of 2026-11-03).
export async function listarInventario(warehouseId: string): Promise<ItemInventario[]> {
  if (!(await isAdmin())) return []
  const supabase = await createClient()
  const [items, bins] = await Promise.all([
    fetchAllRows<Omit<ItemInventario, 'bins'>>((from, to) =>
      supabase
        .from('inventory_items')
        .select('brand_code, brand_name, bpu, pallet_size, weight_avg, category, category1, brand_active')
        .eq('warehouse_id', warehouseId)
        .order('brand_code')
        .range(from, to)
    ),
    fetchAllRows<{ brand_code: string; bin_location: string }>((from, to) =>
      supabase.from('item_bin_locations')
        .select('brand_code, bin_location, inventory_items!inner(warehouse_id)')
        .eq('inventory_items.warehouse_id', warehouseId)
        .order('brand_code').order('bin_location')
        .range(from, to)
    ),
  ])
  const binMap: Record<string, string[]> = {}
  for (const b of bins) {
    if (!binMap[b.brand_code]) binMap[b.brand_code] = []
    binMap[b.brand_code].push(b.bin_location)
  }
  return items.map((item) => ({
    ...item,
    weight_avg: Number(item.weight_avg),
    bins: binMap[item.brand_code] ?? [],
  }))
}

export async function editarItemInventario(
  brandCode: string,
  fields: {
    brand_name: string
    bpu: number
    pallet_size: number
    weight_avg: number
    category: string
    category1: string
    bins: string[]
  }
): Promise<{ error?: string }> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }
  const supabase = await createClient()
  if (!Number.isInteger(fields.bpu) || fields.bpu < 1) return { error: 'BPU must be a positive integer.' }
  const { data: current, error: readError } = await supabase
    .from('inventory_items').select('bpu').eq('brand_code', brandCode).single()
  if (readError || !current) return { error: 'Item is unavailable.' }
  if (fields.bpu !== current.bpu) {
    const { data: activeSolo, error: sessionError } = await supabase
      .from('solo_sessions').select('id').eq('status', 'open').limit(1).maybeSingle()
    if (sessionError) return { error: 'Unable to verify active counts; BPU was not changed.' }
    if (activeSolo) return { error: 'BPU cannot change while a solo count is open.' }
  }
  const { bins, ...itemFields } = fields
  const { error } = await supabase.from('inventory_items').update(itemFields).eq('brand_code', brandCode)
  if (error) return { error: error.message }
  const { error: delError } = await supabase.from('item_bin_locations').delete().eq('brand_code', brandCode)
  if (delError) return { error: delError.message }
  if (bins.length > 0) {
    const { error: insError } = await supabase
      .from('item_bin_locations')
      .insert(bins.map((bin_location) => ({ brand_code: brandCode, bin_location })))
    if (insError) return { error: insError.message }
  }
  return {}
}
