'use client'

import { useState, useTransition } from 'react'
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
    <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <h3 className="font-semibold text-slate-900">Defaults &amp; Notifications</h3>
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Default Tare (g)</label>
        <input
          type="number"
          min={1}
          value={tare}
          onChange={(e) => { setTare(e.target.value); setSaved(false) }}
          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-slate-900"
        />
        <p className="text-xs text-slate-400 mt-1">Used for new team and solo weight-count sessions. Sessions already open keep their own value.</p>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Default Weight Tolerance (g)</label>
        <input
          type="number"
          min={0}
          value={tolerance}
          onChange={(e) => { setTolerance(e.target.value); setSaved(false) }}
          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-slate-900"
        />
        <p className="text-xs text-slate-400 mt-1">Team sessions only. Maximum difference between C1 and C2 to auto-combine.</p>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Notification e-mail (solo counter results)</label>
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setSaved(false) }}
          placeholder="admin@example.com"
          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-slate-900"
        />
      </div>
      {erro && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700">{erro}</div>}
      <button
        type="submit"
        disabled={isPending}
        className="bg-slate-900 text-white font-semibold rounded-xl px-4 py-2 text-sm disabled:opacity-40"
      >
        {isPending ? 'Saving...' : saved ? 'Saved ✓' : 'Save'}
      </button>
    </form>
  )
}
