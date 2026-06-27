import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { logout } from '@/actions/auth'

export default async function CounterLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const name = user?.user_metadata?.full_name ?? 'Contador'

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-slate-900 px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-white text-base">Count Stock</span>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-300">Olá, {name}</span>
          <Link href="/finalizar" className="text-sm text-amber-400 font-medium">
            Finalizar
          </Link>
          <form action={logout}>
            <button type="submit" className="text-sm text-slate-400 hover:text-white">
              Sair
            </button>
          </form>
        </div>
      </header>
      <main className="px-4 py-6 max-w-lg mx-auto">{children}</main>
    </div>
  )
}
