'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ItemBusca, LancarContagemPayload } from '@/actions/contagem'
import { BuscaClient } from '@/app/(counter)/busca/_components/BuscaClient'
import { lancarSoloContagemCounter, finalizarSoloContagemCounter, definirNomeContadorSolo } from '@/actions/solo'
import { Button, FlagIcon, Label } from '@/components/ui'

type Props = {
  sessionId: string
  title: string
  counterName: string | null
  items: ItemBusca[]
  restrictToList: boolean
}

export function SoloCounterClient({ sessionId, title, counterName, items, restrictToList }: Props) {
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
      router.refresh() // the header shows the typed name
    })
  }

  function handleFinish() {
    if (!window.confirm('Finish this count? You will not be able to add or edit counts in this session.')) return
    startTransition(async () => {
      const res = await finalizarSoloContagemCounter(sessionId)
      if (res.error) { setErro(res.error); return }
      router.push('/solo')
    })
  }

  const alert = erro && <p role="alert" className="mb-3 rounded-md bg-alert px-3 py-2 text-[15px] font-medium text-white">{erro}</p>

  if (!name) {
    return (
      <form onSubmit={handleSetName} className="flex flex-col gap-4 rounded-md border-2 border-ink bg-surface p-5">
        <h1 className="m-0 font-display text-2xl font-bold uppercase">{title}</h1>
        <label className="flex flex-col gap-1.5">
          <Label>Your name</Label>
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            autoFocus
            autoComplete="name"
            className="min-h-13 rounded-md border-2 border-ink bg-surface px-3 text-[17px] font-medium outline-none focus-visible:outline-3 focus-visible:outline-info"
          />
          <span className="text-sm text-ink-2">Shown on this count and in the results. Enter it once, before you start.</span>
        </label>
        {alert}
        <Button type="submit" variant="primary" size="lg" full disabled={isPending || !nameInput.trim()}>Start counting</Button>
      </form>
    )
  }

  return <>
    <BuscaClient items={items} onSubmit={onSubmit} headerSlot={alert} restrictToList={restrictToList} />
    <div className="sticky bottom-0 -mx-4 mt-4 flex flex-col gap-1 border-t-2 border-ink bg-ground px-4 py-3">
      <Button variant="primary" size="lg" full disabled={isPending} onClick={handleFinish}><FlagIcon />Finish count</Button>
      <span className="text-center text-[13px] text-ink-2">Asks you to confirm before closing the count.</span>
    </div>
  </>
}
