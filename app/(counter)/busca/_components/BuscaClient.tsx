'use client'

import { useState, useEffect, useCallback } from 'react'
import { buscarItens, type ItemBusca, type LancarContagemResult } from '@/actions/contagem'
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

export function BuscaClient() {
  const [tela, setTela] = useState<Tela>('busca')
  const [termo, setTermo] = useState('')
  const [resultados, setResultados] = useState<ItemBusca[]>([])
  const [loading, setLoading] = useState(false)
  const [itemSelecionado, setItemSelecionado] = useState<ItemBusca | null>(null)
  const [sucesso, setSucesso] = useState<SucessoData | null>(null)

  // Busca com debounce 300 ms
  useEffect(() => {
    if (!termo.trim()) {
      setResultados([])
      return
    }
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const items = await buscarItens(termo)
        setResultados(items)
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => {
      clearTimeout(timer)
      setLoading(false)
    }
  }, [termo])

  const handleVoltar = useCallback(() => {
    setTela('busca')
    setItemSelecionado(null)
  }, [])

  const handleSucesso = useCallback(
    (result: Required<Pick<LancarContagemResult, 'final_cases' | 'final_units' | 'brand_name'>>) => {
      setSucesso({
        brandCode: itemSelecionado!.brand_code,
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
    setSucesso(null)
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
          setItemSelecionado(item)
          setTela('form')
        }}
      />

      {!termo && (
        <p className="text-sm text-slate-400 mt-4 text-center">
          Busque por código (ex: 6323), nome do produto ou BIN (ex: A-01)
        </p>
      )}
    </div>
  )
}
