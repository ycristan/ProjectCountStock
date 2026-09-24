import { listWarehouses } from '@/lib/warehouse-access'
import { TeamSessionForm } from '@/components/TeamSessionForm'
export default async function Page() {
  return <TeamSessionForm warehouses={await listWarehouses(true)} />
}
