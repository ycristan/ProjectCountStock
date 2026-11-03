'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { FlagIcon, buttonClass } from './ui'

const HOLD_MS = 4000

// Hold to finish (Yuri, 02/11): press for 4 s while it counts 4-3-2-1; releasing early
// cancels. Space or Enter held down does the same for keyboards and screen readers.
export function HoldButton({ label, onHeld, disabled }: { label: string; onHeld: () => void; disabled?: boolean }) {
  const [left, setLeft] = useState<number | null>(null)
  const [early, setEarly] = useState(false)
  const hold = useRef<{ start: number; frame: number } | null>(null)
  const fill = useRef<HTMLSpanElement>(null)
  const held = useRef(onHeld)
  const hint = useId()
  useEffect(() => { held.current = onHeld })

  function end() {
    if (hold.current) cancelAnimationFrame(hold.current.frame)
    hold.current = null
    setLeft(null)
    if (fill.current) fill.current.style.width = '0'
  }
  function tick() {
    if (!hold.current) return
    const ms = performance.now() - hold.current.start
    if (fill.current) fill.current.style.width = Math.min(100, ms / HOLD_MS * 100) + '%'
    if (ms >= HOLD_MS) { end(); held.current(); return }
    setLeft(Math.ceil((HOLD_MS - ms) / 1000))
    hold.current.frame = requestAnimationFrame(tick)
  }
  function start() {
    if (disabled || hold.current) return
    setEarly(false)
    hold.current = { start: performance.now(), frame: requestAnimationFrame(tick) }
  }
  function stop() {
    if (!hold.current) return
    end()
    setEarly(true)
  }

  return <div className="flex flex-col gap-1">
    <button type="button" disabled={disabled} aria-describedby={hint}
      className={buttonClass('primary', 'lg', true) + ' relative touch-none select-none overflow-hidden [-webkit-touch-callout:none]'}
      onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); start() }}
      onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop} onBlur={stop}
      onContextMenu={e => e.preventDefault()}
      onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start() } }}
      onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); stop() } }}>
      <span ref={fill} aria-hidden="true" className="absolute inset-y-0 left-0 w-0 bg-ok" />
      <span className="relative flex items-center gap-2">
        {left === null ? <><FlagIcon />{label}</> : <>Keep holding <span className="text-[28px] leading-none">{left}</span></>}
      </span>
    </button>
    <p id={hint} aria-live="polite" className={'m-0 text-center text-[13px] ' + (early ? 'font-semibold text-diff' : 'text-ink-2')}>
      {early ? 'Released early — hold for 4 seconds' : 'Hold for 4 seconds'}
    </p>
  </div>
}
