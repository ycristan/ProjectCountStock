'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Button, Tag, buttonClass, cardClass } from '@/components/ui'
import { useConfirm } from '@/components/confirm'
import { createAuditorAccess, revokeAuditorAccess, type AuditorAccess as Access } from '@/actions/auditor'

// One shared, read-only login for the whole session (DECISOES.md, 24/11): shown once here,
// no card per team. It ends by itself when the count closes; the admin can revoke it any time.
export function AuditorAccess({ sessionId, initial }: { sessionId: string; initial: Access | null }) {
  const [access, setAccess] = useState(initial)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const [confirm, confirmDialog] = useConfirm()
  const active = access && !access.revoked
  const pin = 'font-mono text-2xl font-bold'

  return <section className={cardClass + ' mt-6 flex flex-col gap-3 p-4'} aria-label="Auditor access">
    {confirmDialog}
    <div className="flex items-center justify-between gap-2">
      <h2 className="m-0 font-display text-2xl font-bold uppercase">Auditor access</h2>
      <Tag tone={active ? 'ok' : 'neutral'}>{active ? 'Active' : access ? 'Revoked' : 'Not created'}</Tag>
    </div>
    <p className="m-0 text-[15px] text-ink-2">Read-only. Sees only the live count of this session. Ends when the count closes.</p>
    {active && <div className="flex flex-wrap gap-6">
      <div className="flex flex-col"><span className="text-[13px] text-ink-2">Team code</span><span className={pin}>{access.team_code}</span></div>
      <div className="flex flex-col"><span className="text-[13px] text-ink-2">PIN</span><span className={pin}>{access.pin}</span></div>
    </div>}
    {error && <p role="alert" className="m-0 rounded-md bg-alert px-3 py-2 text-[15px] font-medium text-white">{error}</p>}
    <div className="flex flex-wrap gap-2">
      {active && <Link href={'/admin/sessao/' + sessionId + '/imprimir?only=auditor'} className={buttonClass('outline', 'sm') + ' no-underline'}>Print card</Link>}
      {active
        ? <Button variant="outline" size="sm" disabled={pending} onClick={async () => {
            if (!(await confirm({ title: 'Revoke Auditor access?', text: 'Auditors will lose access to the live count immediately.', confirm: 'Revoke' }))) return
            startTransition(async () => {
              const result = await revokeAuditorAccess(sessionId)
              if (result.error) setError(result.error); else { setError(''); setAccess(a => a && { ...a, revoked: true }) }
            })
          }}>Revoke access</Button>
        : <Button variant="primary" size="sm" disabled={pending} onClick={() => startTransition(async () => {
            const result = await createAuditorAccess(sessionId)
            if (result.error || !result.access) setError(result.error ?? 'Could not create the access.'); else { setError(''); setAccess(result.access) }
          })}>{access ? 'Create new access' : 'Create Auditor access'}</Button>}
    </div>
  </section>
}
