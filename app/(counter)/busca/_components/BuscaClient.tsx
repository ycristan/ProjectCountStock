'use client'

import { useState, useCallback, useMemo } from 'react'
import type { EntryExistente, ItemBusca, LancarContagemPayload, LancarContagemResult } from '@/actions/contagem'
import { SearchInput } from './SearchInput'
import { ResultList } from './ResultList'
import { CountForm } from './CountForm'
import { SuccessScreen } from './SuccessScreen'

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

function filterItems(items: ItemBusca[], q: string): ItemBusca[] {
  const ql = q.trim().toLowerCase()
  if (!ql) return []

  if (/^\d+$/.test(ql)) {
    // Pure digits → brand_code prefix + BIN prefix combined, sorted ascending
    const byCode = items.filter((i) => i.brand_code.toLowerCase().startsWith(ql))
    const codeSet = new Set(byCode.map((i) => i.brand_code))
    const byBin = items.filter(
      (i) => !codeSet.has(i.brand_code) && i.bins.some((b) => b.toLowerCase().startsWith(ql))
    )
    return [...byCode, ...byBin].sort((a, b) => a.brand_code.localeCompare(b.brand_code))
  }

  if (/^\d/.test(ql)) {
    // Starts with digit, has letters → BIN prefix only (e.g. "40A")
    return items
      .filter((i) => i.bins.some((b) => b.toLowerCase().startsWith(ql)))
      .sort((a, b) => a.brand_code.localeCompare(b.brand_code))
  }

  // Starts with letter → brand_name contains, case-insensitive, sorted alphabetically
  return items
    .filter((i) => i.brand_name.toLowerCase().includes(ql))
    .sort((a, b) => a.brand_name.localeCompare(b.brand_name))
}

type Props = {
  items: ItemBusca[]
  // ponytail: solo count injeta submit próprio + header; padrão = fluxo de equipe
  onSubmit?: (payload: LancarContagemPayload) => Promise<LancarContagemResult>
  headerSlot?: React.ReactNode
  // ponytail: quando true, items já é a lista pré-selecionada (pequena) do admin —
  // mostra ela direto em vez de exigir que o contador já saiba o que procurar
  restrictToList?: boolean
}

export function BuscaClient({ items: initialItems, onSubmit, headerSlot, restrictToList }: Props) {
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
  const activeResults = resultados.filter((item) => item.brand_active)
  const inactiveResults = resultados.filter((item) => !item.brand_active)

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

  if (tela === 'sucesso' && sucesso) {
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

  if (tela === 'form' && itemSelecionado) {
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
      <h2 className="text-xl font-semibold text-slate-900 mb-4">
        {restrictToList ? `Your items (${items.length})` : 'Search Item'}
      </h2>
      <SearchInput value={termo} onChange={setTermo} />

      {termo.trim() && resultados.length === 0 && (
        <p className="text-sm text-slate-400 mt-3 text-center">
          No items found for &ldquo;{termo}&rdquo;.
        </p>
      )}

      <div className="mt-3 space-y-4">
        {activeResults.length > 0 && (
          <section>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
              <span className="h-px flex-1 bg-emerald-200" /> Active <span className="h-px flex-1 bg-emerald-200" />
            </div>
            <ResultList items={activeResults} status="active" onSelect={(item) => {
              if (item.jaContado) setModalItem(item)
              else abrirForm(item, false)
            }} />
          </section>
        )}
        {inactiveResults.length > 0 && (
          <section>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-rose-700">
              <span className="h-px flex-1 bg-rose-200" /> Inactive <span className="h-px flex-1 bg-rose-200" />
            </div>
            <p className="mb-2 text-xs text-rose-700">This product is no longer in the current inventory, but can still be counted if found.</p>
            <ResultList items={inactiveResults} status="inactive" onSelect={(item) => {
              if (item.jaContado) setModalItem(item)
              else abrirForm(item, false)
            }} />
          </section>
        )}
      </div>

      {!termo && !restrictToList && (
        <p className="text-sm text-slate-400 mt-4 text-center">
          Search by code (e.g. 6323), product name or BIN (e.g. 40A02)
        </p>
      )}

      {modalItem && (
        <div
          className="fixed inset-0 bg-slate-900/60 z-50 flex flex-col justify-end p-4"
          onClick={() => setModalItem(null)}
        >
          <div
            className="bg-white rounded-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                {modalItem.brand_code}
              </div>
              <div className="text-lg font-bold text-slate-900 mt-0.5">{modalItem.brand_name}</div>
              {modalItem.entryExistente && (
                <div className="mt-3 bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-sm text-green-800">
                  Registered Count:{' '}
                  <span className="font-bold">
                    {modalItem.entryExistente.pallets}p · {modalItem.entryExistente.cases}c ·{' '}
                    {modalItem.entryExistente.units}u
                  </span>
                </div>
              )}
            </div>
            <div className="p-4 flex flex-col gap-2">
              <button
                onClick={() => abrirForm(modalItem, true)}
                className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl text-base"
              >
                ➕ Add to Count
              </button>
              <button
                onClick={() => abrirForm(modalItem, false)}
                className="w-full border border-slate-200 text-slate-600 font-semibold py-3 rounded-xl text-sm bg-white"
              >
                ✏️ Edit Count
              </button>
              <button
                onClick={() => setModalItem(null)}
                className="w-full text-slate-400 text-sm py-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
