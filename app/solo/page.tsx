import Link from 'next/link'
import { listarSoloSessoesAtribuidas } from '@/actions/solo'
import { AppHeader, PageTop } from '@/components/ui'

export default async function SoloListPage() {
  const sessions = await listarSoloSessoesAtribuidas()

  return <>
    <AppHeader name="Solo counter" detail="Solo count" />
    <main className="mx-auto max-w-lg px-4 py-6">
      <PageTop title="Your solo counts" />
      <div className="flex flex-col gap-3">
        {sessions.map((s) => (
          <Link
            key={s.id}
            href={`/solo/${s.id}`}
            className="flex items-center gap-3 rounded-md border-2 border-ink bg-surface p-4 text-ink no-underline"
          >
            <span className="flex min-w-0 flex-grow flex-col gap-1">
              <span className="font-display text-xl font-bold uppercase leading-tight">{s.title}</span>
              {s.counter_name && <span className="text-sm text-ink-2">Counted by {s.counter_name}</span>}
            </span>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square"><path d="M9 5l7 7-7 7" /></svg>
          </Link>
        ))}
        {sessions.length === 0 && (
          <p className="py-8 text-center text-[15px] text-ink-2">No solo counts assigned to you right now. Ask the admin to assign one.</p>
        )}
      </div>
    </main>
  </>
}
