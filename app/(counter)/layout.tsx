import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { logout } from '@/actions/auth'

export default async function CounterLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const name = user?.user_metadata?.full_name ?? 'Counter'
  const role = user?.user_metadata?.counter_role as string | undefined
  const teamId = user?.user_metadata?.team_id as string | undefined

  let bannerType: 'pending' | 'confirm' | 'reconciliando' | null = null
  let pendingCount = 0

  if (teamId) {
    const admin = createAdminClient()
    const { data: team } = await admin.from('teams').select('status').eq('id', teamId).single()

    if (team?.status === 'reconciliando') {
      if (role === 'independente') {
        const { count } = await admin
          .from('reconciliation_items')
          .select('id', { count: 'exact', head: true })
          .eq('team_id', teamId)
          .eq('status', 'discrepancia')
        pendingCount = count ?? 0
        bannerType = pendingCount > 0 ? 'pending' : 'confirm'
      } else {
        bannerType = 'reconciliando'
      }
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-slate-900 px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-white text-base">Count Stock</span>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-300">Hello, {name}</span>
          {role !== 'independente' && (
            <Link href="/finalizar" className="text-sm text-amber-400 font-medium">
              Finalise
            </Link>
          )}
          <form action={logout}>
            <button type="submit" className="text-sm text-slate-400 hover:text-white">
              Log out
            </button>
          </form>
        </div>
      </header>
      {bannerType === 'pending' && (
        <Link
          href="/reconciliacao"
          className="block px-4 py-3 text-center text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600"
        >
          ⚠️ {pendingCount} {pendingCount === 1 ? 'item needs' : 'items need'} reconciliation → View list
        </Link>
      )}
      {bannerType === 'confirm' && (
        <Link
          href="/reconciliacao"
          className="block px-4 py-3 text-center text-sm font-semibold text-white bg-green-600 hover:bg-green-700"
        >
          ✓ All items reconciled — click here to confirm
        </Link>
      )}
      {bannerType === 'reconciliando' && (
        <div className="block px-4 py-3 text-center text-sm font-semibold text-white bg-blue-600">
          ℹ️ Reconciliation in progress — the independent counter is reviewing discrepancies
        </div>
      )}
      <main className="px-4 py-6 max-w-lg mx-auto">{children}</main>
    </div>
  )
}
