import { createClient } from '@/lib/supabase-server'
import * as XLSX from 'xlsx'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Não autenticado' }, { status: 401 })
  if (user.user_metadata?.role === 'counter') {
    return Response.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const [{ data: items }, { data: bins }] = await Promise.all([
    supabase
      .from('inventory_items')
      .select('brand_code, brand_name, bpu, pallet_size, weight_avg')
      .order('brand_code'),
    supabase
      .from('item_bin_locations')
      .select('brand_code, bin_location')
      .order('brand_code'),
  ])

  const binMap: Record<string, string[]> = {}
  for (const b of bins ?? []) {
    if (!binMap[b.brand_code]) binMap[b.brand_code] = []
    binMap[b.brand_code].push(b.bin_location)
  }

  const rows = (items ?? []).map((item) => {
    const b = binMap[item.brand_code] ?? []
    return {
      'Brand Code': item.brand_code,
      'Brand Name': item.brand_name,
      'Brand Purchase Unit': item.bpu,
      'Pallet Size': item.pallet_size,
      'Weight AVG': item.weight_avg ?? 0,
      'BIN Location 1': b[0] ?? '',
      'BIN Location 2': b[1] ?? '',
      'BIN Location 3': b[2] ?? '',
      'BIN Location 4': b[3] ?? '',
    }
  })

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Inventário')
  const body: Uint8Array = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })

  return new Response(body.buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="inventario.xlsx"',
    },
  })
}
