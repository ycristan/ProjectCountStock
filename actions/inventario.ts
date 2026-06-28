'use server'

import { createClient } from '@/lib/supabase-server'

export type ItemInventario = {
  brand_code: string
  brand_name: string
  bpu: number
  pallet_size: number
  weight_avg: number
  category: string
  category1: string
  bins: string[]
}

export async function listarInventario(): Promise<ItemInventario[]> {
  const supabase = await createClient()
  const [{ data: items }, { data: bins }] = await Promise.all([
    supabase
      .from('inventory_items')
      .select('brand_code, brand_name, bpu, pallet_size, weight_avg, category, category1')
      .order('brand_code'),
    supabase.from('item_bin_locations').select('brand_code, bin_location').order('brand_code'),
  ])
  const binMap: Record<string, string[]> = {}
  for (const b of bins ?? []) {
    if (!binMap[b.brand_code]) binMap[b.brand_code] = []
    binMap[b.brand_code].push(b.bin_location)
  }
  return (items ?? []).map((item) => ({
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
  const supabase = await createClient()
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
