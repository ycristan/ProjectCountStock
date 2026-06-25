import { createClient } from '@/lib/supabase-server'
import { logout } from '@/actions/auth'

export default async function CounterLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const name = user?.user_metadata?.full_name ?? 'Contador'

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <span className="font-semibold text-gray-900">Count Stock</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">Olá, {name}</span>
          <form action={logout}>
            <button type="submit" className="text-sm text-gray-500 hover:text-gray-900">
              Sair
            </button>
          </form>
        </div>
      </header>
      <main className="px-4 py-6">{children}</main>
    </div>
  )
}
