'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Header navigation link; marks the page the person is on (a section root also
// marks its inner pages, except the area home).
export function NavLink({ href, icon, children }: { href: string; icon?: React.ReactNode; children: React.ReactNode }) {
  const path = usePathname()
  const current = path === href || (href.split('/').length > 2 && path.startsWith(href + '/'))
  return <Link href={href} aria-current={current ? 'page' : undefined}
    className={'inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 text-sm no-underline ' + (current ? 'bg-safety font-semibold text-ink' : 'text-ground hover:bg-white/10')}>
    {icon}{children}
  </Link>
}
