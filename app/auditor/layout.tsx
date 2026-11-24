import { AppHeader } from '@/components/ui'

// Read-only area for the third-party Auditor: no navigation, nothing to open.
export default function AuditorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ground">
      <AppHeader name="Auditor" detail="Read-only" />
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  )
}
