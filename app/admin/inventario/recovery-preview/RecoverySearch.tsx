'use client'

import { useMemo, useState } from 'react'
import type { ItemBusca } from '@/actions/contagem'
import { filterItems } from '@/lib/inventory-search'
import { projectWarehouseRecovery } from '@/lib/warehouse-recovery-preview'
import { Notice, cardClass, segmentClass, segmentGroupClass } from '@/components/ui'
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
  return <section className="flex flex-col gap-3">
    <div role="group" aria-label="Visão" className={segmentGroupClass + ' w-fit'}>
      <button type="button" aria-pressed={!after} className={segmentClass(!after)} onClick={() => { setAfter(false); setSelected(null) }}>Antes — dados atuais</button>
      <button type="button" aria-pressed={after} className={segmentClass(after)} onClick={() => { setAfter(true); setSelected(null) }}>Depois — projeção da recuperação</button>
    </div>
    <p className="m-0 text-[15px] text-ink-2" role="status">
      {after ? 'Projeção, não aplicada' : 'Inventário atual do destino'}: {visible.length} produtos.
      Busca: {results.length} resultado(s), {results.filter(item => item.brand_active !== false).length} ativo(s), {results.filter(item => item.brand_active === false).length} inativo(s).
    </p>
    <SearchInput value={query} onChange={value => { setQuery(value); setSelected(null) }} />
    <ResultList items={results} onSelect={setSelected} />
    {results.length === 0 && <p className="m-0 text-[15px] text-ink-2">Nenhum produto encontrado.</p>}
    {selected && <aside aria-label="Product details" className={cardClass + ' flex flex-col gap-1 p-4'}>
      <h2 className="m-0 font-display text-2xl font-bold uppercase">{selected.brand_code} — {selected.brand_name}</h2>
      <p className="m-0">BPU: {selected.bpu} · Pallet Size: {selected.pallet_size} · Weight AVG: {selected.weight_avg}</p>
      <p className="m-0">BIN: {selected.bins.join(', ') || '—'}</p>
      <Notice tone="warn">Somente consulta. Nenhuma contagem será gravada nesta tela.</Notice>
    </aside>}
  </section>
}
