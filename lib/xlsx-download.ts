import * as XLSX from 'xlsx'
import type { Sheet } from '@/lib/team-session-report'

export function xlsxResponse(sheets: Sheet[], filename: string) {
  const wb = XLSX.utils.book_new()
  for (const sheet of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name)
  // ponytail: TS 5.7 tornou Uint8Array genérico — cast necessário para BodyInit
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as unknown as BodyInit
  return new Response(buf, { headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="' + filename + '"',
  } })
}
