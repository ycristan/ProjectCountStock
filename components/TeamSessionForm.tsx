'use client'

import { useActionState } from 'react'
import { criarSessao } from '@/actions/sessao'
import Link from 'next/link'
import { Button, Label, Notice, PageTop, inputClass } from '@/components/ui'

type SessaoState = { error?: string } | null

export function TeamSessionForm({ warehouses }: { warehouses: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState<SessaoState, FormData>(criarSessao, null)

  return (
    <div>
      <PageTop back={{ href: '/admin/sessao', label: 'New Session' }} title="New Team Count Session" />
      <form action={formAction} className="flex max-w-sm flex-col gap-5">
        <label className="flex flex-col gap-1.5">
          <Label>Warehouse</Label>
          <select name="warehouse_id" required defaultValue="" className={inputClass}>
            <option value="" disabled>Choose a warehouse</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>
        <label htmlFor="num_equipes" className="flex flex-col gap-1.5">
          <Label>Number of Teams</Label>
          <input id="num_equipes" name="num_equipes" type="number" min={1} max={20} defaultValue={1} required className={inputClass} />
        </label>
        <p className="m-0 text-[13px] text-ink-2">
          Box tare and weight tolerance use the defaults from{' '}
          <Link href="/admin/settings" className="font-semibold text-ink underline underline-offset-2">System Settings</Link>.
        </p>
        {state?.error && <Notice>{state.error}</Notice>}
        <Button type="submit" variant="primary" size="lg" full disabled={pending}>
          {pending ? 'Creating...' : 'Create Session'}
        </Button>
      </form>
    </div>
  )
}
