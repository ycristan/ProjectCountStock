'use client'

import { useEffect, useState } from 'react'

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
    <div className="text-center py-6">
      <div className="text-5xl mb-3">✅</div>
      <div className="text-xl font-bold text-slate-900">Count saved!</div>

      <div className="mt-4 rounded-xl bg-slate-900 text-white p-4 text-left">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Item</div>
        <div className="text-lg font-bold">{brandCode}</div>
        <div className="text-sm text-slate-300">{brandName}</div>
        <div className="text-xs text-slate-400 mt-1">{finalCases} cases · {finalUnits} units</div>
      </div>

      <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4">
        <div className="text-sm text-slate-600">Returning to search in...</div>
        <div className="text-4xl font-bold text-green-600 leading-tight mt-1">{seconds}</div>
        <div className="text-xs text-slate-500">seconds</div>
      </div>

      <button
        onClick={onDone}
        className="mt-4 w-full text-sm py-3 rounded-xl bg-white text-slate-700 border border-slate-200 font-medium"
      >
        Search now →
      </button>
    </div>
  )
}
