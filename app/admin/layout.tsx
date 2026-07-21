import { createClient } from '@/lib/supabase-server'
import { logout } from '@/actions/auth'
import { NextChainLockup } from '@/components/NextChainMark'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const name = user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? 'Admin'
  const initials = name
    .split(' ')
    .map((part: string) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="min-h-screen" style={{ background: 'var(--cs-bg)' }}>
      <header
        className="sticky top-0 z-50 flex items-center justify-between px-5 py-3"
        style={{ background: 'var(--cs-dark)' }}
      >
        <div className="flex items-center gap-3">
          <NextChainLockup tone="onDark" markSize={24} showTagline={false} />
          <span className="rounded-full border border-white/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">
            Admin
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm" style={{ color: 'var(--cs-faint)' }}>Hello, {name}</span>
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold"
            style={{ background: 'var(--cs-gradient)', color: 'var(--cs-accent-ink)' }}
          >
            {initials}
          </div>
          <form action={logout}>
            <button type="submit" className="text-sm text-slate-400 transition hover:text-white">
              Log out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  )
}
