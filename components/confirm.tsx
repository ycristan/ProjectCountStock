'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { buttonClass } from './ui'

type Ask = { title: string; text?: string; confirm: string; tone?: 'primary' | 'alert' }

// In-app confirmation, never the browser's own box (Yuri, 02/11):
//   const [confirm, confirmDialog] = useConfirm()
//   if (!(await confirm({ title, text, confirm: 'Close team' }))) return
// and render {confirmDialog} once in the component. Cancel gets the first focus, so a
// stray Enter never confirms.
export function useConfirm() {
  const [ask, setAsk] = useState<(Ask & { resolve: (ok: boolean) => void }) | null>(null)
  const confirm = useCallback((options: Ask) => new Promise<boolean>(resolve => setAsk({ ...options, resolve })), [])
  const close = (ok: boolean) => { ask?.resolve(ok); setAsk(null) }
  return [confirm, ask ? <ConfirmDialog {...ask} onClose={close} /> : null] as const
}

function ConfirmDialog({ title, text, confirm, tone = 'primary', onClose }: Ask & { onClose: (ok: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { ref.current?.showModal() }, [])
  return <dialog ref={ref} aria-labelledby="confirm-title" onCancel={e => { e.preventDefault(); onClose(false) }}
    className="m-auto w-[min(92vw,400px)] rounded-md border-2 border-ink bg-surface p-5 text-ink backdrop:bg-ink/60">
    <h2 id="confirm-title" className="m-0 mb-2 text-center font-display text-2xl font-bold uppercase text-balance">{title}</h2>
    {text && <p className="m-0 mb-4 text-center text-[15px] text-ink-2">{text}</p>}
    <div className="grid grid-cols-2 gap-2">
      <button type="button" className={buttonClass('outline')} onClick={() => onClose(false)}>Cancel</button>
      <button type="button" data-confirm className={buttonClass(tone)} onClick={() => onClose(true)}>{confirm}</button>
    </div>
  </dialog>
}
