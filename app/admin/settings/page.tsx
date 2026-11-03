import { buscarConfigSistema, statusContadorSoloFixo } from '@/actions/settings'
import { PageTop } from '@/components/ui'
import { SystemSettingsForm } from './_components/SystemSettingsForm'
import { SoloCounterCard } from './_components/SoloCounterCard'

export default async function AdminSettingsPage() {
  const [config, { active }] = await Promise.all([
    buscarConfigSistema(),
    statusContadorSoloFixo(),
  ])

  return (
    <div>
      <PageTop back={{ href: '/admin', label: 'Home' }} title="System Settings" />
      <div className="flex max-w-lg flex-col gap-4">
        <SystemSettingsForm initial={config} />
        <SoloCounterCard initialActive={active} />
      </div>
    </div>
  )
}
