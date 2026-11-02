'use client'

import { useState } from 'react'
import { buttonClass } from '@/components/ui'
import { Icon } from '@/components/icons'

export function InventoryTemplateDownload() {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState(false)

  async function download() {
    setDownloading(true)
    setError(false)
    try {
      const { downloadInventoryTemplate } = await import('@/lib/inventory-template')
      downloadInventoryTemplate()
    } catch {
      setError(true)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <section aria-label="New inventory template" className="flex flex-col gap-2 rounded-md border border-line bg-surface p-4">
      <h2 className="m-0 font-display text-xl font-bold uppercase">1. Fill in the template</h2>
      <button type="button" onClick={download} disabled={downloading} className={buttonClass('outline', 'md') + ' w-fit'}>
        <Icon name="download" size={20} />{downloading ? 'Preparing template...' : 'Download Excel template'}
      </button>
      <p className="m-0 text-sm text-ink-2">
        Use this template with Check spreadsheet below before confirming the import.
      </p>
      <details className="text-sm text-ink-2">
        <summary className="min-h-10 cursor-pointer content-center font-semibold text-ink">How to fill in the template</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Keep all 13 headers and one worksheet. Use one warehouse per file, with the same WHS on every product row.</li>
          <li>Required: Brand Code, Brand Name, Category, Category1, BPU, Status and WHS. BPU must be a whole number of at least 1.</li>
          <li>Brand Codes must be unique across all warehouses. The first blank row is formatted for input; copy it for additional rows to preserve text codes and leading zeros.</li>
          <li>Status: TRUE for active, FALSE for inactive.</li>
          <li>Pallet Size, Weight AVG (grams) and BIN locations are optional. Blank or zero Pallet Size / Weight AVG clears the previous value and disables that counting method.</li>
          <li>Enter values, not formulas. The template contains no example products.</li>
        </ul>
      </details>
      {error && <p role="alert" className="m-0 rounded-md bg-alert px-3 py-2 text-sm font-medium text-white">Unable to download the template. Please try again.</p>}
    </section>
  )
}
