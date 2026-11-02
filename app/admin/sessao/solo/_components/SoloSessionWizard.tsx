'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ItemBusca } from '@/actions/contagem'
import { Button, Label, Notice, cardClass, inputClass, segmentClass, segmentGroupClass } from '@/components/ui'
import { criarSoloSessaoCompleta } from '@/actions/solo'
import { SoloItemListStep } from './SoloItemListStep'

type Step = 'title' | 'who' | 'list' | 'review'
type ListedItem = { brand_code: string; brand_name: string }

type Props = {
  warehouses: { id: string; name: string }[]
  inventory: ItemBusca[]
  soloCounterActive: boolean
}

// Step titles stay real h3 headings (the browser test reads them).
function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="m-0"><Label>{children}</Label></h3>
}

export function SoloSessionWizard({ inventory, soloCounterActive, warehouses }: Props) {
  const [step, setStep] = useState<Step>('title')
  const [warehouseId, setWarehouseId] = useState('')
  const [title, setTitle] = useState('')
  const [assignedToCounter, setAssignedToCounter] = useState(false)
  const [restrictToList, setRestrictToList] = useState(false)
  const [itemCodes, setItemCodes] = useState<ListedItem[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleConfirm() {
    startTransition(async () => {
      const res = await criarSoloSessaoCompleta({
        title,
        warehouseId,
        assignedToCounter,
        restrictToList,
        itemCodes: itemCodes.map((i) => i.brand_code),
      })
      if (res.error) { setErro(res.error); return }
      router.push(`/admin/solo/${res.id}`)
    })
  }

  const card = cardClass + ' flex flex-col gap-4 p-4'
  const nav = (back: Step, next: React.ReactNode) => (
    <div className="flex gap-2">
      <Button variant="quiet" onClick={() => setStep(back)}>← Back</Button>
      {next}
    </div>
  )
  const choose = (pressedFirst: boolean) => 'flex-1 ' + segmentClass(pressedFirst)

  if (step === 'title') {
    return (
      <div className={card}>
        <label className="flex flex-col gap-1.5">
          <Label>Warehouse</Label>
          <select value={warehouseId} onChange={e => { setWarehouseId(e.target.value); setItemCodes([]) }} required className={inputClass}>
            <option value="" disabled>Choose a warehouse</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <Label>Title</Label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Aisle 3 spot check" autoFocus className={inputClass} />
        </label>
        <Button variant="primary" size="lg" full onClick={() => setStep('who')} disabled={!title.trim() || !warehouseId}>Next →</Button>
      </div>
    )
  }

  if (step === 'who') {
    return (
      <div className={card}>
        <Heading>Who counts</Heading>
        <div role="group" aria-label="Who counts" className={segmentGroupClass}>
          <button type="button" aria-pressed={!assignedToCounter} className={choose(!assignedToCounter)}
            onClick={() => { setAssignedToCounter(false); setRestrictToList(false); setItemCodes([]) }}>Myself</button>
          <button type="button" aria-pressed={assignedToCounter} className={choose(assignedToCounter) + ' disabled:opacity-40'}
            onClick={() => soloCounterActive && setAssignedToCounter(true)} disabled={!soloCounterActive}
            title={soloCounterActive ? undefined : 'No solo counter configured — set one up in System Settings'}>Solo counter</button>
        </div>
        {!soloCounterActive && (
          <Notice tone="warn">
            No solo counter configured yet. <a href="/admin/settings" className="font-semibold underline">Set one up in System Settings</a> or continue counting yourself.
          </Notice>
        )}
        {nav('title', <Button variant="primary" className="flex-1" onClick={() => setStep('list')}>Next →</Button>)}
      </div>
    )
  }

  if (step === 'list') {
    if (!assignedToCounter) {
      return (
        <div className={card}>
          <Heading>Item list</Heading>
          <p className="m-0 text-[15px] text-ink-2">
            Item list restriction only applies when the session is assigned to the solo counter. You&apos;ll be able to count any item.
          </p>
          {nav('who', <Button variant="primary" className="flex-1" onClick={() => setStep('review')}>Next →</Button>)}
        </div>
      )
    }
    return (
      <div className={card}>
        <Heading>Item list</Heading>
        <div role="group" aria-label="Item list" className={segmentGroupClass}>
          <button type="button" aria-pressed={!restrictToList} className={choose(!restrictToList)} onClick={() => setRestrictToList(false)}>Free add</button>
          <button type="button" aria-pressed={restrictToList} className={choose(restrictToList)} onClick={() => setRestrictToList(true)}>Restricted list</button>
        </div>
        {restrictToList && <SoloItemListStep inventory={inventory.filter(i => i.warehouse_id === warehouseId)} items={itemCodes} onChange={setItemCodes} />}
        {nav('who', <Button variant="primary" className="flex-1" onClick={() => setStep('review')} disabled={restrictToList && itemCodes.length === 0}>Next →</Button>)}
      </div>
    )
  }

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-3 border-b border-ground-2 pb-2 last:border-b-0 last:pb-0"><dt className="text-ink-2">{label}</dt><dd className="m-0 text-right font-semibold">{value}</dd></div>
  )
  return (
    <div className={card}>
      <Heading>Review &amp; Confirm</Heading>
      <dl className="m-0 flex flex-col gap-2 text-[15px]">
        {row('Warehouse', warehouses.find(w => w.id === warehouseId)?.name)}
        {row('Title', title)}
        {row('Who counts', assignedToCounter ? 'Solo counter' : 'Myself')}
        {row('Item list', restrictToList ? `Restricted (${itemCodes.length} items)` : 'Free add')}
      </dl>
      {erro && <Notice>{erro}</Notice>}
      {nav('list', <Button variant="primary" className="flex-1" onClick={handleConfirm} disabled={isPending}>{isPending ? 'Creating...' : 'Confirm & Create Session'}</Button>)}
    </div>
  )
}
