'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { logout } from '@/actions/auth'
import { Icon, type IconName } from './icons'

export type NavItem = { href: string; label: string; icon: IconName; more?: boolean }

const TYPING = 'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select'

// Phone navigation (Yuri, 02/11, proposal B): the screens as tabs, then "Me" with who is
// signed in and Log out. From md up the header menu is used instead. Items marked `more`
// (admin Settings) live inside "Me".
export function BottomBar({ items, name, detail, initials }: { items: NavItem[]; name: string; detail?: string; initials: string }) {
  const path = usePathname()
  const [open, setOpen] = useState(false)
  const sheet = useRef<HTMLDialogElement>(null)
  // The longest matching href wins, so /admin/sessoes marks Sessions and not Home.
  const current = items.filter(i => path === i.href || path.startsWith(i.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href

  useEffect(() => {
    // The phone keyboard covers the bottom of the screen: the bar steps aside while it is up.
    // Keyboard up = a text field has focus AND the visible area shrank. Focus alone is not
    // enough: the count screen focuses its search box on load without opening the keyboard.
    const root = document.documentElement
    const view = window.visualViewport
    const check = () => {
      const typing = document.activeElement?.matches(TYPING) ?? false
      const shrunk = view ? window.innerHeight - view.height > 120 : true
      if (typing && shrunk) root.dataset.keyboard = ''
      else delete root.dataset.keyboard
    }
    // During focusout the field still counts as focused: check right after it.
    const later = () => setTimeout(check)
    document.addEventListener('focusin', check)
    document.addEventListener('focusout', later)
    view?.addEventListener('resize', check)
    return () => {
      document.removeEventListener('focusin', check)
      document.removeEventListener('focusout', later)
      view?.removeEventListener('resize', check)
      delete root.dataset.keyboard
    }
  }, [])
  useEffect(() => { if (open) sheet.current?.showModal(); else sheet.current?.close() }, [open])

  const tab = 'relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-semibold no-underline '
  const mark = 'text-white before:absolute before:inset-x-[18%] before:top-0 before:h-[3px] before:bg-accent'
  const row = 'flex min-h-12 w-full items-center gap-3 rounded-md border px-3 text-[15px] font-semibold no-underline '
  return <>
    <nav aria-label="Main" className="bottom-bar fixed inset-x-0 bottom-0 z-40 flex border-t border-ink-2 bg-ink pb-[env(safe-area-inset-bottom)] md:hidden">
      {items.filter(i => !i.more).map(i => <Link key={i.href} href={i.href} aria-current={current === i.href ? 'page' : undefined}
        className={tab + (current === i.href ? mark : 'text-on-ink-2')}><Icon name={i.icon} size={22} />{i.label}</Link>)}
      <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} className={tab + (open ? mark : 'text-on-ink-2')}>
        <span aria-hidden="true" className="flex size-6 items-center justify-center rounded-md bg-accent font-display text-sm font-bold text-white">{initials}</span>Me
      </button>
    </nav>
    <dialog ref={sheet} aria-label="Me" onClose={() => setOpen(false)} onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
      className="mx-0 mt-auto mb-0 w-full max-w-none rounded-t-lg bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-ink backdrop:bg-ink/60 md:hidden">
      <div className="flex flex-col gap-2">
        <div className="mb-1 flex items-center gap-3 border-b border-line pb-3">
          <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent font-display text-xl font-bold text-white">{initials}</span>
          <span className="flex min-w-0 flex-col leading-tight">
            <strong className="font-display text-xl uppercase">{name}</strong>
            {detail && <span className="text-[13px] text-ink-2">{detail}</span>}
          </span>
        </div>
        {items.filter(i => i.more).map(i => <Link key={i.href} href={i.href} onClick={() => setOpen(false)} className={row + 'border-line text-ink'}>
          <Icon name={i.icon} size={20} />{i.label}</Link>)}
        <form action={logout}>
          <button type="submit" className={row + 'border-alert text-alert'}><Icon name="logout" size={20} />Log out</button>
        </form>
      </div>
    </dialog>
  </>
}
