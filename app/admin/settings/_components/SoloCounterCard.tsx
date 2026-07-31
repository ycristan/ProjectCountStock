'use client'

import { useState, useTransition } from 'react'
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
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <h3 className="font-semibold text-slate-900">Solo Counter</h3>

      {revealedPin ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
            New credentials — write these down, they won&apos;t be shown again
          </p>
          <div className="flex gap-4 font-mono text-lg font-bold text-slate-900">
            <span>Team: {revealedPin.team_pin}</span>
            <span>PIN: {revealedPin.user_pin}</span>
          </div>
          <button onClick={() => setRevealedPin(null)} className="text-xs font-semibold text-amber-800 underline">
            I&apos;ve saved it
          </button>
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-500">
            {active
              ? 'Active — you can assign sessions to it.'
              : "No solo counter configured — sessions can't be assigned until you create one."}
          </p>

          {erro && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700">{erro}</div>}

          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={isPending}
              className="text-sm font-semibold bg-slate-900 text-white rounded-xl px-4 py-2 disabled:opacity-40"
            >
              {isPending ? '...' : active ? 'Create New Solo Counter' : 'Create Solo Counter'}
            </button>
            {active && !confirmingDelete && (
              <button
                onClick={() => setConfirmingDelete(true)}
                className="text-sm font-semibold text-red-600 border border-red-200 rounded-xl px-4 py-2 hover:bg-red-50"
              >
                Delete
              </button>
            )}
            {confirmingDelete && (
              <>
                <button
                  onClick={handleDelete}
                  disabled={isPending}
                  className="text-sm font-semibold bg-red-600 text-white rounded-xl px-4 py-2 disabled:opacity-40"
                >
                  Confirm delete
                </button>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  disabled={isPending}
                  className="text-sm text-slate-500 px-4 py-2 disabled:opacity-40"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
          {confirmingDelete && (
            <p className="text-xs text-amber-600">
              Anyone currently logged in or mid-count with this PIN will immediately lose access.
            </p>
          )}
        </>
      )}
    </div>
  )
}
