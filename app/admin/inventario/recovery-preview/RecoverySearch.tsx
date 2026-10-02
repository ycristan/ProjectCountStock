'use client'

import { useMemo, useState } from 'react'
import type { ItemBusca } from '@/actions/contagem'
import { filterItems } from '@/lib/inventory-search'
import { projectWarehouseRecovery } from '@/lib/warehouse-recovery-preview'
import { SearchInput } from '@/app/(counter)/busca/_components/SearchInput'
import { ResultList } from '@/app/(counter)/busca/_components/ResultList'

export function RecoverySearch({ items, sourceId, targetId }: {
  items: ItemBusca[]; sourceId: string; targetId: string
}) {
  const [query, setQuery] = useState('kinder')
  const [after, setAfter] = useState(true)
  const [selected, setSelected] = useState<ItemBusca | null>(null)
  const projected = useMemo(() => projectWarehouseRecovery(items, sourceId, targetId), [items, sourceId, targetId])
  const visible = after ? projected : items.filter(item => item.warehouse_id === targetId)
  const results = filterItems(visible, query)
  return <section>
    <div className="flex flex-wrap gap-2 mb-4">
      <button type="button" aria-pressed={!after} className="border rounded-lg px-4 py-2" onClick={() => { setAfter(false); setSelected(null) }}>Antes — dados atuais</button>
      <button type="button" aria-pressed={after} className="border rounded-lg px-4 py-2" onClick={() => { setAfter(true); setSelected(null) }}>Depois — projeção da recuperação</button>
    </div>
    <p className="mb-3 text-sm text-slate-600" role="status">
      {after ? 'Projeção, não aplicada' : 'Inventário atual do destino'}: {visible.length} produtos.
      Busca: {results.length} resultado(s), {results.filter(item => item.brand_active !== false).length} ativo(s), {results.filter(item => item.brand_active === false).length} inativo(s).
    </p>
    <SearchInput value={query} onChange={value => { setQuery(value); setSelected(null) }} />
    <ResultList items={results} onSelect={setSelected} />
    {results.length === 0 && <p className="mt-4">Nenhum produto encontrado.</p>}
    {selected && <aside aria-label="Product details" className="mt-4 border rounded-xl p-4 bg-white">
      <h2 className="font-semibold">{selected.brand_code} — {selected.brand_name}</h2>
      <p>BPU: {selected.bpu} · Pallet Size: {selected.pallet_size} · Weight AVG: {selected.weight_avg}</p>
      <p>BIN: {selected.bins.join(', ') || '—'}</p>
      <p className="mt-2 text-amber-800">Somente consulta. Nenhuma contagem será gravada nesta tela.</p>
    </aside>}
  </section>
}
