'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui'

type Props = {
  brandCode: string
  brandName: string
  finalCases: number
  finalUnits: number
  onDone: () => void
}

export function SuccessScreen({ brandCode, brandName, finalCases, finalUnits, onDone }: Props) {
  const [seconds, setSeconds] = useState(2)

  useEffect(() => {
    if (seconds === 0) onDone()
  }, [seconds, onDone])

  useEffect(() => {
    if (seconds === 0) return
    const interval = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(interval)
  }, [seconds])

  return (
    <div role="status" className="flex flex-col gap-4 py-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <span aria-hidden="true" className="flex size-16 items-center justify-center rounded-full bg-ok text-white">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12l5 5 9-10" /></svg>
        </span>
        <span className="font-display text-3xl font-bold uppercase tracking-[0.03em]">Count saved</span>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl bg-ink p-4 text-ground">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-mono text-[13px] font-semibold text-[#C9C6BE]">{brandCode}</span>
          <span className="font-semibold">{brandName}</span>
          <span className="text-sm text-[#C9C6BE]">{finalCases} cases · {finalUnits} units</span>
        </div>
        <span className="font-display text-4xl font-bold text-safety">{finalCases}+{finalUnits}</span>
      </div>

      <p className="m-0 text-center text-[15px] text-ink-2">Back to search in {seconds} s</p>

      <Button variant="primary" size="lg" full onClick={onDone}>Count next product</Button>
    </div>
  )
}
