'use client'

import { useActionState } from 'react'
import { uploadInventory } from '@/actions/sessao'
import Link from 'next/link'

type UploadState = { error?: string; success?: boolean; count?: number } | null

export default function UploadPage() {
  const [state, formAction, pending] = useActionState<UploadState, FormData>(
    uploadInventory,
    null
  )

  if (state?.success) {
    return (
      <div>
        <h2 className="text-xl font-semibold text-slate-900 mb-4">Upload Inventário</h2>
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl mb-4">
          <p className="text-green-800 font-medium">
            {state.count} {state.count === 1 ? 'item importado' : 'itens importados'} com sucesso.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/admin"
            className="px-4 py-2 border border-slate-200 text-slate-700 bg-white rounded-xl hover:bg-slate-50"
          >
            Voltar ao Dashboard
          </Link>
          <Link
            href="/admin/sessao"
            className="px-4 py-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800"
          >
            Criar Sessão de Contagem
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Link href="/admin" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700 mb-4">
        ← Dashboard
      </Link>
      <div className="flex items-start justify-between mb-2">
        <h2 className="text-xl font-semibold text-slate-900">Upload Inventário</h2>
        <a
          href="/api/admin/inventario"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50"
        >
          ⬇️ Baixar atual
        </a>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        Arquivo .xlsx com colunas: Brand Code, Brand Name, Brand Purchase Unit, Pallet Size, Weight AVG,
        BIN Location 1–4.
      </p>
      <form action={formAction} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Arquivo</label>
          <input
            type="file"
            name="file"
            accept=".xlsx,.xls"
            required
            className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>
        {state?.error && (
          <p className="text-sm text-red-600">{state.error}</p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="px-6 py-2 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? 'Importando...' : 'Importar'}
        </button>
      </form>
    </div>
  )
}
