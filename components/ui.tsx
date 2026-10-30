import Link from 'next/link'
import { logout } from '@/actions/auth'

// Shared building blocks of the "warehouse floor" visual. Every screen uses these
// instead of its own classes, so buttons always look like buttons and screens match.

type Variant = 'primary' | 'dark' | 'outline' | 'success' | 'danger' | 'quiet'
type Size = 'lg' | 'md' | 'sm'

const VARIANT: Record<Variant, string> = {
  // The one main action of a screen: safety yellow with an ink edge.
  primary: 'bg-safety text-ink border-2 border-ink shadow-[0_3px_0_var(--color-ink)] active:translate-y-[2px] active:shadow-[0_1px_0_var(--color-ink)]',
  dark: 'bg-ink text-white border-2 border-ink',
  outline: 'bg-surface text-ink border-2 border-ink',
  success: 'bg-ok text-white border-2 border-ok',
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

type Tone = 'ok' | 'diff' | 'info' | 'alert' | 'safety' | 'dark' | 'neutral'
const TONE: Record<Tone, string> = {
  ok: 'bg-ok text-white', diff: 'bg-diff text-white', info: 'bg-info text-white', alert: 'bg-alert text-white',
  safety: 'bg-safety text-ink', dark: 'bg-ink text-white', neutral: 'bg-surface text-ink border border-line-2',
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

// Header of every signed-in area: brand and Log out on top; who is signed in, in
// which role, below on phones and on the right from tablets up.
export function AppHeader({ name, detail, nav, area, status }: {
  name: string; detail?: string; nav?: React.ReactNode; area?: string; status?: React.ReactNode
}) {
  // A PIN login is 8 digits (team PIN + personal PIN); it must never be shown as a name.
  const shown = /^\d{8}$/.test(name.trim()) ? 'Counter' : name
  return <header className="sticky top-0 z-50 bg-ink text-ground">
    <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
      <Link href="/" className="flex items-center gap-2 text-ground no-underline">
        <span aria-hidden="true" className="flex size-7 items-center justify-center bg-safety font-display text-base font-bold text-ink">CS</span>
        <span className="font-display text-xl font-bold uppercase tracking-[0.04em]">Count Stock{area ? ' · ' + area : ''}</span>
      </Link>
      {nav && <nav className="order-3 flex w-full flex-wrap gap-1 md:order-none md:ml-4 md:w-auto">{nav}</nav>}
      <div className="order-4 flex w-full items-center gap-3 rounded-md bg-[#23262A] px-3 py-2 md:order-none md:ml-auto md:w-auto md:bg-transparent md:p-0">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-md bg-safety font-display text-lg font-bold text-ink">{initials(shown)}</span>
        <span className="flex min-w-0 flex-grow flex-col leading-tight">
          <span className="truncate text-base font-semibold">{shown}</span>
          {detail && <span className="truncate text-[13px] text-[#C9C6BE]">{detail}</span>}
        </span>
        {status}
      </div>
      <form action={logout} className="ml-auto md:ml-0">
        <button type="submit" className="inline-flex min-h-10 items-center gap-1.5 rounded-md border-[1.5px] border-ground px-3 font-display text-sm font-bold uppercase tracking-[0.06em] text-ground hover:bg-white/10 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-safety">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square"><path d="M10 4H4v16h6" /><path d="M15 8l4 4-4 4M19 12H9" /></svg>
          Log out
        </button>
      </form>
    </div>
  </header>
}

// Header navigation link; `current` marks the page the person is on.
export function NavLink({ href, current, children }: { href: string; current?: boolean; children: React.ReactNode }) {
  return <Link href={href} aria-current={current ? 'page' : undefined}
    className={'rounded-md px-3 py-2 text-sm no-underline ' + (current ? 'bg-safety font-semibold text-ink' : 'text-ground hover:bg-white/10')}>
    {children}
  </Link>
}

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
