import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchAllRows } from '@/lib/fetch-all-rows'
import type { ItemBusca } from '@/actions/contagem'
import { statusContadorSoloFixo } from '@/actions/settings'
import { SoloSessionWizard } from './_components/SoloSessionWizard'

export default async function SessaoSoloPage() {
  const admin = createAdminClient()
  const [inventoryRaw, { active }] = await Promise.all([
    fetchAllRows<{ brand_code: string; brand_name: string; bpu: number; pallet_size: number; weight_avg: number | null }>(
      (from, to) =>
        admin
          .from('inventory_items')
          .select('brand_code, brand_name, bpu, pallet_size, weight_avg')
          .eq('brand_active', true)
          .order('brand_code')
          .range(from, to)
    ),
    statusContadorSoloFixo(),
  ])

  const inventory: ItemBusca[] = inventoryRaw.map((i) => ({
    brand_code: i.brand_code,
    brand_name: i.brand_name,
    bpu: i.bpu,
    pallet_size: i.pallet_size,
    weight_avg: i.weight_avg ?? 0,
    box_tare_g: 300,
    bins: [],
    brand_active: true,
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
        <SoloSessionWizard inventory={inventory} soloCounterActive={active} />
      </div>
    </div>
  )
}
