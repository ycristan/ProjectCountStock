import 'server-only'
import { createClient } from '@/lib/supabase-server'
import { isAdmin } from '@/lib/authorization'
import { fetchAllRows } from '@/lib/fetch-all-rows'

export type WarehouseOption = { id: string; name: string }

export async function listWarehouses(withInventory = false): Promise<WarehouseOption[]> {
  if (!(await isAdmin())) return []
  const db = await createClient()
  // Empty historical warehouses retain their IDs and reports, but are not
  // offered for new counts. Inactive products still qualify as inventory.
  return fetchAllRows<WarehouseOption>(async (from, to) => {
    const query = withInventory
      ? db.from('warehouses').select('id, name, inventory_items!inner(brand_code)')
          .limit(1, { referencedTable: 'inventory_items' })
      : db.from('warehouses').select('id, name')
    const { data, error } = await query.order('name').order('id').range(from, to)
    if (error) throw new Error('Warehouses are not available. Please try again.')
    return { data: (data ?? []).map(row => ({ id: row.id, name: row.name })), error: null }
  })
}
