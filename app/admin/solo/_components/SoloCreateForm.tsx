'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { criarSoloSessao } from '@/actions/solo'

export function SoloCreateForm() {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    startTransition(async () => {
      const res = await criarSoloSessao(title)
      if (res.error) { setErro(res.error); return }
      router.push(`/admin/solo/${res.id}`)
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full border-2 border-dashed border-slate-300 rounded-xl py-4 text-sm font-semibold text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
      >
        + New Solo Count
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <h3 className="font-semibold text-slate-900">New Solo Count</h3>
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Aisle 3 spot check"
          autoFocus
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-slate-900"
        />
      </div>
      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700">{erro}</div>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending || !title.trim()}
          className="flex-1 bg-slate-900 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40"
        >
          {isPending ? 'Creating...' : 'Create →'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-500 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
