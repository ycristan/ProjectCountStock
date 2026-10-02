import type { ItemBusca } from '@/actions/contagem'

export type TeamCountRecord = {
  brandCode: string; membershipId: string; pallets: number; cases: number; units: number
  quantity: string; method: 'manual' | 'weight'; revision: string
}
export type TeamCountState = {
  teamId: string; teamName: string; warehouseName: string; phase: string; revision: string
  role: 'counter' | 'independent' | 'admin'; membershipId: string | null
  finishState: string | null
  members: { id: string; name: string; role: string; order: number; finishState: string }[]
  items: ItemBusca[]
  records: TeamCountRecord[]
}
