import { InventoryUpload } from '@/components/InventoryUpload'
import { PageTop } from '@/components/ui'

export default function Page() {
  return <div className="mx-auto flex max-w-3xl flex-col gap-4">
    <PageTop back={{ href: '/admin/inventario', label: 'Inventory' }} title="Import spreadsheet" />
    <InventoryUpload />
  </div>
}
