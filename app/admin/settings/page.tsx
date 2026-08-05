import Link from 'next/link'
import { buscarConfigSistema, statusContadorSoloFixo } from '@/actions/settings'
import { SystemSettingsForm } from './_components/SystemSettingsForm'
import { SoloCounterCard } from './_components/SoloCounterCard'

export default async function AdminSettingsPage() {
  const [config, { active }] = await Promise.all([
    buscarConfigSistema(),
    statusContadorSoloFixo(),
  ])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-slate-900">System Settings</h2>
        <Link href="/admin" className="text-sm text-slate-400 hover:text-slate-900">← Dashboard</Link>
      </div>
      <div className="max-w-lg space-y-6">
        <SystemSettingsForm initial={config} />
        <SoloCounterCard initialActive={active} />
      </div>
    </div>
  )
}
