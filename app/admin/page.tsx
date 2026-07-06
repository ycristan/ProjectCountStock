import Link from 'next/link'
import { Upload, Package, PlusCircle, ScanLine, Users, User } from 'lucide-react'
import { createClient } from '@/lib/supabase-server'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: latestSession } = await supabase
    .from('count_sessions')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const manageTeamsHref = latestSession
    ? `/admin/sessao/${latestSession.id}/equipes`
    : '/admin/sessao'

  const cards = [
    { href: '/admin/upload', icon: Upload, title: 'Upload Inventory', desc: 'Import .xlsx with Brand Codes and BIN Locations' },
    { href: '/admin/inventario', icon: Package, title: 'View Inventory', desc: 'View and edit inventory items' },
    { href: '/admin/sessao', icon: PlusCircle, title: 'New Session', desc: 'Create a count session and configure teams' },
    { href: '/admin/sessoes', icon: ScanLine, title: 'Monitor Count', desc: 'Track team progress in real time' },
    { href: manageTeamsHref, icon: Users, title: 'Manage Teams', desc: 'View counters, rename or delete teams' },
    { href: '/admin/solo', icon: User, title: 'Solo Count', desc: 'Count inventory yourself — no teams, no reconciliation' },
  ]

  return (
    <div>
      <h2 className="mb-6 text-2xl" style={{ color: 'var(--cs-ink)' }}>Dashboard</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ href, icon: Icon, title, desc }) => (
          <Link key={href} href={href} className="cs-card block bg-white p-6 transition-all hover:shadow-sm">
            <div
              className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ background: 'var(--cs-surface-2)', color: 'var(--cs-accent)' }}
            >
              <Icon size={20} strokeWidth={1.75} />
            </div>
            <h3 className="mb-1 font-semibold" style={{ color: 'var(--cs-ink)' }}>{title}</h3>
            <p className="text-sm" style={{ color: 'var(--cs-muted)' }}>{desc}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
