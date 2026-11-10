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

export type ItemFields = {
  brand_name: string
  bpu: number
  pallet_size: number
  weight_avg: number
  category: string
  category1: string
  bins: string[]
}

// The database message names a two-admin flow that does not exist yet; say what the admin can do.
function friendly(message: string) {
  return message.includes('during a team count') ? 'BPU cannot change while a team count is open.' : message
}

// Product and BINs are written by one database function, so a failure never leaves a product without BINs.
export async function editarItemInventario(brandCode: string, fields: ItemFields, warehouseId: string): Promise<{ error?: string }> {
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
  const { error } = await supabase.rpc('save_inventory_item', { p_warehouse_id: warehouseId, p_brand_code: brandCode, p_item: fields })
  return error ? { error: friendly(error.message) } : {}
}

// Manual creation goes into the warehouse of the active tab; the database refuses an existing Brand Code.
export async function criarItemInventario(brandCode: string, fields: ItemFields, warehouseId: string): Promise<{ error?: string }> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }
  if (!brandCode.trim()) return { error: 'Brand Code is required.' }
  if (!Number.isInteger(fields.bpu) || fields.bpu < 1) return { error: 'BPU must be a positive integer.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('save_inventory_item', {
    p_warehouse_id: warehouseId, p_brand_code: brandCode, p_item: fields, p_create: true,
  })
  return error ? { error: error.message } : {}
}

export async function alterarStatusItem(brandCode: string, active: boolean, warehouseId: string): Promise<{ error?: string }> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }
  const supabase = await createClient()
  const { data, error } = await supabase.from('inventory_items').update({ brand_active: active })
    .eq('brand_code', brandCode).eq('warehouse_id', warehouseId).select('brand_code')
  if (error) return { error: error.message }
  return data?.length ? {} : { error: 'Product not found in this warehouse.' }
}

export type CodigoExistente = { brand_code: string; brand_name: string; brand_active: boolean; warehouse_id: string; warehouse: string }

// Existing products whose Brand Code starts with what the admin typed, in any warehouse, inactive included.
export async function buscarCodigos(prefix: string): Promise<CodigoExistente[]> {
  const code = prefix.trim()
  if (!code || !(await isAdmin())) return []
  const supabase = await createClient()
  const { data } = await supabase.from('inventory_items')
    .select('brand_code, brand_name, brand_active, warehouse_id, warehouses(name)')
    .ilike('brand_code', code.replace(/[\\%_]/g, '\\$&') + '%')
    .order('brand_code').limit(8)
  return (data ?? []).map(({ warehouses, ...item }) => ({
    ...item,
    warehouse: (warehouses as unknown as { name: string } | null)?.name ?? '',
  }))
}
