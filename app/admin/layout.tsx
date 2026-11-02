import { createClient } from '@/lib/supabase-server'
import { AppHeader, NavLink } from '@/components/ui'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const name = user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? 'Admin'

  return (
    <div className="min-h-screen bg-ground">
      <AppHeader name={name} detail="Admin" area="Admin" nav={<>
        <NavLink href="/admin">Home</NavLink>
        {process.env.TEAM_SETUP_ENABLED === 'true' && <NavLink href="/admin/audit">Audit Count</NavLink>}
        <NavLink href="/admin/settings">Settings</NavLink>
      </>} />
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  )
}
