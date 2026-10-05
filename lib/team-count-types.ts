export type TeamCountRecord = {
  brandCode: string; membershipId: string; pallets: number; cases: number; units: number
  quantity: string; method: 'manual' | 'weight'; revision: string
}
export type TeamCountState = {
  teamId: string; teamName: string; warehouseName: string; phase: string; revision: string
  role: 'counter' | 'independent' | 'admin'; membershipId: string | null
  finishState: string | null
  members: { id: string; name: string; role: string; order: number; finishState: string }[]
  records: TeamCountRecord[]
}
export type TeamComparisonItem = {
  brandCode: string
  status: 'equal' | 'tolerance' | 'reconcile'
  limit: string
  cells: { membershipId: string; recordId: string | null; quantity: string | null; method: 'manual' | 'weight' | null }[]
  decision: { decision: 'accept_value' | 'reconcile'; recordId: string | null; quantity: string | null } | null
}
