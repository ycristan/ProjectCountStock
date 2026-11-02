import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase-admin'
import { PageTop, Tag, buttonClass, cardClass } from '@/components/ui'

export default async function AdminSoloPage() {
  const admin = createAdminClient()
  const { data: sessions } = await admin
    .from('solo_sessions')
    .select('id, title, status, created_at')
    .order('created_at', { ascending: false })

  return (
    <div>
      <PageTop back={{ href: '/admin', label: 'Home' }} title="Solo Count"
        actions={<Link href="/admin/sessao/solo" className={buttonClass('primary', 'sm') + ' no-underline'}>New Solo Count</Link>} />

      <div className="flex flex-col gap-3">
        {(sessions ?? []).map((s) => (
          <div key={s.id} className={cardClass + ' flex flex-wrap items-center justify-between gap-3 p-3.5'}>
            <div className="flex min-w-0 flex-col gap-1">
              <strong className="text-base">{s.title}</strong>
              <span className="text-[13px] text-ink-2">{new Date(s.created_at).toLocaleDateString('en-GB')}</span>
            </div>
            <div className="flex items-center gap-3">
              <Tag tone={s.status === 'open' ? 'ok' : 'neutral'}>{s.status}</Tag>
              <Link href={`/admin/solo/${s.id}`} className={buttonClass('outline', 'sm') + ' no-underline'}>
                {s.status === 'open' ? 'Count' : 'View'}
              </Link>
            </div>
          </div>
        ))}
        {!(sessions ?? []).length && <p className="m-0 py-8 text-center text-[15px] text-ink-2">No solo counts yet.</p>}
      </div>
    </div>
  )
}
