import Link from 'next/link'
import { InventoryUpload } from '@/components/InventoryUpload'
export default function Page() {
  return <div><Link href="/admin/inventario" className="mb-4 inline-block text-blue-600">Back to Inventory</Link><InventoryUpload /></div>
}
