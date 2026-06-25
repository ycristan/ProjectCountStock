import { logout } from '@/actions/auth'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <span className="font-semibold text-gray-900">Count Stock — Admin</span>
        <form action={logout}>
          <button type="submit" className="text-sm text-gray-500 hover:text-gray-900">
            Sair
          </button>
        </form>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
