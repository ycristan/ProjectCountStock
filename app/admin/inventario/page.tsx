import { InventoryDownload } from '@/components/InventoryDownload'
import Link from 'next/link'
import { InventoryUpload } from '@/components/InventoryUpload'
import { listarInventario } from '@/actions/inventario'
import { InventarioClient } from '@/components/InventarioClient'

export default async function InventarioPage() {
  const items = await listarInventario()
  return (
    <div>
      <Link href="/admin" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700 mb-4">
        ← Dashboard
      </Link>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Inventory</h2>
          <p className="text-sm text-slate-500 mt-0.5">{items.length} {items.length === 1 ? 'item' : 'items'}</p>
        </div>
        <Link href="/admin/upload" className="text-sm font-medium text-blue-600 hover:text-blue-800">
          Upload .xlsx →
        </Link>
      </div>
      {process.env.VERCEL_ENV === 'preview' && (
        <Link href="/admin/inventario/recovery-preview" className="block border border-amber-300 bg-amber-50 rounded-xl p-4 mb-4">
          Conferir recuperação de warehouses — somente leitura, ainda não aplicada →
        </Link>
      )}
      <InventoryDownload />
      <InventoryUpload />
      <InventarioClient items={items} />
    </div>
  )
}
