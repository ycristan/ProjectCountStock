'use client'

import { useEffect, useRef } from 'react'
import { Label } from '@/components/ui'

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
    <label className="flex flex-col gap-1.5">
      <Label>Find product</Label>
      <span className="flex min-h-13 items-center gap-2 rounded-lg border-2 border-ink bg-surface px-3 focus-within:outline-3 focus-within:outline-info">
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
        <input
          ref={inputRef}
          type="text"
          inputMode="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Code, name or BIN (e.g. 40A02)"
          className="min-w-0 flex-grow bg-transparent py-3 text-[17px] font-medium outline-none placeholder:text-ink-3"
        />
      </span>
    </label>
  )
}
