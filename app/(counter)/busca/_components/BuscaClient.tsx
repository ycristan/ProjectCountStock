'use client'

import { useState, useCallback, useMemo } from 'react'
import { filterItems } from '@/lib/inventory-search'
import type { EntryExistente, ItemBusca, LancarContagemPayload, LancarContagemResult } from '@/actions/contagem'
import { SearchInput } from './SearchInput'
import { ResultList } from './ResultList'
import { CountForm } from './CountForm'
import { SuccessScreen } from './SuccessScreen'
import { Button } from '@/components/ui'

type Tela = 'busca' | 'form' | 'sucesso'

type SucessoData = {
  brandCode: string
  brandName: string
  finalCases: number
  finalUnits: number
}

type SucessoResult = {
  final_cases: number
  final_units: number
  brand_name: string
  entry: EntryExistente
}

type Props = {
  items: ItemBusca[]
  readOnly?: boolean
  // ponytail: solo count injeta submit próprio + header; padrão = fluxo de equipe
  onSubmit?: (payload: LancarContagemPayload) => Promise<LancarContagemResult>
  headerSlot?: React.ReactNode
  // ponytail: quando true, items já é a lista pré-selecionada (pequena) do admin —
  // mostra ela direto em vez de exigir que o contador já saiba o que procurar
  restrictToList?: boolean
}

