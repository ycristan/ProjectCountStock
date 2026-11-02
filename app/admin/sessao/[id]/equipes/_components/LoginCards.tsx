'use client'

import Link from 'next/link'
import type { Credencial } from '@/actions/sessao'
import { Notice, PageTop, buttonClass, tableWrapClass, thClass } from '@/components/ui'

const ROLE_LABEL: Record<string, string> = {
  contador_1: 'Counter 1',
  contador_2: 'Counter 2',
  independente: 'Independent',
}

export function LoginCards({ credentials, sessionId, setupOnly = false }: { credentials: Credencial[]; sessionId: string; setupOnly?: boolean }) {
  const cell = 'px-3 py-2.5'
  return (
    <div>
      <div className="print:hidden">
        <PageTop back={{ href: '/admin/sessoes', label: 'Sessions' }} title="Logins Generated" actions={<>
          {!setupOnly && <Link href={`/admin/sessao/${sessionId}/equipes`} className={buttonClass('outline', 'sm') + ' no-underline'}>Manage Teams</Link>}
          <Link href={`/admin/sessao/${sessionId}/imprimir`} className={buttonClass(setupOnly ? 'primary' : 'outline', 'sm') + ' no-underline'}>Print login cards</Link>
          {!setupOnly && <Link href={`/admin/sessao/${sessionId}/combinacao`} className={buttonClass('primary', 'sm') + ' no-underline'}>Live Count →</Link>}
        </>} />
      </div>
      {setupOnly && <div className="mb-4"><Notice tone="warn">Setup saved. New teams must be started individually from their monitor.</Notice></div>}
      <div className={tableWrapClass}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-ink text-ground">
              <th className={thClass}>Team</th>
              <th className={thClass}>Team Code</th>
              <th className={thClass}>Role</th>
              <th className={thClass}>Name</th>
              <th className={thClass}>Personal PIN</th>
            </tr>
          </thead>
          <tbody>
            {credentials.map((c, i) => (
              <tr key={i} className="border-t border-ground-2 even:bg-ground">
                <td className={cell}>{c.team}</td>
                <td className={cell + ' font-mono text-base font-semibold'}>{c.team_pin}</td>
                <td className={cell}>{ROLE_LABEL[c.role] ?? c.role}</td>
                <td className={cell}>{c.name ?? '—'}</td>
                <td className={cell + ' font-mono text-base font-semibold'}>{c.user_pin}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-[13px] text-ink-2 print:hidden">
        Team Code is shared by all team members. PIN is individual.
      </p>
    </div>
  )
}
