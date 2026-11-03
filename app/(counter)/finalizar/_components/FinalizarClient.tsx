'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button, FlagIcon, Notice, buttonClass } from '@/components/ui'
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
      <div className="mx-auto flex max-w-sm flex-col items-center gap-3 py-10 text-center">
        <span aria-hidden="true" className="flex size-16 items-center justify-center rounded-md bg-ok text-4xl font-bold text-white">✓</span>
        <h1 className="m-0 font-display text-3xl font-bold uppercase">Count Finalised!</h1>
        {finalizadoEm && <p className="m-0 text-[15px] text-ink-2">{new Date(finalizadoEm).toLocaleString('en-GB')}</p>}
        <p className="m-0 mb-4 text-[15px] text-ink-2">The admin has been notified. You can still add more items if necessary.</p>
        <Link href="/busca" className={buttonClass('primary', 'lg', true) + ' no-underline'}>Continue Counting</Link>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 py-10 text-center">
      <span aria-hidden="true" className="flex size-16 items-center justify-center rounded-md bg-ink text-white"><FlagIcon /></span>
      <h1 className="m-0 font-display text-3xl font-bold uppercase">Finalise Count</h1>
      <p className="m-0 mb-4 text-[15px] text-ink-2">Confirm that you have finished counting all items under your responsibility?</p>
      {error && <Notice>{error}</Notice>}
      <Button variant="primary" size="lg" full onClick={handleFinalizar} disabled={loading}>
        {loading ? 'Finalising...' : "Confirm — I'm done!"}
      </Button>
      <Link href="/busca" className="inline-flex min-h-11 items-center text-[15px] font-medium text-ink">← Back to Search</Link>
    </div>
  )
}
