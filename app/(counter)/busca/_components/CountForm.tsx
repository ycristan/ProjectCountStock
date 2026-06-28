'use client'

import { useState, useTransition } from 'react'
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

type Rodada = { id: number; caixas: string; pesoFmt: string }

function parseGrams(fmt: string): number {
  return parseInt(fmt.replace(/\D/g, '') || '0', 10)
}

function formatGrams(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  const num = parseInt(digits || '0', 10)
  return num === 0 ? '' : num.toLocaleString('pt-BR')
}

export function CountForm({ item, onVoltar, onSucesso }: Props) {
  const entry = item.entryExistente
  const isEdit = !!entry

  const [modo, setModo] = useState<'normal' | 'peso'>('normal')
  const [rodadas, setRodadas] = useState<Rodada[]>([{ id: 0, caixas: '', pesoFmt: '' }])
  const [pallets, setPallets] = useState(String(entry?.pallets ?? 0))
  const [cases, setCases] = useState(String(entry?.cases ?? 0))
  const [units, setUnits] = useState(String(entry?.units ?? 0))
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function addRodada() {
    setRodadas((prev) => [...prev, { id: Date.now(), caixas: '', pesoFmt: '' }])
  }

  function removeRodada(id: number) {
    setRodadas((prev) => prev.filter((r) => r.id !== id))
  }

  function updateRodada(id: number, field: 'caixas' | 'pesoFmt', value: string) {
    setRodadas((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r
        return { ...r, [field]: field === 'pesoFmt' ? formatGrams(value) : value }
      })
    )
  }

  // ponytail: inline — evita 2 reduces extras vs função separada
  const totalTara = rodadas.reduce((s, r) => s + parseInt(r.caixas || '0', 10) * item.box_tare_g, 0)
  const totalPeso = rodadas.reduce((s, r) => s + parseGrams(r.pesoFmt), 0)
  const liquido = totalPeso - totalTara
  const raw = liquido > 0 && item.weight_avg > 0 ? liquido / item.weight_avg : 0
  const decimal = raw - Math.floor(raw)
  const weightQty = raw > 0 ? (decimal >= 0.7 ? Math.ceil(raw) : Math.floor(raw)) : 0
  const hasWeightData = totalPeso > 0

  const handleSubmit = () => {
    setErro(null)

    let p = 0, c = 0, u = 0
    if (modo === 'peso') {
      if (!hasWeightData) {
        setErro('Informe o peso para calcular a quantidade.')
        return
      }
      if (weightQty <= 0) {
        setErro('Peso líquido insuficiente — verifique o número de caixas.')
        return
      }
      u = weightQty
    } else {
      p = Math.max(0, parseInt(pallets) || 0)
      c = Math.max(0, parseInt(cases) || 0)
      u = Math.max(0, parseInt(units) || 0)
    }

    startTransition(async () => {
      try {
        const result = await lancarContagem({
          brand_code: item.brand_code,
          pallets: p,
          cases: c,
          units: u,
          is_weight_count: modo === 'peso',
        })
        if (result.error) {
          setErro(result.error)
        } else {
          onSucesso({ final_cases: result.final_cases!, final_units: result.final_units!, brand_name: result.brand_name! })
        }
      } catch {
        // ponytail: action ID fica stale após novo deploy — Next.js vai recarregar a página
        setErro('Aplicação atualizada — feche e reabra o app e tente novamente.')
      }
    })
  }

  const btnLabel = isPending ? 'Salvando...' : isEdit ? 'Salvar Edição' : 'Confirmar Contagem'

  return (
    <div>
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
          {item.weight_avg > 0 && ` · ⚖️ ${item.weight_avg}g/un`}
        </div>
      </div>

      {item.weight_avg > 0 && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            onClick={() => setModo('normal')}
            className={`rounded-xl py-3 text-sm font-semibold border-2 transition-colors ${
              modo === 'normal'
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 text-slate-600 bg-white'
            }`}
          >
            🔢 Contagem normal
          </button>
          <button
            onClick={() => setModo('peso')}
            className={`rounded-xl py-3 text-sm font-semibold border-2 transition-colors ${
              modo === 'peso'
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 text-slate-600 bg-white'
            }`}
          >
            ⚖️ Contar por peso
          </button>
        </div>
      )}

      {modo === 'normal' && (
        <>
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
        </>
      )}

      {modo === 'peso' && (
        <div className="mb-4 space-y-3">
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            📦 Tara: <strong className="text-slate-700">{item.box_tare_g.toLocaleString('pt-BR')} g/cx</strong>
            <span className="text-slate-300">·</span>
            ⚖️ Peso/un: <strong className="text-slate-700">{item.weight_avg} g</strong>
          </div>

          {rodadas.map((r, i) => (
            <div key={r.id} className="border border-slate-200 rounded-xl p-3 bg-white">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Rodada {i + 1}
                </span>
                {rodadas.length > 1 && (
                  <button
                    onClick={() => removeRodada(r.id)}
                    className="text-slate-300 hover:text-red-500 text-lg leading-none"
                  >
                    ✕
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide mb-1">
                    Nº de caixas
                  </div>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={r.caixas}
                    onChange={(e) => updateRodada(r.id, 'caixas', e.target.value)}
                    placeholder="0"
                    className="w-full text-center text-xl font-bold px-2 py-2.5 rounded-xl border-[1.5px] border-slate-200 bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide mb-1">
                    Peso (g)
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={r.pesoFmt}
                    onChange={(e) => updateRodada(r.id, 'pesoFmt', e.target.value)}
                    placeholder="0"
                    className="w-full text-center text-xl font-bold px-2 py-2.5 rounded-xl border-[1.5px] border-slate-200 bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          ))}

          <button
            onClick={addRodada}
            className="w-full border-2 border-dashed border-slate-200 rounded-xl py-2.5 text-sm font-semibold text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          >
            + Nova rodada de pesagem
          </button>

          <div className={`rounded-xl p-4 border ${
            hasWeightData && weightQty > 0 ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-slate-500">
                <span>Tara total</span>
                <span>{hasWeightData ? `${totalTara.toLocaleString('pt-BR')} g` : '— g'}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Peso líquido</span>
                <span>{hasWeightData ? `${Math.max(0, liquido).toLocaleString('pt-BR')} g` : '— g'}</span>
              </div>
            </div>
            <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-200">
              <span className={`text-sm font-bold ${
                hasWeightData && weightQty > 0 ? 'text-green-700' : 'text-slate-400'
              }`}>
                Resultado
              </span>
              <span className={`text-2xl font-bold ${
                hasWeightData && weightQty > 0 ? 'text-green-700' : 'text-slate-300'
              }`}>
                {hasWeightData ? `${weightQty} un` : '— un'}
              </span>
            </div>
          </div>
        </div>
      )}

      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700 mb-3">
          {erro}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={isPending || (modo === 'peso' && weightQty <= 0)}
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
