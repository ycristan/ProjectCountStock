'use client'

import { useActionState } from 'react'
import { criarSessao } from '@/actions/sessao'

type SessaoState = { error?: string } | null

export default function SessaoPage() {
  const [state, formAction, pending] = useActionState<SessaoState, FormData>(
    criarSessao,
    null
  )

  return (
    <div>
      <h2 className="text-xl font-semibold text-slate-900 mb-4">Nova Sessão de Contagem</h2>
      <form action={formAction} className="space-y-6 max-w-sm">
        <div>
          <label
            htmlFor="num_equipes"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            Número de equipes
          </label>
          <input
            id="num_equipes"
            name="num_equipes"
            type="number"
            min={1}
            max={20}
            defaultValue={1}
            required
            className="w-full px-4 py-3 text-lg border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
          />
        </div>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full py-3 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? 'Criando...' : 'Criar Sessão'}
        </button>
      </form>
    </div>
  )
}
