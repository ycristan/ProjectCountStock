'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { verificarSoloPin } from '@/actions/solo'

export default function SoloPinPage() {
  const [pin, setPin] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    startTransition(async () => {
      const res = await verificarSoloPin(pin)
      if (res.error) setErro(res.error)
      else router.push('/solo/busca')
    })
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-white font-bold text-xl mb-1">COUNT STOCK</div>
          <div className="text-slate-400 text-sm">Solo Count — Enter PIN to access</div>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Access PIN
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Enter PIN"
              className="w-full text-center text-3xl font-bold tracking-[0.3em] border-2 border-slate-200 rounded-xl py-4 focus:outline-none focus:border-slate-900"
              autoFocus
            />
          </div>
          {erro && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700">
              {erro}
            </div>
          )}
          <button
            type="submit"
            disabled={isPending || !pin.trim()}
            className="w-full bg-slate-900 text-white font-semibold py-4 rounded-xl disabled:opacity-40"
          >
            {isPending ? 'Checking...' : 'Enter →'}
          </button>
        </form>
      </div>
    </div>
  )
}
