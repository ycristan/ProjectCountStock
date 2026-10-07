export type TeamCountRecord = {
  brandCode: string; membershipId: string; pallets: number; cases: number; units: number
  quantity: string; method: 'manual' | 'weight'; revision: string
}
export type TeamCountState = {
  teamId: string; teamName: string; warehouseName: string; phase: string; revision: string
  role: 'counter' | 'independent' | 'admin'; membershipId: string | null
  finishState: string | null
  members: { id: string; name: string; role: string; order: number; finishState: string; departed: boolean }[]
  records: TeamCountRecord[]
}
export type TeamComparisonItem = {
  brandCode: string
  status: 'equal' | 'tolerance' | 'reconcile'
  limit: string
  cells: { membershipId: string; recordId: string | null; quantity: string | null; method: 'manual' | 'weight' | null }[]
  decision: { decision: 'accept_value' | 'reconcile'; recordId: string | null; quantity: string | null } | null
  // Current reconciled count: the latest round's recount once the admin returned the product.
  reconciliation: { pallets: number; cases: number; units: number; quantity: string; method: 'manual' | 'weight' } | null
  recounts: number
  selected: boolean
}
export type TeamReview = {
  id: string; decision: 'accept' | 'return' | 'cancel_signing'; decidedAt: string; round: number | null; brands: string[]
}
export type TeamSigning = {
  versionId: string; frozen: boolean
  participants: { membershipId: string; name: string; role: 'counter' | 'independent'; order: number; departed: boolean
    confirmation: { kind: 'pin' | 'absence'; reason: string | null; recordedAt: string; witnessed: boolean } | null }[]
}
