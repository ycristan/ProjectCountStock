import 'server-only'
import { createClient } from '@/lib/supabase-server'
import { isAdmin } from '@/lib/authorization'

export type WarehouseOption = { id: string; name: string }

export async function listWarehouses(): Promise<WarehouseOption[]> {
  if (!(await isAdmin())) return []
  const db = await createClient()
  const { data, error } = await db.from('warehouses').select('id, name').order('name')
  if (error) throw new Error('Warehouses are not available. The database upgrade must be completed before creating a session.')
  return data ?? []
}
