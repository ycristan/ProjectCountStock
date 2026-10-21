export type TeamDraft = { name: string; members: { name: string; role: 'counter' | 'independent' }[] }
export type SetupJob = {
  id: string
  draft: TeamDraft[]
  complete: boolean
  plan: { commandId: string; name: string; pin: string; members: {
    name: string; role: 'counter' | 'independent'; pin: string; userId: string | null
  }[] }[]
}
