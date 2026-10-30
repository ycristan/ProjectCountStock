// One stroke icon set (square caps), always shown next to text. Paths match the
// approved visual system sheet.
const PATHS = {
  home: <><path d="M3 21V9l9-6 9 6v12" /><path d="M9 21v-7h6v7" /></>,
  live: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  inventory: <><path d="M3 7l9-4 9 4v10l-9 4-9-4z" /><path d="M3 7l9 4 9-4M12 11v10" /></>,
  audit: <><rect x="5" y="4" width="14" height="17" /><path d="M9 4V2h6v2M9 13l2 2 4-4" /></>,
  settings: <><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" /><circle cx="15" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="17" cy="18" r="2" /></>,
  newSession: <><rect x="3" y="3" width="18" height="18" /><path d="M12 8v8M8 12h8" /></>,
  teams: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2.2.6 3.5 2.8 3.5 6" /></>,
  solo: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></>,
  spreadsheet: <><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6M9 12l5 5M14 12l-5 5" /></>,
}

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square">{PATHS[name]}</svg>
}
