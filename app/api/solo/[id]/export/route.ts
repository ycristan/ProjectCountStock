import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchAllRows } from '@/lib/fetch-all-rows'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'admin') {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const { id } = await params
  const admin = createAdminClient()

  const [{ data: session }, entries, inventory] = await Promise.all([
    admin.from('solo_sessions').select('title').eq('id', id).single(),
    fetchAllRows<{ brand_code: string; brand_name: string; final_cases: number; final_units: number }>(
      (from, to) =>
        admin
          .from('solo_entries')
          .select('brand_code, brand_name, final_cases, final_units')
          .eq('session_id', id)
          .order('brand_code')
          .range(from, to)
    ),
    fetchAllRows<{ brand_code: string; category: string; category1: string; bpu: number }>((from, to) =>
      admin.from('inventory_items').select('brand_code, category, category1, bpu').range(from, to)
    ),
  ])

  const invMap = Object.fromEntries(inventory.map((i) => [i.brand_code, i]))

  const headers = ['Category', 'Category 1', 'Brand Code', 'Brand Name', 'BPU', 'Cases', 'Units']
  const rows = entries.map((e) => {
    const inv = invMap[e.brand_code]
    return [inv?.category ?? '', inv?.category1 ?? '', e.brand_code, e.brand_name ?? '', inv?.bpu ?? '', e.final_cases, e.final_units]
  })

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, (session?.title ?? 'Solo').slice(0, 31))

  // ponytail: TS 5.7 Uint8Array cast — same pattern as existing export route
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as unknown as BodyInit

  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="solo-${id.slice(0, 8)}.xlsx"`,
    },
  })
}
