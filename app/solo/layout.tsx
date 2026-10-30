import { createClient } from '@/lib/supabase-server'
import { AppHeader } from '@/components/ui'

export default async function SoloLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const name = user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? 'Counter'

  return (
    <div className="min-h-screen bg-ground">
      <AppHeader name={name} detail="Solo count" />
      <main className="mx-auto max-w-lg px-4 py-6">{children}</main>
    </div>
  )
}
