'use client'

import { useRef, useState } from 'react'
import { cancelTeamSigning, formalizeCounterAbsence, recordIndependentAbsence, signWithPin, witnessIndependentAbsence } from '@/actions/team-signing'
import type { TeamSigning } from '@/lib/team-count-types'

type Run = (action: () => Promise<{ error?: string }>, done: string) => void
type Form = { membershipId: string; mode: 'sign' | 'absent' | 'witness' }

// R11: Independent first, then counters in order. Every confirmation is made by
// the person (PIN) or formalized as an absence; nothing is signed on someone's behalf.
export function SigningPanel({ teamId, signing, isAdmin, pending, run }: {
  teamId: string; signing: TeamSigning; isAdmin: boolean; pending: boolean; run: Run
}) {
  const [form, setForm] = useState<Form | null>(null)
  const [pin, setPin] = useState('')
  const [reason, setReason] = useState('')
  const [witnessId, setWitnessId] = useState('')
  // A retry of the same confirmation reuses its command; the database returns the original receipt.
  const commands = useRef(new Map<string, string>())
  const command = (key: string) => {
    const full = signing.versionId + ':' + key
    if (!commands.current.has(full)) commands.current.set(full, crypto.randomUUID())
    return commands.current.get(full)!
  }
  const independent = signing.participants.find(p => p.role === 'independent')!
  const presentCounters = signing.participants.filter(p => p.role === 'counter' && !p.departed)
  const open = (next: Form | null) => { setForm(next); setPin(''); setReason(''); setWitnessId(presentCounters[0]?.membershipId ?? '') }
  const done = (action: () => Promise<{ error?: string }>, message: string) =>
    run(async () => { const result = await action(); if (!result.error) open(null); return result }, message)
  const pinInput = (label: string) => <label className="block text-sm">{label}
    <input type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={pin}
      onChange={e => setPin(e.target.value.replace(/\D/g, ''))} className="block border rounded p-2 w-32" />
  </label>
  const reasonInput = <label className="block text-sm">Reason
    <input value={reason} onChange={e => setReason(e.target.value)} className="block border rounded p-2 w-full" />
  </label>

  return <div className="mt-4 space-y-3" data-signing={signing.versionId}>
    <h2 className="font-semibold">Signatures</h2>
    <p className="text-sm">{signing.frozen
      ? 'Result frozen: a confirmation was received. Only the remaining confirmations can be completed.'
      : 'Each person confirms the accepted result with their own PIN.'}</p>
    {signing.participants.map(p => {
      const c = p.confirmation
      const status = !c ? 'Pending' : c.kind === 'pin' ? 'Signed by PIN'
        : p.role === 'independent' && !c.witnessed ? 'Absent: ' + c.reason + ' — waiting for a witness' : 'Absent: ' + c.reason
      const active = form?.membershipId === p.membershipId ? form.mode : null
      const reasonKey = reason.trim()
      return <div key={p.membershipId} data-participant={p.name} data-status={status} className="border rounded-xl p-3 space-y-2">
        <div className="flex justify-between gap-2">
          <span className="font-semibold">{p.role === 'independent' ? 'Independent' : 'Counter ' + p.order} — {p.name}</span>
          <span>{status}</span>
        </div>
        {!c && !active && <div className="flex flex-wrap gap-2">
          {!p.departed && <button disabled={pending} className="bg-slate-900 text-white rounded px-3 py-2"
            onClick={() => open({ membershipId: p.membershipId, mode: 'sign' })}>SIGN BY PIN CODE</button>}
          {(p.role === 'counter' || isAdmin) && <button disabled={pending} className="border rounded px-3 py-2"
            onClick={() => open({ membershipId: p.membershipId, mode: 'absent' })}>Absent</button>}
        </div>}
        {c && p.role === 'independent' && !c.witnessed && !active && <div className="flex flex-wrap gap-2">
          {presentCounters.length > 0 && <button disabled={pending} className="border rounded px-3 py-2"
            onClick={() => open({ membershipId: p.membershipId, mode: 'witness' })}>Witness by counter PIN</button>}
          {isAdmin && <button disabled={pending} className="border rounded px-3 py-2" onClick={() => {
            if (window.confirm('Confirm as witness that the Independent is absent?'))
              done(() => witnessIndependentAbsence(teamId, signing.versionId, command('witness:admin'), null), 'Absence witnessed.')
          }}>Witness as admin</button>}
        </div>}
        {active === 'sign' && <div className="space-y-2">
          {pinInput(p.name + ' — PIN')}
          <button disabled={pending || pin.length !== 4} className="bg-slate-900 text-white rounded px-3 py-2 disabled:opacity-40"
            onClick={() => done(() => signWithPin(teamId, p.membershipId, pin, signing.versionId, command('sign:' + p.membershipId)),
              'Signed: ' + p.name + '.')}>Confirm signature</button>
          <button className="border rounded px-3 py-2 ml-2" onClick={() => open(null)}>Cancel</button>
        </div>}
        {active === 'absent' && <div className="space-y-2">
          {reasonInput}
          {p.role === 'counter' && pinInput('Independent (' + independent.name + ') — PIN')}
          <button disabled={pending || !reasonKey || (p.role === 'counter' && pin.length !== 4)}
            className="bg-slate-900 text-white rounded px-3 py-2 disabled:opacity-40"
            onClick={() => done(() => p.role === 'counter'
              ? formalizeCounterAbsence(teamId, p.membershipId, reasonKey, independent.membershipId, pin, signing.versionId,
                command('absent:' + p.membershipId + ':' + reasonKey))
              : recordIndependentAbsence(teamId, reasonKey, signing.versionId, command('absent:independent:' + reasonKey)),
              'Absence recorded: ' + p.name + '.')}>Record absence</button>
          <button className="border rounded px-3 py-2 ml-2" onClick={() => open(null)}>Cancel</button>
        </div>}
        {active === 'witness' && <div className="space-y-2">
          <label className="block text-sm">Witness
            <select value={witnessId} onChange={e => setWitnessId(e.target.value)} className="block border rounded p-2">
              {presentCounters.map(w => <option key={w.membershipId} value={w.membershipId}>{w.name}</option>)}
            </select>
          </label>
          {pinInput('Witness PIN')}
          <button disabled={pending || pin.length !== 4 || !witnessId} className="bg-slate-900 text-white rounded px-3 py-2 disabled:opacity-40"
            onClick={() => done(() => witnessIndependentAbsence(teamId, signing.versionId, command('witness:' + witnessId),
              { membershipId: witnessId, pin }), 'Absence witnessed.')}>Confirm as witness</button>
          <button className="border rounded px-3 py-2 ml-2" onClick={() => open(null)}>Cancel</button>
        </div>}
      </div>
    })}
    {isAdmin && !signing.frozen && <button disabled={pending} className="w-full border border-slate-300 rounded-xl py-3 font-semibold"
      onClick={() => {
        if (window.confirm('Cancel signature collection? The result goes back to admin review.'))
          run(() => cancelTeamSigning(teamId, signing.versionId, command('cancel')), 'Signature collection cancelled.')
      }}>Cancel signature collection</button>}
  </div>
}
