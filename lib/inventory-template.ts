import * as XLSX from 'xlsx'
import { INVENTORY_HEADERS } from './inventory-import'

export const INVENTORY_TEMPLATE_FILENAME = 'inventory-template.xlsx'

/** Blank input template. No example products, formulas or instruction sheets. */
export function createInventoryTemplate(): XLSX.WorkBook {
  const sheet = XLSX.utils.aoa_to_sheet([[...INVENTORY_HEADERS]])
  sheet['!cols'] = INVENTORY_HEADERS.map(header => ({
    wch: header === 'Brand Name' ? 36 : Math.max(header.length + 3, 18),
  }))
  // Preformat the first input row. Copy this row when adding more products.
  INVENTORY_HEADERS.forEach((header, column) => {
    const numeric = ['BPU', 'Pallet Size', 'Weight AVG'].includes(header)
    sheet[XLSX.utils.encode_cell({ r: 1, c: column })] = {
      t: 's', v: '', z: numeric ? (header === 'Weight AVG' ? '0.########' : '0') : '@',
    }
  })
  sheet['!ref'] = 'A1:M2'
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Inventory')
  return workbook
}

export function downloadInventoryTemplate(): void {
  XLSX.writeFile(createInventoryTemplate(), INVENTORY_TEMPLATE_FILENAME, { bookType: 'xlsx', compression: true })
}
