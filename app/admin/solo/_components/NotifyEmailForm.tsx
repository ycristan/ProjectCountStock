'use client'

import { useState, useTransition } from 'react'
import { salvarNotifyEmail } from '@/actions/solo'

export function NotifyEmailForm({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail)
  const [saved, setSaved] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setSaved(false)
    startTransition(async () => {
      const res = await salvarNotifyEmail(email)
      if (res.error) { setErro(res.error); return }
      setSaved(true)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-4 mb-6 flex items-end gap-3 flex-wrap">
      <div className="flex-1 min-w-[200px]">
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
          Notification e-mail (solo counter results)
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setSaved(false) }}
          placeholder="admin@example.com"
          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-slate-900"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="text-sm font-semibold bg-slate-900 text-white rounded-xl px-4 py-2 disabled:opacity-40"
      >
        {isPending ? 'Saving...' : saved ? 'Saved ✓' : 'Save'}
      </button>
      {erro && <div className="w-full text-sm text-red-700">{erro}</div>}
    </form>
  )
}
