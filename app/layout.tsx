import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './globals.css'

// Fonts ship with the app (latin subset, SIL OFL licences in app/fonts): the build no longer downloads them
// from Google, which failed twice on 03/11 and would block a production deploy.
const barlow = localFont({ variable: '--font-barlow', display: 'swap', src: [
  { path: './fonts/barlow-condensed-latin-600-normal.woff2', weight: '600' },
  { path: './fonts/barlow-condensed-latin-700-normal.woff2', weight: '700' },
] })
const plexSans = localFont({ variable: '--font-plex-sans', display: 'swap', src: [
  { path: './fonts/ibm-plex-sans-latin-400-normal.woff2', weight: '400' },
  { path: './fonts/ibm-plex-sans-latin-500-normal.woff2', weight: '500' },
  { path: './fonts/ibm-plex-sans-latin-600-normal.woff2', weight: '600' },
] })
const plexMono = localFont({ variable: '--font-plex-mono', display: 'swap', src: [
  { path: './fonts/ibm-plex-mono-latin-500-normal.woff2', weight: '500' },
  { path: './fonts/ibm-plex-mono-latin-600-normal.woff2', weight: '600' },
] })

export const metadata: Metadata = {
  title: 'Count Stock',
  description: 'Sistema de contagem de estoque cega tripla',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#353535',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${barlow.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
