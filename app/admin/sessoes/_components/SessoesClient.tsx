'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button, Tag, buttonClass, cardClass } from '@/components/ui'
import { forcarFecharSessao, deletarSessao } from '@/actions/sessao'

type Session = { id: string; created_at: string; status: string; href: string }

export function SessoesClient({ sessoes }: { sessoes: Session[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [closingId, setClosingId] = useState<string | null>(null)
  const [deleteModal, setDeleteModal] = useState<Session | null>(null)
  const [deleteTeams, setDeleteTeams] = useState(false)
  const [deleting, setDeleting] = useState(false)

  function handleForceClose(s: Session) {
    setClosingId(s.id)
    startTransition(async () => {
      await forcarFecharSessao(s.id)
      setClosingId(null)
      router.refresh()
    })
  }

  async function handleDelete() {
    if (!deleteModal) return
    setDeleting(true)
    await deletarSessao(deleteModal.id, deleteTeams)
    setDeleting(false)
    setDeleteModal(null)
    router.refresh()
  }

  if (!sessoes.length) {
    return <p className="m-0 text-[15px] text-ink-2">No sessions created yet.</p>
  }

  const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <>
      <div className="flex flex-col gap-3">
        {sessoes.map((s) => (
          <div key={s.id} className={cardClass + ' flex flex-wrap items-center justify-between gap-3 p-3.5'}>
            <div className="flex min-w-0 flex-col gap-1">
              <strong className="text-base">{fmt(s.created_at)}</strong>
              <span className="flex items-center gap-2 text-[13px] text-ink-2">Status <Tag tone={s.status === 'fechada' ? 'neutral' : 'ok'}>{s.status === 'fechada' ? 'Closed' : 'Open'}</Tag></span>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link href={s.href} className={buttonClass('outline', 'sm') + ' no-underline'}>Live Count</Link>
              <Button variant="quiet" size="sm" onClick={() => handleForceClose(s)} disabled={closingId === s.id}>
                {closingId === s.id ? '...' : 'Force Close'}
              </Button>
              <Button variant="danger" size="sm" onClick={() => { setDeleteTeams(false); setDeleteModal(s) }}>Delete</Button>
            </div>
          </div>
        ))}
      </div>

      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="delete-title" className="w-full max-w-sm rounded-md border-2 border-ink bg-surface p-5">
            <h2 id="delete-title" className="m-0 mb-2 font-display text-2xl font-bold uppercase">Delete session?</h2>
            <p className="m-0 mb-4 text-[15px] text-ink-2">
              {fmt(deleteModal.created_at)}
              <br />
              All count entries, reconciliations and combined results will be permanently removed.
            </p>
            <label className="mb-5 flex cursor-pointer select-none items-start gap-3">
              <input
                type="checkbox"
                checked={deleteTeams}
                onChange={(e) => setDeleteTeams(e.target.checked)}
                className="mt-1 size-5 shrink-0 accent-alert"
              />
              <span className="text-[15px]">Also delete teams and counter accounts involved in this session</span>
            </label>
            <div className="flex gap-2">
              <Button variant="outline" full onClick={() => setDeleteModal(null)}>Cancel</Button>
              <Button variant="alert" full onClick={handleDelete} disabled={deleting}>
                {deleting ? '...' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
