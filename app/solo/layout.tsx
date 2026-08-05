import { logout } from '@/actions/auth'

export default function SoloLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-slate-900 px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-white text-base">Count Stock — Solo</span>
        <form action={logout}>
          <button type="submit" className="text-sm text-slate-400 hover:text-white">
            Log out
          </button>
        </form>
      </header>
      <main className="px-4 py-6 max-w-lg mx-auto">{children}</main>
    </div>
  )
}
