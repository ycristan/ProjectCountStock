import Link from 'next/link'
import { InventoryDownload } from '@/components/InventoryDownload'
import { listarInventario } from '@/actions/inventario'
import { InventarioClient } from '@/components/InventarioClient'
import { PageTop, buttonClass, segmentClass, segmentGroupClass } from '@/components/ui'
import { Icon } from '@/components/icons'
import { listWarehouses } from '@/lib/warehouse-access'

export default async function InventarioPage({ searchParams }: { searchParams: Promise<{ wh?: string }> }) {
  // Empty warehouses (e.g. the legacy "Main") get no tab, as in the session picker.
  const [{ wh }, warehouses] = await Promise.all([searchParams, listWarehouses(true)])
  const active = warehouses.find(w => w.id === wh) ?? warehouses[0]
  const items = active ? await listarInventario(active.id) : []
  return (
    <div data-full-width className="flex flex-col gap-4">
      <PageTop back={{ href: '/admin', label: 'Home' }} title="Inventory"
        kicker={active ? items.length + (items.length === 1 ? ' item' : ' items') + ' in ' + active.name : 'No warehouses yet'}
        actions={<>
          <InventoryDownload />
          <Link href="/admin/upload" className={buttonClass('primary', 'md') + ' no-underline'}><Icon name="upload" size={20} />Import spreadsheet</Link>
        </>} />
      {process.env.VERCEL_ENV === 'preview' && (
        <Link href="/admin/inventario/recovery-preview" className="block rounded-md border border-line bg-surface p-4 text-ink no-underline">
          Conferir recuperação de warehouses — somente leitura, ainda não aplicada
        </Link>
      )}
      {warehouses.length > 0 && (
        <nav aria-label="Warehouses" className={segmentGroupClass + ' w-fit'}>
          {warehouses.map(w => (
            <Link key={w.id} href={'/admin/inventario?wh=' + w.id} aria-current={w.id === active?.id ? 'page' : undefined}
              className={segmentClass(w.id === active?.id) + ' flex items-center text-ink no-underline'}>{w.name}</Link>
          ))}
        </nav>
      )}
      {active ? <InventarioClient key={active.id} items={items} warehouseId={active.id} />
        : <p className="m-0 text-[15px] text-ink-2">No items in inventory. Import an .xlsx file.</p>}
    </div>
  )
}
