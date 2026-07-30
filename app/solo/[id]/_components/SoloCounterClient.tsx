'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ItemBusca, LancarContagemPayload } from '@/actions/contagem'
import { BuscaClient } from '@/app/(counter)/busca/_components/BuscaClient'
import { lancarSoloContagemCounter, finalizarSoloContagemCounter, definirNomeContadorSolo } from '@/actions/solo'

type Props = {
  sessionId: string
  title: string
  counterName: string | null
  items: ItemBusca[]
}

export function SoloCounterClient({ sessionId, title, counterName, items }: Props) {
  const [name, setName] = useState(counterName)
  const [nameInput, setNameInput] = useState('')
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const router = useRouter()

  const onSubmit = (payload: LancarContagemPayload) => lancarSoloContagemCounter(sessionId, payload)

  function handleSetName(e: React.FormEvent) {
    e.preventDefault()
    if (!nameInput.trim()) return
    startTransition(async () => {
      const res = await definirNomeContadorSolo(sessionId, nameInput)
      if (res.error) { setErro(res.error); return }
      setErro(null)
      setName(nameInput.trim())
    })
  }

  function handleFinalise() {
    startTransition(async () => {
      const res = await finalizarSoloContagemCounter(sessionId)
      if (res.error) { setErro(res.error); return }
      router.push('/solo')
    })
  }

  if (!name) {
    return (
      <form onSubmit={handleSetName} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">Enter your name before you start counting.</p>
        <input
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="Your name"
          autoFocus
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-slate-900"
        />
        {erro && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700">{erro}</div>}
        <button
          type="submit"
          disabled={isPending || !nameInput.trim()}
          className="w-full bg-slate-900 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40"
        >
          Start counting →
        </button>
      </form>
    )
  }

  const header = (
    <div className="mb-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        <button
          onClick={handleFinalise}
          disabled={isPending}
          className="text-sm font-semibold bg-slate-900 text-white rounded-xl px-4 py-2 hover:bg-slate-700 disabled:opacity-40"
        >
          {isPending ? '...' : 'Finalise Count'}
        </button>
      </div>
      {erro && (
        <div className="mt-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700">{erro}</div>
      )}
    </div>
  )

  return <BuscaClient items={items} onSubmit={onSubmit} headerSlot={header} />
}
