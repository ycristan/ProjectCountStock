import { useEffect } from 'react'
import { createClient } from '@/lib/supabase-client'

const TABLES = ['team_count_records', 'team_flows', 'team_memberships', 'team_item_decisions', 'team_reconciliations', 'team_admin_reviews', 'team_confirmations']

// Keeps team screens live: Realtime on every team table, plus a 15 s, online and focus
// fallback that recovers missed events, including access revocation filtered by RLS.
// `refresh` must be stable (useCallback); reads are serialised so an older response
// cannot overwrite a newer snapshot.
export function useTeamLive(teamIds: string[], refresh: () => Promise<void>, setUnavailable: (lost: boolean) => void) {
  const key = teamIds.join(',')
  useEffect(() => {
    const db = createClient()
    let disposed = false
    let running = false
    let again = false
    const reload = async () => {
      if (running) { again = true; return }
      running = true
      do {
        again = false
        if (!disposed) await refresh()
      } while (again && !disposed)
      running = false
    }
    const filter = key.includes(',') ? 'team_id=in.(' + key + ')' : 'team_id=eq.' + key
    const channel = db.channel('team-count-' + key)
    for (const table of TABLES) channel.on('postgres_changes', { event: '*', schema: 'public', table, filter }, reload)
    void db.auth.getSession().then(({ data }) => {
      if (disposed) return
      void db.realtime.setAuth(data.session?.access_token).then(() => {
        if (!disposed) channel.subscribe(status => {
          if (status === 'SUBSCRIBED') void reload()
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setUnavailable(true)
        })
      })
    })
    const timer = window.setInterval(reload, 15000)
    window.addEventListener('online', reload)
    window.addEventListener('focus', reload)
    return () => {
      disposed = true
      window.clearInterval(timer)
      window.removeEventListener('online', reload)
      window.removeEventListener('focus', reload)
      void db.removeChannel(channel)
    }
  }, [key, refresh, setUnavailable])
}
