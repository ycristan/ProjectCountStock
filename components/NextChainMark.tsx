'use client'

/**
 * NEXT CHAIN — brand mark ("N" monogram)
 *
 * Two connection nodes linked by the diagonal of an "N".
 * - Static by default (use everywhere: headers, sidebar, favicons).
 * - Pass `animated` to play the build sequence (nodes appear → part →
 *   trail draws between them without touching → burst of light on connect).
 *   Ideal for the login screen and the "Count saved" success screen.
 *
 * Colors come from CSS custom properties so the mark inherits the theme:
 *   --nc-accent (#3b82f6), --nc-accent-2 (#22d3ee), --nc-ink (stroke)
 * You can also override per-instance with the `tone` prop.
 */

import { useId } from 'react'

type Tone = 'onDark' | 'onLight' | 'white'

interface NextChainMarkProps {
  size?: number            // width in px; height is derived (ratio 56:64)
  tone?: Tone              // color scheme for the current background
  animated?: boolean       // play the build-in loop
  className?: string
  title?: string
}

const TONES: Record<Tone, { stroke: string; nodeTop: string; nodeBot: string }> = {
  // dark backgrounds: light stroke, cyan top node, blue bottom node
  onDark:  { stroke: '#E6ECF5', nodeTop: '#22D3EE', nodeBot: '#3B82F6' },
  // light backgrounds: navy stroke, blue top node, cyan bottom node
  onLight: { stroke: '#0B1120', nodeTop: '#3B82F6', nodeBot: '#22D3EE' },
  // monochrome (single color, e.g. watermark or print)
  white:   { stroke: '#FFFFFF', nodeTop: '#FFFFFF', nodeBot: '#FFFFFF' },
}

export function NextChainMark({
  size = 32,
  tone = 'onDark',
  animated = false,
  className,
  title = 'NEXT CHAIN',
}: NextChainMarkProps) {
  const uid = useId().replace(/:/g, '')
  const c = TONES[tone]
  const h = Math.round((size * 64) / 56)

  return (
    <svg
      width={size}
      height={h}
      viewBox="0 0 56 64"
      fill="none"
      role="img"
      aria-label={title}
      className={className}
      style={{ overflow: 'visible' }}
    >
      {animated && (
        <defs>
          <filter id={`ncSoft-${uid}`} x="-160%" y="-160%" width="420%" height="420%">
            <feGaussianBlur stdDeviation="3.4" />
          </filter>
        </defs>
      )}

      {/* burst glow behind each node (only when animated) */}
      {animated && (
        <>
          <circle cx="42" cy="9" r="7" fill={c.nodeTop} filter={`url(#ncSoft-${uid})`}
            style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: `ncBurst-${uid} 4.6s ease-in-out infinite` }} />
          <circle cx="14" cy="55" r="7" fill={c.nodeBot} filter={`url(#ncSoft-${uid})`}
            style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: `ncBurst-${uid} 4.6s ease-in-out infinite` }} />
        </>
      )}

      {/* N trail — draws between the nodes without touching them */}
      <path
        d="M14 44 L14 16 L42 48 L42 20"
        fill="none"
        stroke={c.stroke}
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={animated ? 99 : undefined}
        strokeDashoffset={animated ? 99 : undefined}
        style={animated ? { animation: `ncDraw-${uid} 4.6s ease-in-out infinite` } : undefined}
      />

      {/* thin ripple rings on connect (only when animated) */}
      {animated && (
        <>
          <circle cx="42" cy="9" r="4" fill="none" stroke={c.nodeTop} strokeWidth={1} vectorEffect="non-scaling-stroke"
            style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: `ncRing-${uid} 4.6s ease-in-out infinite` }} />
          <circle cx="14" cy="55" r="4" fill="none" stroke={c.nodeBot} strokeWidth={1} vectorEffect="non-scaling-stroke"
            style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: `ncRing-${uid} 4.6s ease-in-out infinite` }} />
        </>
      )}

      {/* the two nodes */}
      <circle cx="42" cy="9" r="4" fill={c.nodeTop}
        style={animated ? { animation: `ncNodeTR-${uid} 4.6s ease-in-out infinite` } : undefined} />
      <circle cx="14" cy="55" r="4" fill={c.nodeBot}
        style={animated ? { animation: `ncNodeBL-${uid} 4.6s ease-in-out infinite` } : undefined} />

      {animated && (
        <style>{`
          @keyframes ncNodeTR-${uid}{0%{transform:translate(-14px,16px);opacity:0}8%{opacity:1}16%{transform:translate(-14px,16px)}34%{transform:translate(0,0)}88%{transform:translate(0,0);opacity:1}94%{opacity:0}100%{transform:translate(-14px,16px);opacity:0}}
          @keyframes ncNodeBL-${uid}{0%{transform:translate(14px,-16px);opacity:0}8%{opacity:1}16%{transform:translate(14px,-16px)}34%{transform:translate(0,0)}88%{transform:translate(0,0);opacity:1}94%{opacity:0}100%{transform:translate(14px,-16px);opacity:0}}
          @keyframes ncDraw-${uid}{0%,36%{stroke-dashoffset:99}60%{stroke-dashoffset:0}88%{stroke-dashoffset:0}94%{stroke-dashoffset:99}100%{stroke-dashoffset:99}}
          @keyframes ncRing-${uid}{0%,60%{opacity:0;transform:scale(1)}67%{opacity:.7;transform:scale(1.9)}80%{opacity:0;transform:scale(3.4)}100%{opacity:0}}
          @keyframes ncBurst-${uid}{0%,60%{opacity:0;transform:scale(.5)}67%{opacity:1;transform:scale(1.25)}86%{opacity:.3;transform:scale(1)}94%,100%{opacity:0}}
          @media (prefers-reduced-motion: reduce){
            svg [style*="animation"]{animation:none!important}
            path[stroke-dashoffset]{stroke-dashoffset:0!important}
          }
        `}</style>
      )}
    </svg>
  )
}

/**
 * Full horizontal lockup: mark + wordmark.
 */
export function NextChainLockup({
  tone = 'onDark',
  markSize = 28,
  showTagline = true,
}: {
  tone?: Tone
  markSize?: number
  showTagline?: boolean
}) {
  const wordColor = tone === 'onLight' ? '#0B1120' : '#E6ECF5'
  const muted = tone === 'onLight' ? '#64748B' : '#9DAECB'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
      <NextChainMark size={markSize} tone={tone} />
      <div>
        <div style={{ fontWeight: 700, letterSpacing: '0.1em', fontSize: 15, color: wordColor }}>
          NEXT <span style={{ fontWeight: 300, color: muted }}>CHAIN</span>
        </div>
        {showTagline && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', color: muted, marginTop: 3 }}>
            STOCK COUNT &amp; AUDITORY
          </div>
        )}
      </div>
    </div>
  )
}
