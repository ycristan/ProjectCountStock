'use client'

import { useEffect, useState } from 'react'

type Props = {
  brandCode: string
  brandName: string
  finalCases: number
  finalUnits: number
  onDone: () => void
}

export function SuccessScreen({
  brandCode,
  brandName,
  finalCases,
  finalUnits,
  onDone,
}: Props) {
  const [seconds, setSeconds] = useState(2)

  useEffect(() => {
    if (seconds === 0) {
      onDone()
    }
  }, [seconds, onDone])

  useEffect(() => {
    if (seconds === 0) return
    const interval = setInterval(() => {
      setSeconds((s) => Math.max(0, s - 1))
    }, 1000)
    return () => clearInterval(interval)
  }, [seconds])

  return (
    <div className="text-center py-8">
      <div className="text-5xl mb-3">✅</div>
      <div className="text-xl font-bold text-slate-900">Contagem salva!</div>
      <div className="text-sm text-slate-500 mt-1">
        {brandCode} · {brandName}
      </div>
      <div className="text-green-600 font-semibold mt-1 text-sm">
        {finalCases} cases + {finalUnits} units
      </div>

      <div className="mt-6 bg-green-50 border border-green-200 rounded-xl p-4">
        <div className="text-sm text-slate-600">Voltando para busca em...</div>
        <div className="text-4xl font-bold text-green-600 leading-tight mt-1">{seconds}</div>
        <div className="text-xs text-slate-500">segundos</div>
      </div>

      <button
        onClick={onDone}
        className="mt-4 w-full text-sm py-3 rounded-xl bg-slate-100 text-slate-700 border border-slate-200"
      >
        Buscar agora →
      </button>
    </div>
  )
}
