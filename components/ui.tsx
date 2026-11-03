import Link from 'next/link'
import { logout } from '@/actions/auth'
import { Icon } from './icons'
import { BottomBar, type NavItem } from './bottom-bar'
import { NavLink } from './nav-link'

// Shared building blocks of the "warehouse floor" visual. Every screen uses these
// instead of its own classes, so buttons always look like buttons and screens match.

type Variant = 'primary' | 'dark' | 'outline' | 'success' | 'alert' | 'danger' | 'quiet'
type Size = 'lg' | 'md' | 'sm'

const VARIANT: Record<Variant, string> = {
  // The one main action of a screen: Yale Blue with an ink edge.
  primary: 'bg-brand text-white border-2 border-ink shadow-[0_3px_0_var(--color-ink)] active:translate-y-[2px] active:shadow-[0_1px_0_var(--color-ink)]',
  dark: 'bg-ink text-white border-2 border-ink',
  outline: 'bg-surface text-ink border-2 border-ink',
  success: 'bg-ok text-white border-2 border-ok',
  alert: 'bg-alert text-white border-2 border-alert',
  danger: 'bg-surface text-alert border-2 border-alert',
  quiet: 'bg-transparent text-ink-2 border border-line-2 font-sans normal-case tracking-normal font-semibold',
}
const SIZE: Record<Size, string> = {
  lg: 'min-h-14 px-5 text-xl',
  md: 'min-h-12 px-4 text-base',
  sm: 'min-h-11 px-3 text-[15px]',
}

export function buttonClass(variant: Variant = 'dark', size: Size = 'md', full = false) {
  return 'inline-flex items-center justify-center gap-2 rounded-md font-display font-bold uppercase tracking-[0.06em] '
    + 'transition-[transform,opacity] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none '
    + 'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-info '
    + VARIANT[variant] + ' ' + SIZE[size] + (full ? ' w-full' : '')
}

export function Button({ variant, size, full, className = '', ...props }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; full?: boolean }) {
  return <button {...props} className={buttonClass(variant, size, full) + ' ' + className} />
}

// Finish a count (team and Solo use the same flag).
export function FlagIcon() {
  return <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square"><path d="M5 21V4h11l-2 4 2 4H5" /></svg>
}

type Tone = 'ok' | 'diff' | 'info' | 'alert' | 'brand' | 'dark' | 'neutral'
const TONE: Record<Tone, string> = {
  ok: 'bg-ok text-white', diff: 'bg-diff text-white', info: 'bg-info text-white', alert: 'bg-alert text-white',
  brand: 'bg-brand text-white', dark: 'bg-ink text-white', neutral: 'bg-surface text-ink border border-line-2',
}

// Shared plain pieces, so lists, forms and tables look the same on every screen.
export const cardClass = 'rounded-md border border-line bg-surface'
export const inputClass = 'min-h-12 w-full rounded-md border-2 border-ink bg-surface px-3 text-base outline-none focus-visible:outline-3 focus-visible:outline-info placeholder:text-ink-3 disabled:bg-ground disabled:text-ink-3'
export const tableWrapClass = 'overflow-x-auto rounded-md border border-line bg-surface'
// Choose-one switch (Myself / Solo counter): wrap the buttons in `segmentGroupClass`.
export const segmentGroupClass = 'flex flex-wrap rounded-md bg-ground-2 p-[3px]'
export const segmentClass = (pressed: boolean) => 'min-h-11 rounded-sm border-2 px-3.5 text-sm ' + (pressed ? 'border-ink bg-surface font-semibold' : 'border-transparent')
export const thClass = 'px-3 py-2.5 text-left font-display text-[13px] font-bold uppercase tracking-[0.08em]'

