import Link from 'next/link'
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
          <h2 className="text-xl font-semibold text-slate-900">Inventário</h2>
          <p className="text-sm text-slate-500 mt-0.5">{items.length} {items.length === 1 ? 'item' : 'itens'}</p>
        </div>
        <Link href="/admin/upload" className="text-sm font-medium text-blue-600 hover:text-blue-800">
          Upload .xlsx →
        </Link>
      </div>
      <InventarioClient items={items} />
    </div>
  )
}
