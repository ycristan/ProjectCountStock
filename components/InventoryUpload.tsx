'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { reviewInventoryUpload, confirmInventoryUpload } from '@/actions/inventory-upload'
import type { InventoryUploadState } from '@/lib/inventory-upload-state'
import { InventoryTemplateDownload } from './InventoryTemplateDownload'
import { buttonClass } from '@/components/ui'
import { Icon } from '@/components/icons'

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
    <section aria-label="Import inventory" className="flex flex-col gap-4">
      <InventoryTemplateDownload />
      <form ref={form} onSubmit={e => { e.preventDefault(); submit(false) }} className="rounded-md border-2 border-ink bg-surface p-4">
        <fieldset disabled={pending} className="m-0 flex flex-col gap-4 border-0 p-0">
          <h2 className="m-0 font-display text-xl font-bold uppercase">2. Check the file</h2>
          <label className="flex flex-col gap-1.5 text-[15px] font-semibold">Excel file (.xlsx, up to 4 MiB)
            <input name="file" type="file" accept=".xlsx" required
              onChange={() => { setState({}); setChoices({}) }}
              className="block w-full rounded-md border-2 border-dashed border-line-2 bg-ground p-3 text-[15px] font-normal file:mr-3 file:min-h-10 file:rounded-md file:border-2 file:border-ink file:bg-surface file:px-3 file:font-display file:font-bold file:uppercase" />
          </label>
          {state.error && <p role="alert" className="m-0 rounded-md bg-alert px-3 py-2 text-[15px] font-medium text-white">{state.error}</p>}
          {!!state.issues?.length && <div role="alert" className="max-h-64 overflow-auto rounded-md border-2 border-alert bg-surface p-3 text-sm text-alert">
            <p className="font-semibold">Correct these rows before importing:</p>
            <ul>{state.issues.map((issue, i) => <li key={i}>Row {issue.row}{issue.column ? ' — ' + issue.column : ''}: {issue.message}</li>)}</ul>
          </div>}
          {!!state.duplicates?.length && <dialog ref={duplicateDialog} aria-label="Resolve duplicate Brand Codes" onCancel={() => { setState({}); setChoices({}) }} className="max-h-[85vh] w-[95vw] max-w-6xl space-y-4 overflow-auto rounded-md border-2 border-ink p-4 backdrop:bg-ink/60">
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
            <button type="button" onClick={() => submit(false)} disabled={pending || state.duplicates.some(g => !choices[g.brandCode])} className={buttonClass('dark', 'md')}>Check selected rows</button>
            <button type="button" onClick={() => { setState({}); setChoices({}) }} className="ml-3 min-h-11 px-2 font-semibold underline underline-offset-4">Cancel</button>
          </dialog>}
          {!state.review && !state.success && <button type="submit" className={buttonClass('dark', 'md') + ' w-fit'}><Icon name="check" size={20} />{pending ? 'Checking...' : 'Check spreadsheet'}</button>}
          {state.review && <div className="flex flex-col gap-3 rounded-md border-2 border-ink bg-[#FFFBEA] p-4">
            <h2 className="m-0 font-display text-xl font-bold uppercase">3. Confirm: {state.review.warehouseName}</h2>
            <p>{state.review.count} products: {state.review.active} active, {state.review.inactive} inactive.</p>
            <p className="text-sm">Products missing from this file will become inactive only in this warehouse. Empty optional values replace previous values. Other warehouses are not replaced.</p>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="createWarehouse" value="true" className="size-5" /> Allow creation of this warehouse if it does not exist.</label>
            <p className="m-0 text-sm text-ink-2">Preview only validates files. Saving is blocked because Preview shares the production database.</p>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => submit(true)} className={buttonClass('primary', 'md')}><Icon name="upload" size={20} />Confirm import into {state.review.warehouseName}</button>
              <button type="button" onClick={() => { setState({}); setChoices({}); form.current?.reset() }} className="min-h-11 px-2 font-semibold underline underline-offset-4">Cancel</button>
            </div>
          </div>}
          {state.success && <p role="status" className="m-0 rounded-md bg-ok px-3 py-2 text-[15px] font-medium text-white">{state.success.imported} products imported into {state.success.warehouseName}; {state.success.deactivated} missing products deactivated.</p>}
        </fieldset>
      </form>
    </section>
  )
}