// Message banner: alert for errors, warn for things that need attention.
export function Notice({ tone = 'alert', children }: { tone?: 'alert' | 'warn'; children: React.ReactNode }) {
  return <p role={tone === 'alert' ? 'alert' : undefined}
    className={'m-0 rounded-md px-3 py-2 text-[15px] ' + (tone === 'alert' ? 'bg-alert font-medium text-white' : 'border border-diff/40 bg-diff/10 text-ink')}>{children}</p>
}

// Short status word on a colored plate (Equal, Different, Waiting...).
export function Tag({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={'inline-block rounded-sm px-2 py-1 font-display text-xs font-bold uppercase tracking-[0.08em] whitespace-nowrap ' + TONE[tone]}>
    {children}
  </span>
}

// Small uppercase caption above a field or a block.
export function Label({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={'font-display text-[13px] font-bold uppercase tracking-[0.08em] text-ink-2 ' + className}>{children}</span>
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('') || '?'
}

// Header of every signed-in area. From md up: brand, menu, who is signed in and Log out.
// On phones the header only shows who is signed in; the menu and Log out move to the
// bottom bar (proposal B, 02/11).
export function AppHeader({ name, detail, items = [], area, status }: {
  name: string; detail?: string; items?: NavItem[]; area?: string; status?: React.ReactNode
}) {
  // A PIN login is 8 digits (team PIN + personal PIN); it must never be shown as a name.
  const shown = /^\d{8}$/.test(name.trim()) ? 'Counter' : name
  return <>
    <header className="sticky top-0 z-50 bg-ink text-ground">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 md:py-3">
        <Link href="/" className="hidden items-center gap-2 text-ground no-underline md:flex">
          <span aria-hidden="true" className="flex size-7 items-center justify-center bg-accent font-display text-base font-bold text-white">CS</span>
          <span className="font-display text-xl font-bold uppercase tracking-[0.04em]">Count Stock{area ? ' · ' + area : ''}</span>
        </Link>
        {items.length > 0 && <nav className="hidden flex-wrap gap-1 md:ml-4 md:flex">
          {items.map(i => <NavLink key={i.href} href={i.href} icon={<Icon name={i.icon} />}>{i.label}</NavLink>)}
        </nav>}
        <div className="flex min-w-0 flex-grow items-center gap-3 md:ml-auto md:flex-grow-0">
          <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent font-display text-lg font-bold text-white">{initials(shown)}</span>
          <span className="flex min-w-0 flex-grow flex-col leading-tight">
            <span className="truncate text-base font-semibold">Hello, {shown}</span>
            {detail && <span className="truncate text-[13px] text-on-ink-2">{detail}</span>}
          </span>
          {status}
        </div>
        <form action={logout} className="hidden md:block">
          <button type="submit" className="inline-flex min-h-10 items-center gap-1.5 rounded-md border-[1.5px] border-ground px-3 font-display text-sm font-bold uppercase tracking-[0.06em] text-ground hover:bg-white/10 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white">
            <Icon name="logout" size={16} />
            Log out
          </button>
        </form>
      </div>
    </header>
    <BottomBar items={items} name={shown} detail={detail} initials={initials(shown)} />
  </>
}

export { NavLink }
export type { NavItem }

// Top of every inner screen, always in the same place: back link on the left
// (where it leads, in words), then the title, with secondary actions on the right.
export function PageTop({ back, title, kicker, actions }: {
  back?: { href: string; label: string }; title: React.ReactNode; kicker?: React.ReactNode; actions?: React.ReactNode
}) {
  return <div className="mb-4 flex flex-col gap-2">
    {back && <Link href={back.href} className="inline-flex min-h-11 w-fit items-center gap-1 text-[15px] font-medium text-ink no-underline">
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M15 5l-7 7 7 7" /></svg>
      {back.label}
    </Link>}
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex min-w-0 flex-grow flex-col gap-1">
        {kicker && <Label>{kicker}</Label>}
        <h1 className="m-0 font-display text-[28px] leading-tight font-bold uppercase tracking-[0.02em]">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  </div>
}
