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
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Upload Inventário</h2>
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg mb-4">
          <p className="text-green-800 font-medium">
            {state.count} {state.count === 1 ? 'item importado' : 'itens importados'} com sucesso.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/admin"
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            Voltar ao Dashboard
          </Link>
          <Link
            href="/admin/sessao"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Criar Sessão de Contagem
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Upload Inventário</h2>
      <p className="text-sm text-gray-500 mb-6">
        Arquivo .xlsx com colunas: Brand Code, Brand Name, Brand Purchase Unit, Pallet Size,
        BIN Location 1–4.
      </p>
      <form action={formAction} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Arquivo</label>
          <input
            type="file"
            name="file"
            accept=".xlsx,.xls"
            required
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>
        {state?.error && (
          <p className="text-sm text-red-600">{state.error}</p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? 'Importando...' : 'Importar'}
        </button>
      </form>
    </div>
  )
}
