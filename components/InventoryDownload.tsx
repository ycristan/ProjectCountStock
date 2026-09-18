'use client'

import { useState } from 'react'

export function InventoryDownload() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  async function download() {
    setPending(true)
    setError('')
    try {
      const response = await fetch('/api/admin/inventario', { cache: 'no-store' })
      if (!response.ok || !response.headers.get('content-type')?.includes('application/zip')) {
        const result = await response.json().catch(() => ({}))
        const reference = typeof result.eventId === 'string' && /^[a-f0-9]{32}$/.test(result.eventId) ? ' Reference: ' + result.eventId : ''
        setError((typeof result.error === 'string' ? result.error : 'Download unavailable. Please sign in again or retry later.') + reference)
        return
      }
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = 'inventory-all-warehouses.zip'
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { setError('Unable to reach the download service. Check your connection and try again.') }
    finally { setPending(false) }
  }
  return <div className="mb-4">
    <button type="button" onClick={download} disabled={pending} className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50">
      {pending ? 'Preparing download...' : 'Download full inventory (ZIP)'}
    </button>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
  </div>
}
