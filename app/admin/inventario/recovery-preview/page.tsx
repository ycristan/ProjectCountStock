import { notFound } from 'next/navigation'
import { isAdmin } from '@/lib/authorization'
import { createClient } from '@/lib/supabase-server'
import { fetchAllRows } from '@/lib/fetch-all-rows'
import type { ItemBusca } from '@/actions/contagem'
import { RecoverySearch } from './RecoverySearch'

export const dynamic = 'force-dynamic'

type InventoryRow = {
  brand_code: string; brand_name: string; bpu: number; pallet_size: number;
  weight_avg: number | null; brand_active: boolean; warehouse_id: string
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function RecoveryPreview({ searchParams }: {
  searchParams: Promise<{ source?: string; target?: string }>
}) {
  if (process.env.VERCEL_ENV !== 'preview' || !(await isAdmin())) notFound()
  const params = await searchParams
  // Explicit incident IDs, not guessed aliases or warehouse-name matching.
  const source = params.source ?? 'ff60b6ce-edb1-4050-b1a5-b3d40f88d765'
  const target = params.target ?? 'fe6ca6fc-cd9b-4a2e-abb9-046196ab4cfd'
  if (!uuid.test(source) || !uuid.test(target) || source === target) notFound()
  const db = await createClient()
  const { data: warehouses, error } = await db.from('warehouses').select('id, name').in('id', [source, target])
  if (error) throw new Error('Não foi possível consultar as warehouses.')
  const origin = warehouses?.find(row => row.id === source)
  const destination = warehouses?.find(row => row.id === target)
  if (!origin || !destination) notFound()
  const [rows, bins] = await Promise.all([
    fetchAllRows<InventoryRow>((from, to) => db.from('inventory_items')
      .select('brand_code, brand_name, bpu, pallet_size, weight_avg, brand_active, warehouse_id')
      .in('warehouse_id', [source, target]).order('brand_code').range(from, to)),
    fetchAllRows<{ brand_code: string; bin_location: string }>((from, to) => db.from('item_bin_locations')
      .select('brand_code, bin_location, inventory_items!inner(warehouse_id)')
      .in('inventory_items.warehouse_id', [source, target]).order('brand_code').order('bin_location').range(from, to)),
  ])
  const binsByCode = new Map<string, string[]>()
  for (const bin of bins) binsByCode.set(bin.brand_code, [...(binsByCode.get(bin.brand_code) ?? []), bin.bin_location])
  const items: ItemBusca[] = rows.map(row => ({
    ...row, weight_avg: row.weight_avg ?? 0, box_tare_g: 0,
    bins: binsByCode.get(row.brand_code) ?? [], jaContado: false, entryExistente: null,
  }))
  const moving = rows.filter(row => row.warehouse_id === source)
  return <div>
    <h1 className="text-xl font-semibold mb-4">Conferência da recuperação do inventário</h1>
    <div className="border border-amber-300 bg-amber-50 rounded-xl p-4 mb-5">
      <strong>PREVIEW SOMENTE LEITURA — NÃO APLICADA</strong>
      <p>Esta tela consulta os dados reais e projeta a recuperação. Não cria sessões, não registra contagens e não altera o banco.</p>
      <p>{origin.name} → {destination.name}: {moving.length} produtos seriam reunidos no destino; {moving.filter(row => row.brand_active).length} ativos da origem passariam a inativos.</p>
      <p>A origem vazia deixará de ser oferecida para novas contagens após a recuperação e publicação. Sessões e relatórios antigos serão preservados.</p>
      <p>Esta conferência não substitui o teste de gravação, executado apenas no banco descartável do CI.</p>
    </div>
    <RecoverySearch items={items} sourceId={source} targetId={target} />
  </div>
}
