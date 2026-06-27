'use client'

import { useState, useEffect, useTransition } from 'react'
import type { ItemBusca } from '@/actions/contagem'
import { lancarContagem } from '@/actions/contagem'

type SucessoResult = {
  final_cases: number
  final_units: number
  brand_name: string
}

type Props = {
  item: ItemBusca
  onVoltar: () => void
  onSucesso: (result: SucessoResult) => void
}

function initBin(item: ItemBusca): string | null {
  if (item.binContexto) return item.binContexto
  if (item.bins.length === 1) return item.bins[0]
  if (item.bins.length === 0) return null
  return null
}

export function CountForm({ item, onVoltar, onSucesso }: Props) {
  const [binSelecionado, setBinSelecionado] = useState<string | null>(initBin(item))

  const entryAtual =
    item.entriesExistentes.find((e) => e.bin_location === binSelecionado) ??
    (item.entriesExistentes.length > 0 && item.bins.length <= 1
      ? item.entriesExistentes[0]
      : undefined)

  const isEdit = !!entryAtual

  const [pallets, setPallets] = useState(String(entryAtual?.pallets ?? 0))
  const [cases, setCases] = useState(String(entryAtual?.cases ?? 0))
  const [units, setUnits] = useState(String(entryAtual?.units ?? 0))
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    const entry = item.entriesExistentes.find((e) => e.bin_location === binSelecionado)
    if (entry) {
      setPallets(String(entry.pallets))
      setCases(String(entry.cases))
      setUnits(String(entry.units))
    } else {
      setPallets('0')
      setCases('0')
      setUnits('0')
    }
  }, [binSelecionado, item.entriesExistentes])

  const precisaSelecionarBin =
    !item.binContexto && item.bins.length > 1 && binSelecionado === null

  const handleSubmit = () => {
    if (precisaSelecionarBin) {
      setErro('Selecione um BIN antes de confirmar.')
      return
    }
    setErro(null)
    const p = Math.max(0, parseInt(pallets) || 0)
    const c = Math.max(0, parseInt(cases) || 0)
    const u = Math.max(0, parseInt(units) || 0)

    startTransition(async () => {
      const result = await lancarContagem({
        brand_code: item.brand_code,
        bin_location: binSelecionado,
        pallets: p,
        cases: c,
        units: u,
      })
      if (result.error) {
        setErro(result.error)
      } else {
        onSucesso({
          final_cases: result.final_cases!,
          final_units: result.final_units!,
          brand_name: result.brand_name!,
        })
      }
    })
  }

  const btnLabel = isPending ? 'Salvando...' : isEdit ? 'Salvar Edição' : 'Confirmar Contagem'

  return (
    <div>
      {/* Item header */}
      <div className="rounded-xl p-4 mb-4 bg-slate-900 text-white">
        <div className="flex items-start justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Item selecionado
          </div>
          {isEdit && (
            <span className="text-[11px] font-semibold bg-amber-500 text-white px-2 py-0.5 rounded-full uppercase tracking-wide">
              Editável
            </span>
          )}
        </div>
        <div className="text-xl font-bold mt-1">{item.brand_code}</div>
        <div className="text-sm text-slate-300">{item.brand_name}</div>
        <div className="text-xs text-slate-400 mt-1">
          {item.bins.length > 0 ? `BIN: ${item.bins.join(', ')} · ` : ''}
          BPU: {item.bpu} · Pallet: {item.pallet_size}
        </div>
      </div>

      {/* BIN selector */}
      {!item.binContexto && item.bins.length > 1 && (
        <div className="mb-4">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Selecione o BIN que está contando
          </div>
          <div className="flex gap-2 flex-wrap">
            {item.bins.map((bin) => (
              <button
                key={bin}
                onClick={() => setBinSelecionado(bin)}
                className={`px-3 py-2 rounded-lg text-sm border font-medium transition-colors ${
                  binSelecionado === bin
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'border-slate-200 text-slate-700 bg-white'
                }`}
              >
                {bin}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Pallets / Cases / Units */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: 'Pallets', value: pallets, set: setPallets },
          { label: 'Cases', value: cases, set: setCases },
          { label: 'Units', value: units, set: setUnits },
        ].map(({ label, value, set }) => (
          <div key={label} className="text-center">
            <div className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide mb-1">
              {label}
            </div>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={value}
              onChange={(e) => set(e.target.value)}
              className="w-full text-center text-2xl font-bold px-1 py-3 rounded-xl border-[1.5px] border-slate-200 bg-white focus:outline-none focus:border-blue-500"
            />
          </div>
        ))}
      </div>

      {!isEdit && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-600 mb-3">
          ℹ️ Zeros são válidos — confirma que o item foi contado e estava zerado.
        </div>
      )}

      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700 mb-3">
          {erro}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={isPending}
        className="w-full bg-slate-900 text-white font-semibold py-4 rounded-xl text-base transition-opacity disabled:opacity-40"
      >
        {btnLabel}
      </button>
      <button
        onClick={onVoltar}
        className="w-full mt-2 text-slate-500 text-sm py-3 rounded-xl border border-slate-200 bg-white"
      >
        ← Voltar à busca
      </button>
    </div>
  )
}
