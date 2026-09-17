import { isAdmin } from '@/lib/authorization'
import { createClient } from '@/lib/supabase-server'
import { fetchAllRows } from '@/lib/fetch-all-rows'
import { createInventoryArchive } from '@/lib/inventory-archive'
import type { InventoryImportItem } from '@/lib/inventory-import'

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: 'Unauthorized' }, { status: 403 })
  const db = await createClient()
  const [{ data: warehouses, error }, items, bins] = await Promise.all([
    db.from('warehouses').select('id, name').order('name'),
    fetchAllRows<Omit<InventoryImportItem, 'sourceRow' | 'bins'> & { warehouse_id: string }>((from, to) =>
      db.from('inventory_items').select('brand_code, brand_name, category, category1, bpu, pallet_size, weight_avg, brand_active, warehouse_id').order('brand_code').range(from, to)),
    fetchAllRows<{ brand_code: string; bin_location: string }>((from, to) =>
      db.from('item_bin_locations').select('brand_code, bin_location').order('brand_code').order('bin_location').range(from, to)),
  ])
  if (error || !warehouses) return Response.json({ error: 'Warehouse export unavailable.' }, { status: 503 })
  const binMap = new Map<string, string[]>()
  for (const bin of bins) binMap.set(bin.brand_code, [...(binMap.get(bin.brand_code) ?? []), bin.bin_location])
  const archive = createInventoryArchive(warehouses.map(w => ({
    ...w, items: items.filter(item => item.warehouse_id === w.id).map(item => ({
      ...item, weight_avg: Number(item.weight_avg ?? 0), bins: binMap.get(item.brand_code) ?? [],
    })),
  })))
  if (archive.byteLength > 4 * 1024 * 1024) return Response.json({ error: 'Export exceeds the current 4 MiB download limit. No products were omitted.' }, { status: 413 })
  return new Response(new Uint8Array(archive), { headers: {
    'Content-Type': 'application/zip',
    'Content-Disposition': 'attachment; filename="inventory-all-warehouses.zip"',
    'Cache-Control': 'private, no-store',
  } })
}
