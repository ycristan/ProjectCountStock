'use client'

import { useEffect, useRef } from 'react'

type Props = {
  value: string
  onChange: (value: string) => void
}

export function SearchInput({ value, onChange }: Props) {
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
        placeholder="Brand Code (e.g. 6323), Name or BIN (e.g. 40A02)"
        className="w-full text-base px-4 py-3 pr-10 rounded-xl border-[1.5px] border-slate-200 bg-white focus:outline-none focus:border-blue-500"
      />
      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
        <span>🔍</span>
      </div>
    </div>
  )
}
