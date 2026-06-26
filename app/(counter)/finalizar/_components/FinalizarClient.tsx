'use client'

import { useState } from 'react'
import Link from 'next/link'
import { finalizarContagem } from '@/actions/finalizacao'

type Props = {
  jaFinalizado: boolean
  finalizadoEm: string | null
}

export function FinalizarClient({ jaFinalizado, finalizadoEm }: Props) {
  const [done, setDone] = useState(jaFinalizado)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFinalizar() {
    setLoading(true)
    setError(null)
    const result = await finalizarContagem()
    if (result.error) {
      setError(result.error)
    } else {
      setDone(true)
    }
    setLoading(false)
  }

  if (done) {
    return (
      <div className="text-center py-12 max-w-sm mx-auto">
        <div className="text-5xl mb-4">✅</div>
        <div className="text-xl font-bold text-slate-900 mb-2">Contagem finalizada!</div>
        {finalizadoEm && (
          <div className="text-sm text-slate-500 mb-2">
            {new Date(finalizadoEm).toLocaleString('pt-BR')}
          </div>
        )}
        <div className="text-sm text-slate-500 mb-8">
          O admin foi notificado. Você ainda pode lançar mais itens se necessário.
        </div>
        <Link
          href="/busca"
          className="block w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold text-center"
        >
          Continuar contando
        </Link>
      </div>
    )
  }

  return (
    <div className="text-center py-12 max-w-sm mx-auto">
      <div className="text-5xl mb-4">🏁</div>
      <div className="text-xl font-bold text-slate-900 mb-2">Finalizar Contagem</div>
      <div className="text-sm text-slate-500 mb-8">
        Confirma que terminou de contar todos os itens da sua responsabilidade?
      </div>
      {error && <div className="text-sm text-red-600 mb-4">{error}</div>}
      <button
        onClick={handleFinalizar}
        disabled={loading}
        className="w-full py-4 bg-amber-500 text-white font-semibold rounded-xl text-base mb-3 disabled:opacity-50"
      >
        {loading ? 'Finalizando...' : 'Confirmar — terminei!'}
      </button>
      <Link href="/busca" className="block text-sm text-slate-500">
        ← Voltar à busca
      </Link>
    </div>
  )
}
