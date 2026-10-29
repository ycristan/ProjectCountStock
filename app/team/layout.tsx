import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { isAdmin } from '@/lib/authorization'
import { logout } from '@/actions/auth'

// Same header as the counter and admin areas: the person always sees who is signed in.
export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const admin = await isAdmin()
  const name = user?.user_metadata?.full_name ?? (admin ? user?.email?.split('@')[0] : null) ?? 'Counter'

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-50 bg-slate-900 px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-white text-base">Count Stock{admin ? ' — Admin' : ''}</span>
        <div className="flex items-center gap-4">
          {admin && <Link href="/admin" className="text-sm text-slate-300 hover:text-white">Admin home</Link>}
          <span className="text-sm text-slate-300">Hello, {name}</span>
          <form action={logout}>
            <button type="submit" className="text-sm text-slate-400 hover:text-white">Log out</button>
          </form>
        </div>
      </header>
      {children}
    </div>
  )
}
