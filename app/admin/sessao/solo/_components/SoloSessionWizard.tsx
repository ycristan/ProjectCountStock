'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ItemBusca } from '@/actions/contagem'
import { criarSoloSessaoCompleta } from '@/actions/solo'
import { SoloItemListStep } from './SoloItemListStep'

type Step = 'title' | 'who' | 'list' | 'review'
type ListedItem = { brand_code: string; brand_name: string }

type Props = {
  inventory: ItemBusca[]
  soloCounterActive: boolean
}

export function SoloSessionWizard({ inventory, soloCounterActive }: Props) {
  const [step, setStep] = useState<Step>('title')
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
        assignedToCounter,
        restrictToList,
        itemCodes: itemCodes.map((i) => i.brand_code),
      })
      if (res.error) { setErro(res.error); return }
      router.push(`/admin/solo/${res.id}`)
    })
  }

  if (step === 'title') {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h3 className="font-semibold text-slate-900">Title</h3>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Aisle 3 spot check"
          autoFocus
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-slate-900"
        />
        <button
          onClick={() => setStep('who')}
          disabled={!title.trim()}
          className="w-full bg-slate-900 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    )
  }

  if (step === 'who') {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h3 className="font-semibold text-slate-900">Who counts</h3>
        <div className="flex gap-2">
          <button
            onClick={() => { setAssignedToCounter(false); setRestrictToList(false); setItemCodes([]) }}
            className={`flex-1 rounded-xl py-3 text-sm font-semibold border-2 ${!assignedToCounter ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600'}`}
          >
            Myself
          </button>
          <button
            onClick={() => soloCounterActive && setAssignedToCounter(true)}
            disabled={!soloCounterActive}
            title={soloCounterActive ? undefined : 'No solo counter configured — set one up in System Settings'}
            className={`flex-1 rounded-xl py-3 text-sm font-semibold border-2 disabled:opacity-40 disabled:cursor-not-allowed ${assignedToCounter ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600'}`}
          >
            Solo counter
          </button>
        </div>
        {!soloCounterActive && (
          <p className="text-xs text-amber-600">
            No solo counter configured yet. <a href="/admin/settings" className="underline">Set one up in System Settings</a> or continue counting yourself.
          </p>
        )}
        <div className="flex gap-2">
          <button onClick={() => setStep('title')} className="px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-500">← Back</button>
          <button onClick={() => setStep('list')} className="flex-1 bg-slate-900 text-white font-semibold py-3 rounded-xl text-sm">Next →</button>
        </div>
      </div>
    )
  }

  if (step === 'list') {
    if (!assignedToCounter) {
      return (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-slate-900">Item list</h3>
          <p className="text-sm text-slate-500">
            Item list restriction only applies when the session is assigned to the solo counter. You&apos;ll be able to count any item.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setStep('who')} className="px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-500">← Back</button>
            <button onClick={() => setStep('review')} className="flex-1 bg-slate-900 text-white font-semibold py-3 rounded-xl text-sm">Next →</button>
          </div>
        </div>
      )
    }
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h3 className="font-semibold text-slate-900">Item list</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setRestrictToList(false)}
            className={`flex-1 rounded-xl py-3 text-sm font-semibold border-2 ${!restrictToList ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600'}`}
          >
            Free add
          </button>
          <button
            onClick={() => setRestrictToList(true)}
            className={`flex-1 rounded-xl py-3 text-sm font-semibold border-2 ${restrictToList ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600'}`}
          >
            Restricted list
          </button>
        </div>
        {restrictToList && <SoloItemListStep inventory={inventory} items={itemCodes} onChange={setItemCodes} />}
        <div className="flex gap-2">
          <button onClick={() => setStep('who')} className="px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-500">← Back</button>
          <button
            onClick={() => setStep('review')}
            disabled={restrictToList && itemCodes.length === 0}
            className="flex-1 bg-slate-900 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <h3 className="font-semibold text-slate-900">Review &amp; Confirm</h3>
      <dl className="text-sm space-y-2">
        <div className="flex justify-between"><dt className="text-slate-500">Title</dt><dd className="font-semibold text-slate-900">{title}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">Who counts</dt><dd className="font-semibold text-slate-900">{assignedToCounter ? 'Solo counter' : 'Myself'}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">Item list</dt><dd className="font-semibold text-slate-900">{restrictToList ? `Restricted (${itemCodes.length} items)` : 'Free add'}</dd></div>
      </dl>
      {erro && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700">{erro}</div>}
      <div className="flex gap-2">
        <button onClick={() => setStep('list')} className="px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-500">← Back</button>
        <button
          onClick={handleConfirm}
          disabled={isPending}
          className="flex-1 bg-slate-900 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40"
        >
          {isPending ? 'Creating...' : 'Confirm & Create Session'}
        </button>
      </div>
    </div>
  )
}
