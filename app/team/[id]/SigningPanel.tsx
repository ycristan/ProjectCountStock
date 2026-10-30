'use client'

import { useRef, useState } from 'react'
import { cancelTeamSigning, confirmTeamClose, formalizeCounterAbsence, recordIndependentAbsence, signWithPin, witnessIndependentAbsence } from '@/actions/team-signing'
import type { TeamSigning } from '@/lib/team-count-types'
import { Button, Label } from '@/components/ui'

type Run = (action: () => Promise<{ error?: string }>, done: string) => void
type Form = { membershipId: string; mode: 'sign' | 'absent' | 'witness' }

// R11 (revised 2026-10-29): counters sign first, the Independent last, then the admin
// closes the team. Every confirmation is made by the person (PIN) or formalized as an
// absence; nothing is signed on someone's behalf. The database enforces the order.
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
  const ordered = [...signing.participants].sort((a, b) =>
    Number(a.role === 'independent') - Number(b.role === 'independent') || a.order - b.order)
  const countersDone = signing.participants.every(p => p.role === 'independent' || p.confirmation)
  const complete = countersDone && !!independent.confirmation
    && (independent.confirmation.kind === 'pin' || independent.confirmation.witnessed)
  const open = (next: Form | null) => { setForm(next); setPin(''); setReason(''); setWitnessId(presentCounters[0]?.membershipId ?? '') }
  const done = (action: () => Promise<{ error?: string }>, message: string) =>
    run(async () => { const result = await action(); if (!result.error) open(null); return result }, message)
  const pinInput = (label: string) => <label className="flex flex-col gap-1.5"><Label>{label}</Label>
    <input type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={pin}
      onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
      className="w-full rounded-lg border-2 border-ink bg-surface py-2.5 text-center font-mono text-[28px] font-semibold tracking-[0.5em] outline-none focus:outline-3 focus:outline-info" />
  </label>
  const reasonInput = <label className="flex flex-col gap-1.5"><Label>Reason</Label>
    <input value={reason} onChange={e => setReason(e.target.value)}
      className="w-full rounded-lg border-2 border-ink bg-surface px-3 py-2.5 text-[17px] outline-none focus:outline-3 focus:outline-info" />
  </label>

  return <div className="flex flex-col gap-3" data-signing={signing.versionId}>
    <h2 className="m-0 font-display text-2xl font-bold uppercase tracking-[0.03em]">Sign the result</h2>
    <p className="m-0 text-[15px] leading-snug text-ink-2">{signing.frozen
      ? 'Result frozen: a confirmation was received. Only the remaining confirmations can be completed.'
      : 'Each person confirms the accepted result with their own PIN.'} Counters sign first, the Independent last;
      then the admin closes the team.</p>
    {ordered.map(p => {
      const c = p.confirmation
      const status = !c ? 'Pending' : c.kind === 'pin' ? 'Signed by PIN'
        : p.role === 'independent' && !c.witnessed ? 'Absent: ' + c.reason + ' — waiting for a witness' : 'Absent: ' + c.reason
      const active = form?.membershipId === p.membershipId ? form.mode : null
      const reasonKey = reason.trim()
      const waiting = p.role === 'independent' && !countersDone
      const signed = c && (c.kind === 'pin' || p.role === 'counter' || c.witnessed)
      return <div key={p.membershipId} data-participant={p.name} data-status={status}
        className={'flex flex-col gap-3 rounded-md p-3 ' + (active ? 'border-2 border-ink bg-surface'
          : waiting && !c ? 'border border-dashed border-line-2 bg-[#ECE9E1]' : 'border border-line bg-surface')}>
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className={'flex size-8 shrink-0 items-center justify-center rounded-full font-display font-bold '
            + (signed ? 'bg-ok text-white' : c ? 'bg-info text-white' : waiting ? 'border border-line-2 bg-surface text-ink-2' : 'bg-safety text-ink')}>
            {signed ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12l5 5 9-10" /></svg>
              : p.role === 'independent' ? 'I' : p.order}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-[15px] font-semibold">{p.role === 'independent' ? 'Independent' : 'Counter ' + p.order} — {p.name}</span>
            <span className="text-[13px] text-ink-2">{status}</span>
          </span>
        </div>
        {!c && waiting && <p className="m-0 text-sm text-ink-2">Signs after every counter.</p>}
        {!c && !active && !waiting && <div className="flex flex-wrap gap-2">
          {!p.departed && <Button variant="dark" size="md" disabled={pending}
            onClick={() => open({ membershipId: p.membershipId, mode: 'sign' })}>SIGN BY PIN CODE</Button>}
          {(p.role === 'counter' || isAdmin) && <Button variant="quiet" size="sm" disabled={pending}
            onClick={() => open({ membershipId: p.membershipId, mode: 'absent' })}>Absent</Button>}
        </div>}
        {c && p.role === 'independent' && !c.witnessed && !active && <div className="flex flex-wrap gap-2">
          {presentCounters.length > 0 && <Button variant="quiet" size="sm" disabled={pending}
            onClick={() => open({ membershipId: p.membershipId, mode: 'witness' })}>Witness by counter PIN</Button>}
          {isAdmin && <Button variant="quiet" size="sm" disabled={pending} onClick={() => {
            if (window.confirm('Confirm as witness that the Independent is absent?'))
              done(() => witnessIndependentAbsence(teamId, signing.versionId, command('witness:admin'), null), 'Absence witnessed.')
          }}>Witness as admin</Button>}
        </div>}
        {active === 'sign' && <div className="flex flex-col gap-2">
          {pinInput(p.name + ' — PIN')}
          <Button variant="primary" size="md" disabled={pending || pin.length !== 4}
            onClick={() => done(() => signWithPin(teamId, p.membershipId, pin, signing.versionId, command('sign:' + p.membershipId)),
              'Signed: ' + p.name + '.')}>Confirm signature</Button>
          <Button variant="outline" size="md" onClick={() => open(null)}>Cancel</Button>
        </div>}
        {active === 'absent' && <div className="flex flex-col gap-2">
          {reasonInput}
          {p.role === 'counter' && pinInput('Independent (' + independent.name + ') — PIN')}
          <Button variant="primary" size="md" disabled={pending || !reasonKey || (p.role === 'counter' && pin.length !== 4)}
            onClick={() => done(() => p.role === 'counter'
              ? formalizeCounterAbsence(teamId, p.membershipId, reasonKey, independent.membershipId, pin, signing.versionId,
                command('absent:' + p.membershipId + ':' + reasonKey))
              : recordIndependentAbsence(teamId, reasonKey, signing.versionId, command('absent:independent:' + reasonKey)),
              'Absence recorded: ' + p.name + '.')}>Record absence</Button>
          <Button variant="outline" size="md" onClick={() => open(null)}>Cancel</Button>
        </div>}
        {active === 'witness' && <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1.5"><Label>Witness</Label>
            <select value={witnessId} onChange={e => setWitnessId(e.target.value)} className="min-h-12 rounded-lg border-2 border-ink bg-surface px-3 text-[17px]">
              {presentCounters.map(w => <option key={w.membershipId} value={w.membershipId}>{w.name}</option>)}
            </select>
          </label>
          {pinInput('Witness PIN')}
          <Button variant="primary" size="md" disabled={pending || pin.length !== 4 || !witnessId}
            onClick={() => done(() => witnessIndependentAbsence(teamId, signing.versionId, command('witness:' + witnessId),
              { membershipId: witnessId, pin }), 'Absence witnessed.')}>Confirm as witness</Button>
          <Button variant="outline" size="md" onClick={() => open(null)}>Cancel</Button>
        </div>}
      </div>
    })}
    {complete && !isAdmin && <p role="status" className="m-0 rounded-xl bg-ok p-4 text-[17px] font-medium text-white">All signatures received. Waiting for the admin to close the team.</p>}
    {complete && isAdmin && <Button variant="primary" size="lg" full disabled={pending}
      onClick={() => {
        if (window.confirm('Close this team? Its results become permanent and every team login stops working.'))
          run(() => confirmTeamClose(teamId, signing.versionId, command('close')), 'Team closed.')
      }}>Confirm and close team</Button>}
    {isAdmin && !signing.frozen && <Button variant="outline" size="md" full disabled={pending}
      onClick={() => {
        if (window.confirm('Cancel signature collection? The result goes back to admin review.'))
          run(() => cancelTeamSigning(teamId, signing.versionId, command('cancel')), 'Signature collection cancelled.')
      }}>Cancel signature collection</Button>}
  </div>
}
