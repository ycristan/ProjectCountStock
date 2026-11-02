import type { NavItem } from '@/components/ui'

// Solo has one screen to go back to; Log out lives in the bar's "Me" on phones.
export const SOLO_NAV: NavItem[] = [{ href: '/solo', label: 'Count', icon: 'search' }]
