// Where an admin opens a team session: the new-flow teams page when every team
// runs the new flow, otherwise the legacy combination page.
export function sessionHref(id: string, teams: { team_flows: unknown }[]) {
  return process.env.TEAM_SETUP_ENABLED === 'true' && teams.every((t) => t.team_flows)
    ? `/admin/sessao/${id}/equipes`
    : `/admin/sessao/${id}/combinacao`
}

// Where an admin follows a running count: all new-flow teams in one live table, or the
// legacy combination page.
export function liveHref(id: string, teams: { team_flows: unknown }[]) {
  const href = sessionHref(id, teams)
  return href.endsWith('/equipes') ? `/admin/sessao/${id}/ao-vivo` : href
}
