import { createClient } from '@/lib/supabase-server'
import { AppHeader, NavLink } from '@/components/ui'
import { Icon } from '@/components/icons'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const name = user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? 'Admin'

  return (
    <div className="min-h-screen bg-ground">
      <AppHeader name={name} detail="Admin" area="Admin" nav={<>
        <NavLink href="/admin" icon={<Icon name="home" />}>Home</NavLink>
        <NavLink href="/admin/sessoes" icon={<Icon name="live" />}>Sessions</NavLink>
        <NavLink href="/admin/inventario" icon={<Icon name="inventory" />}>Inventory</NavLink>
        {process.env.TEAM_SETUP_ENABLED === 'true' && <NavLink href="/admin/audit" icon={<Icon name="audit" />}>Audit Count</NavLink>}
        <NavLink href="/admin/settings" icon={<Icon name="settings" />}>Settings</NavLink>
      </>} />
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  )
}
