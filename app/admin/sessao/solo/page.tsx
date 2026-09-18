import { listWarehouses } from '@/lib/warehouse-access'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchAllRows } from '@/lib/fetch-all-rows'
import type { ItemBusca } from '@/actions/contagem'
import { statusContadorSoloFixo } from '@/actions/settings'
import { SoloSessionWizard } from './_components/SoloSessionWizard'

export default async function SessaoSoloPage() {
  const admin = createAdminClient()
  const [inventoryRaw, { active }, warehouses] = await Promise.all([
    fetchAllRows<{ brand_code: string; brand_name: string; bpu: number; pallet_size: number; weight_avg: number | null; warehouse_id: string; brand_active: boolean }>(
      (from, to) =>
        admin
          .from('inventory_items')
          .select('brand_code, brand_name, bpu, pallet_size, weight_avg, warehouse_id, brand_active')
          .order('brand_code')
          .range(from, to)
    ),
    statusContadorSoloFixo(),
    listWarehouses(),
  ])

  const inventory: ItemBusca[] = inventoryRaw.map((i) => ({
    warehouse_id: i.warehouse_id,
    brand_active: i.brand_active,
    brand_code: i.brand_code,
    brand_name: i.brand_name,
    bpu: i.bpu,
    pallet_size: i.pallet_size,
    weight_avg: i.weight_avg ?? 0,
    box_tare_g: 300,
    bins: [],
    jaContado: false,
    entryExistente: null,
  }))

  return (
    <div>
      <Link href="/admin/sessao" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700 mb-4">
        ← New Session
      </Link>
      <h2 className="text-xl font-semibold text-slate-900 mb-4">New Solo Count Session</h2>
      <div className="max-w-md">
        <SoloSessionWizard warehouses={warehouses} inventory={inventory} soloCounterActive={active} />
      </div>
    </div>
  )
}
