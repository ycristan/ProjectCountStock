import { createClient } from '@/lib/supabase-server'
import { logout } from '@/actions/auth'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const name = user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? 'Admin'

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-50 bg-slate-900 px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-white text-base">Count Stock — Admin</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-300">Hello, {name}</span>
          <form action={logout}>
            <button type="submit" className="text-sm text-slate-400 hover:text-white">
              Log out
            </button>
          </form>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
