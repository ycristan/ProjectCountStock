'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { forcarFecharSessao, deletarSessao } from '@/actions/sessao'

type Session = { id: string; created_at: string; status: string }

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
    return <p className="text-sm text-slate-500">No sessions created yet.</p>
  }

  return (
    <>
      <div className="space-y-3">
        {sessoes.map((s) => {
          const label = new Date(s.created_at).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
          return (
            <div
              key={s.id}
              className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex items-center justify-between gap-4"
            >
              <div>
                <div className="text-sm font-medium text-slate-900">{label}</div>
                <div className="text-xs text-slate-500 mt-0.5">Status: {s.status}</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                <Link
                  href={`/admin/sessao/${s.id}/combinacao`}
                  className="text-sm font-medium text-blue-600 hover:text-blue-800 whitespace-nowrap"
                >
                  Live Count →
                </Link>
                <button
                  onClick={() => handleForceClose(s)}
                  disabled={closingId === s.id}
                  className="text-xs font-semibold text-amber-700 border border-amber-300 bg-amber-50 hover:bg-amber-100 rounded-lg px-3 py-1.5 disabled:opacity-50 whitespace-nowrap"
                >
                  {closingId === s.id ? '...' : 'Force Close'}
                </button>
                <button
                  onClick={() => { setDeleteTeams(false); setDeleteModal(s) }}
                  className="text-xs font-semibold text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 rounded-lg px-3 py-1.5 whitespace-nowrap"
                >
                  Delete
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {deleteModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-bold text-slate-900 text-base mb-1">Delete session?</h3>
            <p className="text-sm text-slate-500 mb-4">
              {new Date(deleteModal.created_at).toLocaleDateString('en-GB', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
              <br />
              All count entries, reconciliations and combined results will be permanently removed.
            </p>
            <label className="flex items-start gap-3 mb-6 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={deleteTeams}
                onChange={(e) => setDeleteTeams(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-red-600 flex-shrink-0"
              />
              <span className="text-sm text-slate-700">
                Also delete teams and counter accounts involved in this session
              </span>
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteModal(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? '...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
