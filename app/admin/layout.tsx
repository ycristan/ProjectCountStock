import { createClient } from '@/lib/supabase-server'
import { AppHeader, type NavItem } from '@/components/ui'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const name = user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? 'Admin'

  const items: NavItem[] = [
    { href: '/admin', label: 'Home', icon: 'home' },
    { href: '/admin/sessoes', label: 'Sessions', icon: 'live' },
    { href: '/admin/inventario', label: 'Inventory', icon: 'inventory' },
    ...(process.env.TEAM_SETUP_ENABLED === 'true' ? [{ href: '/admin/audit', label: 'Audit Count', icon: 'audit' } as const] : []),
    { href: '/admin/settings', label: 'Settings', icon: 'settings', more: true },
  ]

  return (
    <div className="min-h-screen bg-ground">
      <AppHeader name={name} detail="Admin" area="Admin" items={items} />
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  )
}
