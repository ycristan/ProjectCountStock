'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { reviewInventoryUpload, confirmInventoryUpload } from '@/actions/inventory-upload'
import type { InventoryUploadState } from '@/lib/inventory-upload-state'
import { InventoryTemplateDownload } from './InventoryTemplateDownload'

export function InventoryUpload() {
  const form = useRef<HTMLFormElement>(null)
  const duplicateDialog = useRef<HTMLDialogElement>(null)
  const router = useRouter()
  const [state, setState] = useState<InventoryUploadState>({})
  const [choices, setChoices] = useState<Record<string, number>>({})
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (state.duplicates?.length) duplicateDialog.current?.showModal()
  }, [state.duplicates])

  function submit(commit: boolean) {
    if (!form.current?.reportValidity()) return
    const data = new FormData(form.current)
    data.set('choices', JSON.stringify(Object.entries(choices).map(([brandCode, row]) => ({ brandCode, row }))))
    if (commit && state.review) data.set('confirmedWarehouse', state.review.warehouseName)
    startTransition(async () => {
      try {
        const result = await (commit ? confirmInventoryUpload(data) : reviewInventoryUpload(data))
        setState(result)
        if (result.success) router.refresh()
      } catch { setState({ error: 'Request failed. Please try again.' }) }
    })
  }

  return (
    <section aria-label="Import inventory" className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 font-semibold">Import inventory</h3>
      <InventoryTemplateDownload />
      <form ref={form} onSubmit={e => { e.preventDefault(); submit(false) }} className="space-y-4">
        <fieldset disabled={pending} className="space-y-4">
          <label className="block text-sm font-medium">Excel file (.xlsx, up to 4 MiB)
            <input name="file" type="file" accept=".xlsx" required
              onChange={() => { setState({}); setChoices({}) }}
              className="mt-2 block w-full text-sm" />
          </label>
          {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
          {!!state.issues?.length && <div role="alert" className="max-h-64 overflow-auto text-sm text-red-700">
            <p className="font-semibold">Correct these rows before importing:</p>
            <ul>{state.issues.map((issue, i) => <li key={i}>Row {issue.row}{issue.column ? ' — ' + issue.column : ''}: {issue.message}</li>)}</ul>
          </div>}
          {!!state.duplicates?.length && <dialog ref={duplicateDialog} aria-label="Resolve duplicate Brand Codes" onCancel={() => { setState({}); setChoices({}) }} className="max-h-[85vh] w-[95vw] max-w-6xl space-y-4 overflow-auto rounded-xl border border-amber-300 p-4 backdrop:bg-slate-900/60">
            <p className="font-semibold">Duplicate Brand Codes: choose one row to keep for each code. Columns follow the order in your file.</p>
            {state.duplicates.map(group => <fieldset key={group.brandCode} className="overflow-x-auto">
              <legend className="font-medium">{group.brandCode}</legend>
              <table className="text-xs"><thead><tr><th>Keep</th><th>Row</th>{Array.from({ length: 13 }, (_, i) => <th key={i} className="px-2">Column {i + 1}</th>)}</tr></thead>
                <tbody>{group.candidates.map(candidate => <tr key={candidate.row}>
                  <td><input type="radio" name={'duplicate-' + group.brandCode} aria-label={'Keep row ' + candidate.row}
                    checked={choices[group.brandCode] === candidate.row}
                    onChange={() => setChoices(prev => ({ ...prev, [group.brandCode]: candidate.row }))} /></td>
                  <td>{candidate.row}</td>{candidate.cells.map((value, i) => <td key={i} className="whitespace-nowrap px-2 py-2">{String(value ?? '')}</td>)}
                </tr>)}</tbody>
              </table>
            </fieldset>)}
            <button type="button" onClick={() => submit(false)} disabled={pending || state.duplicates.some(g => !choices[g.brandCode])} className="rounded-xl bg-slate-900 px-4 py-2 text-white disabled:opacity-50">Check selected rows</button>
            <button type="button" onClick={() => { setState({}); setChoices({}) }} className="ml-3 rounded-xl border px-4 py-2">Cancel</button>
          </dialog>}
          {!state.review && !state.success && <button type="submit" className="rounded-xl bg-slate-900 px-4 py-2 text-white disabled:opacity-50">{pending ? 'Checking...' : 'Check spreadsheet'}</button>}
          {state.review && <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
            <h4 className="font-semibold">Review: {state.review.warehouseName}</h4>
            <p>{state.review.count} products: {state.review.active} active, {state.review.inactive} inactive.</p>
            <p className="text-sm">Products missing from this file will become inactive only in this warehouse. Empty optional values replace previous values. Other warehouses are not replaced.</p>
            <label className="block text-sm"><input type="checkbox" name="createWarehouse" value="true" /> Allow creation of this warehouse if it does not exist.</label>
            <p className="text-sm text-amber-800">Preview only validates files. Saving is blocked because Preview shares the production database.</p>
            <button type="button" onClick={() => submit(true)} className="rounded-xl bg-slate-900 px-4 py-2 text-white">Confirm import into {state.review.warehouseName}</button>
            <button type="button" onClick={() => { setState({}); setChoices({}); form.current?.reset() }} className="ml-3 rounded-xl border px-4 py-2">Cancel</button>
          </div>}
          {state.success && <p role="status" className="text-green-800">{state.success.imported} products imported into {state.success.warehouseName}; {state.success.deactivated} missing products deactivated.</p>}
        </fieldset>
      </form>
    </section>
  )
}
