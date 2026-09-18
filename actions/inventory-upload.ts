'use server'

import { env } from 'node:process'
import { Buffer } from 'node:buffer'
import { createClient } from '@/lib/supabase-server'
import { isAdmin } from '@/lib/authorization'
import { readInventoryXlsx, INVENTORY_FILE_LIMITS, InventoryFileError } from '@/lib/inventory-xlsx'
import type { DuplicateChoice } from '@/lib/inventory-import'
import type { InventoryUploadState } from '@/lib/inventory-upload-state'
import { revalidatePath } from 'next/cache'

export async function reviewInventoryUpload(formData: FormData): Promise<InventoryUploadState> {
  return processUpload(formData, false)
}

export async function confirmInventoryUpload(formData: FormData): Promise<InventoryUploadState> {
  return processUpload(formData, true)
}

async function processUpload(formData: FormData, commit: boolean): Promise<InventoryUploadState> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }
  const file = formData.get('file')
  if (!file || typeof file === 'string' || !file.size || file.size > INVENTORY_FILE_LIMITS.bytes) {
    return { error: 'Select a non-empty .xlsx file of at most 4 MiB.' }
  }
  let choices: DuplicateChoice[]
  try {
    const raw = formData.get('choices')
    if (raw !== null && typeof raw !== 'string') throw new Error()
    const value: unknown = JSON.parse(raw || '[]')
    if (!Array.isArray(value) || value.length > INVENTORY_FILE_LIMITS.rows ||
      value.some(c => !c || typeof c.brandCode !== 'string' || !Number.isInteger(c.row))) throw new Error()
    choices = value
  } catch { return { error: 'Invalid duplicate selections. Review the file again.' } }

  try {
    // Read the actual file again at confirmation; never trust a client-supplied parsed payload.
    const result = await readInventoryXlsx(Buffer.from(await file.arrayBuffer()), file.name, choices)
    if (!result.ok) return { issues: result.issues, duplicates: result.duplicates }
    const review = {
      warehouseName: result.warehouseName, count: result.items.length,
      active: result.items.filter(i => i.brand_active).length,
      inactive: result.items.filter(i => !i.brand_active).length,
    }
    if (!commit) return { review }
    if (formData.get('confirmedWarehouse') !== result.warehouseName) {
      return { error: 'Review and confirm the warehouse before importing.', review }
    }
    // Existing Preview points at production. File review is safe; mutations are not.
    if (env.VERCEL_ENV === 'preview') {
      return { error: 'Preview is read-only: the file was validated, but no inventory was changed.', review }
    }
    const db = await createClient()
    const { data, error } = await db.rpc('import_warehouse_inventory', {
      p_warehouse_name: result.warehouseName,
      p_items: result.items.map(({ sourceRow, ...item }) => { void sourceRow; return item }),
      p_create_warehouse: formData.get('createWarehouse') === 'true',
    })
    if (error) return { error: error.message, review }
    revalidatePath('/admin/inventario')
    revalidatePath('/busca')
    return { success: { warehouseName: result.warehouseName, imported: data.imported, deactivated: data.deactivated } }
  } catch (error) {
    return { error: error instanceof InventoryFileError ? error.message : 'Unable to process the inventory file. No import was completed.' }
  }
}
