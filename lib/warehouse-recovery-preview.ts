import type { ItemBusca } from '@/actions/contagem'

// Read-only projection of recover-split-inventory.sql, not a write or an alias
// used by live counts. Callers must authorize the admin and scope both IDs.
export function projectWarehouseRecovery(items: ItemBusca[], sourceId: string, targetId: string): ItemBusca[] {
  if (!sourceId || !targetId || sourceId === targetId) throw new Error('Choose two different warehouses.')
  return items.filter(item => item.warehouse_id === sourceId || item.warehouse_id === targetId)
    .map(item => item.warehouse_id === sourceId
      ? { ...item, warehouse_id: targetId, brand_active: false }
      : { ...item })
}
