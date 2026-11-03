import Link from 'next/link'
import { PageTop, cardClass } from '@/components/ui'

const choice = cardClass + ' flex flex-col gap-1 p-4 text-ink no-underline hover:border-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-info'

export default function SessaoTypePickerPage() {
  return (
    <div>
      <PageTop back={{ href: '/admin', label: 'Home' }} title="New Session" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link href="/admin/sessao/team" className={choice}>
          <strong className="font-display text-2xl font-bold uppercase">Team Count Session</strong>
          <span className="text-[15px] text-ink-2">Blind triple count with reconciliation across teams</span>
        </Link>
        <Link href="/admin/sessao/solo" className={choice}>
          <strong className="font-display text-2xl font-bold uppercase">Solo Count Session</strong>
          <span className="text-[15px] text-ink-2">Count yourself or assign to the solo counter — no reconciliation</span>
        </Link>
      </div>
    </div>
  )
}
