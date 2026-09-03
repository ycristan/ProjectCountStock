'use server'

import { revalidatePath } from 'next/cache'
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

export type CamposInventario = {
  brand_name: string
  bpu: number
  pallet_size: number
  weight_avg: number
  category: string
  category1: string
  bins: string[]
}

export async function listarInventario(): Promise<ItemInventario[]> {
  if (!(await isAdmin())) return []
  const supabase = await createClient()
  const [items, bins] = await Promise.all([
    fetchAllRows<{
      brand_code: string
      brand_name: string
      bpu: number
      pallet_size: number
      weight_avg: number
      category: string
      category1: string
      brand_active: boolean
    }>((from, to) =>
      supabase
        .from('inventory_items')
        .select('brand_code, brand_name, bpu, pallet_size, weight_avg, category, category1, brand_active')
        .order('brand_active', { ascending: false })
        .order('brand_code')
        .range(from, to)
    ),
    fetchAllRows<{ brand_code: string; bin_location: string }>((from, to) =>
      supabase.from('item_bin_locations').select('brand_code, bin_location').order('brand_code').range(from, to)
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

function normalizeBins(bins: string[]): { bins?: string[]; error?: string } {
  const normalized = bins.map((bin) => bin.trim()).filter(Boolean)
  if (normalized.length > 4) return { error: 'Use at most four BIN locations.' }

  const uniqueBins = new Set(normalized.map((bin) => bin.toLowerCase()))
  if (uniqueBins.size !== normalized.length) return { error: 'A BIN location cannot be repeated.' }

  return { bins: normalized }
}

function validateNewItem(brandCode: string, fields: CamposInventario): string | null {
  if (!brandCode.trim()) return 'Brand Code is required.'
  if (!fields.brand_name.trim()) return 'Brand Name is required.'
  if (!Number.isInteger(fields.bpu) || fields.bpu <= 0) return 'BPU must be a whole number greater than zero.'
  if (!Number.isInteger(fields.pallet_size) || fields.pallet_size < 0) return 'Pallet Size must be a whole number of zero or more.'
  if (!Number.isFinite(fields.weight_avg) || fields.weight_avg < 0) return 'Weight AVG cannot be negative.'
  return null
}

export async function criarItemInventario(
  brandCode: string,
  fields: CamposInventario
): Promise<{ error?: string }> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }

  const validationError = validateNewItem(brandCode, fields)
  if (validationError) return { error: validationError }

  const normalizedBins = normalizeBins(fields.bins)
  if (normalizedBins.error || !normalizedBins.bins) return { error: normalizedBins.error }

  const supabase = await createClient()
  const { data: openSession, error: sessionError } = await supabase
    .from('count_sessions')
    .select('id')
    .neq('status', 'fechada')
    .limit(1)
    .maybeSingle()

  if (sessionError) return { error: sessionError.message }
  if (openSession) {
    return { error: 'A product cannot be added while a count session is in progress.' }
  }

  const code = brandCode.trim()
  const { data: existing, error: existingError } = await supabase
    .from('inventory_items')
    .select('brand_active')
    .eq('brand_code', code)
    .maybeSingle()

  if (existingError) return { error: existingError.message }
  if (existing) {
    return {
      error: existing.brand_active
        ? 'This Brand Code already exists. Use Edit instead.'
        : 'This Brand Code already exists as inactive. Reactivate it through the existing inventory process.',
    }
  }

  const { bins, ...itemFields } = fields
  const { error: itemError } = await supabase.from('inventory_items').insert({
    ...itemFields,
    brand_code: code,
    brand_name: itemFields.brand_name.trim(),
    category: itemFields.category.trim(),
    category1: itemFields.category1.trim(),
    brand_active: true,
  })

  if (itemError) {
    if (itemError.code === '23505') return { error: 'This Brand Code already exists. Use Edit instead.' }
    return { error: itemError.message }
  }

  if (normalizedBins.bins.length > 0) {
    const { error: binsError } = await supabase
      .from('item_bin_locations')
      .insert(normalizedBins.bins.map((bin_location) => ({ brand_code: code, bin_location })))

    if (binsError) {
      await supabase.from('inventory_items').delete().eq('brand_code', code)
      return { error: `The product was not saved because its BIN locations could not be saved: ${binsError.message}` }
    }
  }

  revalidatePath('/admin/inventario')
  return {}
}

export async function editarItemInventario(
  brandCode: string,
  fields: CamposInventario
): Promise<{ error?: string }> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }
  const normalizedBins = normalizeBins(fields.bins)
  if (normalizedBins.error || !normalizedBins.bins) return { error: normalizedBins.error }

  const supabase = await createClient()
  const { bins, ...itemFields } = fields
  const { error } = await supabase.from('inventory_items').update(itemFields).eq('brand_code', brandCode)
  if (error) return { error: error.message }
  const { error: delError } = await supabase.from('item_bin_locations').delete().eq('brand_code', brandCode)
  if (delError) return { error: delError.message }
  if (normalizedBins.bins.length > 0) {
    const { error: insError } = await supabase
      .from('item_bin_locations')
      .insert(normalizedBins.bins.map((bin_location) => ({ brand_code: brandCode, bin_location })))
    if (insError) return { error: insError.message }
  }

  revalidatePath('/admin/inventario')
  return {}
}