export function BuscaClient({ items: initialItems, onSubmit, headerSlot, restrictToList, readOnly = false }: Props) {
  const [tela, setTela] = useState<Tela>('busca')
  const [termo, setTermo] = useState('')
  const [itemSelecionado, setItemSelecionado] = useState<ItemBusca | null>(null)
  const [isAdditive, setIsAdditive] = useState(false)
  const [modalItem, setModalItem] = useState<ItemBusca | null>(null)
  const [sucesso, setSucesso] = useState<SucessoData | null>(null)
  // ponytail: tracks the entry actually saved this session, keyed by brand_code —
  // the next addition must build on this, not on the page-load snapshot in initialItems
  const [entryOverrides, setEntryOverrides] = useState<Record<string, EntryExistente>>({})

  const items = useMemo(
    () =>
      initialItems.map((i) => {
        const override = entryOverrides[i.brand_code]
        return override ? { ...i, jaContado: true, entryExistente: override } : i
      }),
    [initialItems, entryOverrides]
  )

  const resultados = useMemo(
    () => (restrictToList && !termo.trim() ? items : filterItems(items, termo)),
    [items, termo, restrictToList]
  )

  const handleVoltar = useCallback(() => {
    setTela('busca')
    setItemSelecionado(null)
    setIsAdditive(false)
  }, [])

  const handleSucesso = useCallback(
    (result: SucessoResult) => {
      if (!itemSelecionado) return
      setEntryOverrides((prev) => ({ ...prev, [itemSelecionado.brand_code]: result.entry }))
      setSucesso({
        brandCode: itemSelecionado.brand_code,
        brandName: result.brand_name,
        finalCases: result.final_cases,
        finalUnits: result.final_units,
      })
      setTela('sucesso')
    },
    [itemSelecionado]
  )

  const handleDone = useCallback(() => {
    setTela('busca')
    setTermo('')
    setItemSelecionado(null)
    setIsAdditive(false)
    setSucesso(null)
  }, [])

  const abrirForm = useCallback((item: ItemBusca, additive: boolean) => {
    setModalItem(null)
    setItemSelecionado(item)
    setIsAdditive(additive)
    setTela('form')
  }, [])

  if (!readOnly && tela === 'sucesso' && sucesso) {
    return (
      <SuccessScreen
        brandCode={sucesso.brandCode}
        brandName={sucesso.brandName}
        finalCases={sucesso.finalCases}
        finalUnits={sucesso.finalUnits}
        onDone={handleDone}
      />
    )
  }

  if (!readOnly && tela === 'form' && itemSelecionado) {
    return (
      <CountForm
        item={itemSelecionado}
        isAdditive={isAdditive}
        onVoltar={handleVoltar}
        onSucesso={handleSucesso}
        onSubmit={onSubmit}
      />
    )
  }

  return (
    <div>
      {headerSlot}
      <h2 className="m-0 mb-3 font-display text-2xl font-bold uppercase tracking-[0.02em]">
        {restrictToList ? `Your items (${items.length})` : 'Search Item'}
      </h2>
      {readOnly && <p className="mb-3 text-sm text-ink-2">Product consultation only. Initial counts are entered by the counters.</p>}
      <SearchInput value={termo} onChange={setTermo} />

      {termo.trim() && resultados.length === 0 && (
        <p className="mt-4 text-center text-[15px] text-ink-2">
          No items found for &ldquo;{termo}&rdquo;.
        </p>
      )}

      <ResultList
        items={resultados}
        onSelect={(item) => {
          if (readOnly || item.jaContado) setModalItem(item)
          else abrirForm(item, false)
        }}
      />

      {!termo && !restrictToList && (
        <div className="mt-4 flex flex-col gap-3 rounded-md border border-line bg-surface p-4">
          <span className="text-[15px] font-semibold">Search by any part of</span>
          <span className="flex items-center gap-3 text-[15px]">
            <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-md bg-ink font-mono text-[13px] font-semibold text-safety">123</span>
            <span>Brand code, e.g. <strong className="font-mono">6323</strong></span>
          </span>
          <span className="flex items-center gap-3 text-[15px]">
            <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-md bg-ink text-safety">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square"><path d="M3 7l9-4 9 4v10l-9 4-9-4z" /><path d="M3 7l9 4 9-4M12 11v10" /></svg>
            </span>
            <span>Product name, e.g. <strong>kinder</strong></span>
          </span>
          <span className="flex items-center gap-3 text-[15px]">
            <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-md bg-ink text-safety">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square"><path d="M4 21V4h16v17" /><path d="M4 10h16M4 16h16" /></svg>
            </span>
            <span>BIN, e.g. <span className="rounded-sm border-[1.5px] border-ink bg-safety px-1.5 font-mono text-sm font-semibold">40A02</span></span>
          </span>
        </div>
      )}

      {modalItem && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-ink/60 p-3"
          onClick={() => setModalItem(null)}
        >
          <div
            role="dialog"
            aria-label={modalItem.brand_name}
            className="mx-auto w-full max-w-lg overflow-hidden rounded-2xl bg-surface"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-line px-5 py-4">
              <div className="font-mono text-[13px] font-semibold text-ink-2">{modalItem.brand_code}</div>
              <div className="mt-0.5 text-lg font-semibold">{modalItem.brand_name}</div>
              {readOnly && (
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <dt className="text-ink-2">BIN</dt><dd className="m-0 font-mono">{modalItem.bins.join(', ') || '—'}</dd>
                  <dt className="text-ink-2">BPU</dt><dd className="m-0">{modalItem.bpu}</dd>
                  <dt className="text-ink-2">Pallet</dt><dd className="m-0">{modalItem.pallet_size || '—'}</dd>
                  <dt className="text-ink-2">Weight</dt><dd className="m-0">{modalItem.weight_avg ? modalItem.weight_avg + ' g' : '—'}</dd>
                </dl>
              )}
              {!readOnly && modalItem.entryExistente && (
                <div className="mt-3 flex items-center justify-between rounded-md bg-ink px-3 py-2 text-ground">
                  <span className="text-sm">Your count</span>
                  <span className="font-display text-2xl font-bold text-safety">
                    {modalItem.entryExistente.pallets}p · {modalItem.entryExistente.cases}c · {modalItem.entryExistente.units}u
                  </span>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 p-4">
              {!readOnly && <>
                <Button variant="primary" size="lg" full onClick={() => abrirForm(modalItem, true)}>Add to Count</Button>
                <Button variant="outline" size="md" full onClick={() => abrirForm(modalItem, false)}>Edit Count</Button>
              </>}
              <Button variant="quiet" size="md" full onClick={() => setModalItem(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
