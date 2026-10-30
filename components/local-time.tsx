'use client'

// Dates rendered on the server would use the server's time zone; this uses the viewer's.
export function LocalTime({ iso }: { iso: string }) {
  return <time dateTime={iso} suppressHydrationWarning>
    {new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
  </time>
}
