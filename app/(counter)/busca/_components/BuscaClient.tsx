'use client'

import { useState, useEffect, useCallback } from 'react'
import { buscarItens } from '@/actions/contagem'
import type { ItemBusca, LancarContagemResult } from '@/actions/contagem'
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
}

export function BuscaClient() {
  const [tela, setTela] = useState<Tela>('busca')
  const [termo, setTermo] = useState('')
  const [resultados, setResultados] = useState<ItemBusca[]>([])
  const [loading, setLoading] = useState(false)
  const [itemSelecionado, setItemSelecionado] = useState<ItemBusca | null>(null)
  const [isAdditive, setIsAdditive] = useState(false)
  const [modalItem, setModalItem] = useState<ItemBusca | null>(null)
  const [sucesso, setSucesso] = useState<SucessoData | null>(null)

  useEffect(() => {
    if (!termo.trim()) {
      setResultados([])
      return
    }
    setLoading(true)
    let active = true
    const timer = setTimeout(async () => {
      try {
        const items = await buscarItens(termo)
        if (active) setResultados(items)
      } catch (_e) {
        if (active) setResultados([])
      } finally {
        if (active) setLoading(false)
      }
    }, 300)
    return () => {
      active = false
      clearTimeout(timer)
      setLoading(false)
    }
  }, [termo])

  const handleVoltar = useCallback(() => {
    setTela('busca')
    setItemSelecionado(null)
    setIsAdditive(false)
  }, [])

  const handleSucesso = useCallback(
    (result: SucessoResult) => {
      if (!itemSelecionado) return
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
    setResultados([])
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
      />
    )
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-slate-900 mb-4">Buscar Item</h2>
      <SearchInput value={termo} onChange={setTermo} loading={loading} />

      {termo.trim() && resultados.length === 0 && !loading && (
        <p className="text-sm text-slate-400 mt-3 text-center">
          Nenhum item encontrado para &ldquo;{termo}&rdquo;.
        </p>
      )}

      <ResultList
        items={resultados}
        onSelect={(item) => {
          if (item.jaContado) {
            setModalItem(item)
          } else {
            abrirForm(item, false)
          }
        }}
      />

      {!termo && (
        <p className="text-sm text-slate-400 mt-4 text-center">
          Busque por código (ex: 6323), nome do produto ou BIN (ex: A-01)
        </p>
      )}

      {/* Modal de escolha — item já contado */}
      {modalItem && (
        <div
          className="fixed inset-0 bg-slate-900/60 z-50 flex flex-col justify-end p-4"
          onClick={() => setModalItem(null)}
        >
          <div
            className="bg-white rounded-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Info do item */}
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                {modalItem.brand_code}
              </div>
              <div className="text-lg font-bold text-slate-900 mt-0.5">{modalItem.brand_name}</div>
              {modalItem.entryExistente && (
                <div className="mt-3 bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-sm text-green-800">
                  Contagem registrada:{' '}
                  <span className="font-bold">
                    {modalItem.entryExistente.pallets}p · {modalItem.entryExistente.cases}c · {modalItem.entryExistente.units}u
                  </span>
                </div>
              )}
            </div>

            {/* Ações */}
            <div className="p-4 flex flex-col gap-2">
              <button
                onClick={() => abrirForm(modalItem, true)}
                className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl text-base"
              >
                ➕ Adicionar à contagem
              </button>
              <button
                onClick={() => abrirForm(modalItem, false)}
                className="w-full border border-slate-200 text-slate-600 font-semibold py-3 rounded-xl text-sm bg-white"
              >
                ✏️ Editar contagem
              </button>
              <button
                onClick={() => setModalItem(null)}
                className="w-full text-slate-400 text-sm py-2"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
