'use client'

import Link from 'next/link'
import type { Credencial } from '@/actions/sessao'

const ROLE_LABEL: Record<string, string> = {
  contador_1: 'Counter 1',
  contador_2: 'Counter 2',
  independente: 'Independent',
}

export function LoginCards({ credentials, sessionId, setupOnly = false }: { credentials: Credencial[]; sessionId: string; setupOnly?: boolean }) {
    return (
      <div>
        <div className="flex justify-between items-center mb-4 print:hidden">
          <h2 className="text-xl font-semibold text-slate-900">Logins Generated</h2>
          <div className="flex items-center gap-3">
            {!setupOnly && <Link
              href={`/admin/sessao/${sessionId}/equipes`}
              className="px-4 py-2 border border-slate-200 text-slate-700 bg-white rounded-xl hover:bg-slate-50 text-sm"
            >
              Manage Teams
            </Link>}
            <button
              onClick={() => window.print()}
              className="px-4 py-2 border border-slate-200 text-slate-700 bg-white rounded-xl hover:bg-slate-50 text-sm"
            >
              Print
            </button>
            {!setupOnly && <Link
              href={`/admin/sessao/${sessionId}/combinacao`}
              className="px-4 py-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 text-sm font-semibold"
            >
              Live Count →
            </Link>}
          </div>
        </div>
        {setupOnly && <p className="mb-4 text-amber-800">Setup saved. Counting is not activated in this development block.</p>}
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-200 px-3 py-2 text-left">Team</th>
              <th className="border border-slate-200 px-3 py-2 text-left">Team Code</th>
              <th className="border border-slate-200 px-3 py-2 text-left">Role</th>
              <th className="border border-slate-200 px-3 py-2 text-left">Name</th>
              <th className="border border-slate-200 px-3 py-2 text-left">Personal PIN</th>
            </tr>
          </thead>
          <tbody>
            {credentials.map((c, i) => (
              <tr key={i} className="even:bg-slate-50">
                <td className="border border-slate-200 px-3 py-2">{c.team}</td>
                <td className="border border-slate-200 px-3 py-2 font-mono font-bold text-blue-700">
                  {c.team_pin}
                </td>
                <td className="border border-slate-200 px-3 py-2">{ROLE_LABEL[c.role] ?? c.role}</td>
                <td className="border border-slate-200 px-3 py-2">{c.name ?? '—'}</td>
                <td className="border border-slate-200 px-3 py-2 font-mono font-bold">{c.user_pin}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 text-xs text-slate-500 print:hidden">
          Team Code is shared by all team members. PIN is individual.
        </p>
      </div>
    )
}
