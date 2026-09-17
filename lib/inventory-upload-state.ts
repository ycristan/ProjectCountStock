import type { DuplicateGroup, ImportIssue } from './inventory-import'

export type InventoryUploadState = {
  error?: string
  issues?: ImportIssue[]
  duplicates?: DuplicateGroup[]
  review?: { warehouseName: string; count: number; active: number; inactive: number }
  success?: { warehouseName: string; imported: number; deactivated: number }
}
