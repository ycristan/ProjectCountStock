import Link from 'next/link'
import { InventoryDownload } from '@/components/InventoryDownload'
import { listarInventario } from '@/actions/inventario'
import { InventarioClient } from '@/components/InventarioClient'
import { PageTop, buttonClass } from '@/components/ui'
import { Icon } from '@/components/icons'

export default async function InventarioPage() {
  const items = await listarInventario()
  return (
    <div className="flex flex-col gap-4">
      <PageTop back={{ href: '/admin', label: 'Home' }} title="Inventory"
        kicker={items.length + (items.length === 1 ? ' item' : ' items') + ' in all warehouses'}
        actions={<>
          <InventoryDownload />
          <Link href="/admin/upload" className={buttonClass('primary', 'md') + ' no-underline'}><Icon name="upload" size={20} />Import spreadsheet</Link>
        </>} />
      {process.env.VERCEL_ENV === 'preview' && (
        <Link href="/admin/inventario/recovery-preview" className="block rounded-md border border-line bg-surface p-4 text-ink no-underline">
          Conferir recuperação de warehouses — somente leitura, ainda não aplicada
        </Link>
      )}
      <InventarioClient items={items} />
    </div>
  )
}
