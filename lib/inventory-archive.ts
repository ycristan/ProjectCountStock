import * as XLSX from 'xlsx'
import { inventoryExportRows, type InventoryImportItem } from './inventory-import'

export type WarehouseInventory = {
  id: string; name: string; items: Omit<InventoryImportItem, 'sourceRow'>[]
}

export function createInventoryArchive(warehouses: WarehouseInventory[]): Uint8Array {
  const zip = XLSX.CFB.utils.cfb_new()
  warehouses.forEach((warehouse, index) => {
    const workbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.aoa_to_sheet(inventoryExportRows(warehouse.name, warehouse.items))
    sheet['!cols'] = Array.from({ length: 13 }, (_, column) => ({ wch: column === 1 ? 36 : 20 }))
    XLSX.utils.book_append_sheet(workbook, sheet, 'Inventory')
    const name = warehouse.name.normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 60) || 'Warehouse'
    // Index makes sanitized-name collisions impossible; no user-supplied archive paths.
    XLSX.CFB.utils.cfb_add(zip, (index + 1) + '-' + name + '.xlsx',
      XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true }))
  })
  return XLSX.CFB.write(zip, { type: 'buffer', fileType: 'zip', compression: true })
}
