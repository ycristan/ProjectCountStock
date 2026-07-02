'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { verificarSoloPin } from '@/actions/solo'

export function PinForm({ sessionId }: { sessionId: string }) {
  const [pin, setPin] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    startTransition(async () => {
      const res = await verificarSoloPin(sessionId, pin)
      if (res.error) { setErro(res.error); return }
      router.push(`/solo/${sessionId}/contar`)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">PIN</label>
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          maxLength={4}
          placeholder="4-digit PIN"
          autoFocus
          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-lg text-center tracking-widest focus:outline-none focus:border-slate-900"
        />
      </div>
      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700">{erro}</div>
      )}
      <button
        type="submit"
        disabled={isPending || pin.length !== 4}
        className="w-full bg-slate-900 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40"
      >
        {isPending ? 'Verifying...' : 'Enter →'}
      </button>
    </form>
  )
}
