'use client'

import { useEffect, useRef } from 'react'

type Props = {
  value: string
  onChange: (value: string) => void
  loading: boolean
}

export function SearchInput({ value, onChange, loading }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        inputMode="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Código, nome ou BIN..."
        className="w-full text-base px-4 py-3 pr-10 rounded-xl border-[1.5px] border-slate-200 bg-white focus:outline-none focus:border-blue-500"
      />
      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
        {loading ? (
          <span className="inline-block w-4 h-4 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
        ) : (
          <span>🔍</span>
        )}
      </div>
    </div>
  )
}
