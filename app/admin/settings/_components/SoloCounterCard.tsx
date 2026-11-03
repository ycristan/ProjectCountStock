'use client'

import { useState, useTransition } from 'react'
import { Button, Label, Notice, cardClass } from '@/components/ui'
import { criarContadorSoloFixo, deletarContadorSoloFixo } from '@/actions/settings'

export function SoloCounterCard({ initialActive }: { initialActive: boolean }) {
  const [active, setActive] = useState(initialActive)
  const [revealedPin, setRevealedPin] = useState<{ team_pin: string; user_pin: string } | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleCreate() {
    setErro(null)
    setConfirmingDelete(false)
    startTransition(async () => {
      const res = await criarContadorSoloFixo()
      if (res.error) { setErro(res.error); return }
      setRevealedPin({ team_pin: res.team_pin!, user_pin: res.user_pin! })
      setActive(true)
    })
  }

  function handleDelete() {
    setErro(null)
    startTransition(async () => {
      const res = await deletarContadorSoloFixo()
      if (res.error) { setErro(res.error); return }
      setActive(false)
      setRevealedPin(null)
      setConfirmingDelete(false)
    })
  }

  return (
    <div className={cardClass + ' flex flex-col gap-4 p-4'}>
      <h2 className="m-0 font-display text-xl font-bold uppercase">Solo Counter</h2>

      {revealedPin ? (
        <div className="flex flex-col gap-3 rounded-md border-2 border-ink bg-ground p-4">
          <Label>New credentials — write these down, they won&apos;t be shown again</Label>
          <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-lg font-semibold">
            <span>Team: {revealedPin.team_pin}</span>
            <span>PIN: {revealedPin.user_pin}</span>
          </div>
          <Button variant="dark" size="sm" className="w-fit" onClick={() => setRevealedPin(null)}>I&apos;ve saved it</Button>
        </div>
      ) : (
        <>
          <p className="m-0 text-[15px] text-ink-2">
            {active
              ? 'Active — you can assign sessions to it.'
              : "No solo counter configured — sessions can't be assigned until you create one."}
          </p>

          {erro && <Notice>{erro}</Notice>}

          <div className="flex flex-wrap gap-2">
            <Button variant={active ? 'outline' : 'primary'} size="sm" onClick={handleCreate} disabled={isPending}>
              {isPending ? '...' : active ? 'Create New Solo Counter' : 'Create Solo Counter'}
            </Button>
            {active && !confirmingDelete && (
              <Button variant="danger" size="sm" onClick={() => setConfirmingDelete(true)}>Delete</Button>
            )}
            {confirmingDelete && (
              <>
                <Button variant="alert" size="sm" onClick={handleDelete} disabled={isPending}>Confirm delete</Button>
                <Button variant="quiet" size="sm" onClick={() => setConfirmingDelete(false)} disabled={isPending}>Cancel</Button>
              </>
            )}
          </div>
          {confirmingDelete && (
            <Notice tone="warn">Anyone currently logged in or mid-count with this PIN will immediately lose access.</Notice>
          )}
        </>
      )}
    </div>
  )
}
