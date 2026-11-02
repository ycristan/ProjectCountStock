'use client'

import { useState, useTransition } from 'react'
import { Button, Label, Notice, cardClass, inputClass } from '@/components/ui'
import { salvarConfigSistema } from '@/actions/settings'

type Props = { initial: { default_box_tare_g: number; default_tolerance_g: number; notify_email: string } }

export function SystemSettingsForm({ initial }: Props) {
  const [tare, setTare] = useState(String(initial.default_box_tare_g))
  const [tolerance, setTolerance] = useState(String(initial.default_tolerance_g))
  const [email, setEmail] = useState(initial.notify_email)
  const [saved, setSaved] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setSaved(false)
    startTransition(async () => {
      const res = await salvarConfigSistema({
        default_box_tare_g: parseInt(tare) || 0,
        default_tolerance_g: parseInt(tolerance) || 0,
        notify_email: email,
      })
      if (res.error) { setErro(res.error); return }
      setSaved(true)
    })
  }

  return (
    <form onSubmit={handleSubmit} className={cardClass + ' flex flex-col gap-4 p-4'}>
      <h2 className="m-0 font-display text-xl font-bold uppercase">Defaults &amp; Notifications</h2>
      <label className="flex flex-col gap-1.5">
        <Label>Default Tare (g)</Label>
        <input type="number" min={1} value={tare} onChange={(e) => { setTare(e.target.value); setSaved(false) }} className={inputClass} />
        <span className="text-[13px] text-ink-2">Used for new team and solo weight-count sessions. Sessions already open keep their own value.</span>
      </label>
      <label className="flex flex-col gap-1.5">
        <Label>Default Weight Tolerance (g)</Label>
        <input type="number" min={0} value={tolerance} onChange={(e) => { setTolerance(e.target.value); setSaved(false) }} className={inputClass} />
        <span className="text-[13px] text-ink-2">Team sessions only. Maximum difference between C1 and C2 to auto-combine.</span>
      </label>
      <label className="flex flex-col gap-1.5">
        <Label>Notification e-mail (solo counter results)</Label>
        <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setSaved(false) }} placeholder="admin@example.com" className={inputClass} />
      </label>
      {erro && <Notice>{erro}</Notice>}
      <Button type="submit" variant="primary" disabled={isPending}>
        {isPending ? 'Saving...' : saved ? 'Saved' : 'Save'}
      </Button>
    </form>
  )
}
