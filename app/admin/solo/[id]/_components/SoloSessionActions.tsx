'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { encerrarSoloSessao } from '@/actions/solo'

export function SoloSessionActions({ sessionId, status }: { sessionId: string; status: string }) {
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const router = useRouter()

  function handleClose() {
    startTransition(async () => {
      const res = await encerrarSoloSessao(sessionId)
      if (res.error) setErro(res.error)
      else router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {status === 'open' && (
        <button
          onClick={handleClose}
          disabled={isPending}
          className="bg-red-600 text-white font-semibold px-4 py-2 rounded-xl text-sm hover:bg-red-700 disabled:opacity-40"
        >
          {isPending ? '...' : 'Close Session'}
        </button>
      )}
      {erro && <div className="text-xs text-red-600">{erro}</div>}
    </div>
  )
}
