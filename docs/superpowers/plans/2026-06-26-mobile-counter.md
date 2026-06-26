# Tela Mobile do Contador — Plano de Implementação (PR #11)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar a tela `/busca` do contador — busca de produto por código/nome/BIN, formulário de lançamento cego (pallets/cases/units) com upsert, edição de contagem existente e retorno automático após confirmação.

**Architecture:** Server Component mínimo em `page.tsx` (guarda de auth via layout); Client Component `BuscaClient` orquestra 3 estados (`busca | form | sucesso`); Server Actions em `actions/contagem.ts` fazem busca e persistência. Conversão feita via RPC `convert_count` já existente no banco.

**Tech Stack:** Next.js 16.2.9 App Router · Tailwind CSS 4 · Supabase (supabase-server para actions) · TypeScript

---

## Mapa de Arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `actions/contagem.ts` | CRIAR | `buscarItens()` + `lancarContagem()` + tipos |
| `app/(counter)/busca/page.tsx` | MODIFICAR | Substituir placeholder por `<BuscaClient />` |
| `app/(counter)/busca/_components/BuscaClient.tsx` | CRIAR | Orquestra estados: busca / form / sucesso |
| `app/(counter)/busca/_components/SearchInput.tsx` | CRIAR | Input com debounce e foco automático |
| `app/(counter)/busca/_components/ResultList.tsx` | CRIAR | Lista de resultados com badge "✓ Já contado" |
| `app/(counter)/busca/_components/CountForm.tsx` | CRIAR | Formulário pallets/cases/units — novo e edição |
| `app/(counter)/busca/_components/SuccessScreen.tsx` | CRIAR | Tela pós-confirmação com countdown 2 s |

---

## Task 1 — Criar branch

**Files:**
- Nenhum arquivo modificado neste task

- [ ] **Step 1: Criar branch via GitHub MCP**

```
mcp__github__create_branch
  owner: ycristan
  repo: ProjectCountStock
  branch: feat/pr11-busca-contador
  from_branch: main
```

- [ ] **Step 2: Confirmar que a branch existe**

```
mcp__github__get_file_contents
  owner: ycristan
  repo: ProjectCountStock
  path: app/(counter)/busca/page.tsx
  branch: feat/pr11-busca-contador
```

Esperado: conteúdo atual do placeholder.

---

## Task 2 — Server Actions: `actions/contagem.ts`

**Files:**
- Criar: `actions/contagem.ts`

> **Nota sobre o UPSERT:** Os índices únicos em `count_entries` são parciais (`WHERE bin_location IS NULL` / `WHERE bin_location IS NOT NULL`). O `.upsert()` do Supabase não resolve índices parciais automaticamente. A solução é: buscar se a entry existe → UPDATE se sim, INSERT se não.

- [ ] **Step 1: Criar `actions/contagem.ts` via GitHub MCP**

```
mcp__github__create_or_update_file
  owner: ycristan
  repo: ProjectCountStock
  path: actions/contagem.ts
  branch: feat/pr11-busca-contador
  message: feat: server actions buscarItens e lancarContagem
```

Conteúdo completo do arquivo:

```ts
'use server'

import { createClient } from '@/lib/supabase-server'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type EntryExistente = {
  bin_location: string | null
  pallets: number
  cases: number
  units: number
}

export type ItemBusca = {
  brand_code: string
  brand_name: string
  bpu: number
  pallet_size: number
  bins: string[]
  binContexto?: string       // BIN pelo qual o item foi encontrado (busca por BIN)
  jaContado: boolean
  entriesExistentes: EntryExistente[]
}

export type LancarContagemPayload = {
  brand_code: string
  bin_location: string | null
  pallets: number
  cases: number
  units: number
}

export type LancarContagemResult = {
  error?: string
  final_cases?: number
  final_units?: number
  brand_name?: string
}

// ─── buscarItens ──────────────────────────────────────────────────────────────

export async function buscarItens(termo: string): Promise<ItemBusca[]> {
  const termoTrimmed = termo.trim()
  if (!termoTrimmed) return []

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const teamId = user.user_metadata?.team_id as string
  const counterRole = user.user_metadata?.counter_role as string

  type RawItem = { brand_code: string; brand_name: string; bpu: number; pallet_size: number }
  let items: RawItem[] = []
  let binContextoMap: Record<string, string> = {}

  // 1. Exact brand_code match
  const { data: exactMatch } = await supabase
    .from('inventory_items')
    .select('brand_code, brand_name, bpu, pallet_size')
    .eq('brand_code', termoTrimmed)
    .limit(1)

  if (exactMatch && exactMatch.length > 0) {
    items = exactMatch
  } else {
    // 2. BIN match (prefix)
    const { data: binMatch } = await supabase
      .from('item_bin_locations')
      .select('brand_code, bin_location')
      .ilike('bin_location', `${termoTrimmed}%`)
      .limit(20)

    if (binMatch && binMatch.length > 0) {
      const codes = [...new Set(binMatch.map((b) => b.brand_code))]
      const { data: binItems } = await supabase
        .from('inventory_items')
        .select('brand_code, brand_name, bpu, pallet_size')
        .in('brand_code', codes)
      items = binItems ?? []
      binContextoMap = Object.fromEntries(
        binMatch.map((b) => [b.brand_code, b.bin_location])
      )
    } else {
      // 3. Brand name search
      const { data: nameMatch } = await supabase
        .from('inventory_items')
        .select('brand_code, brand_name, bpu, pallet_size')
        .ilike('brand_name', `%${termoTrimmed}%`)
        .limit(20)
      items = nameMatch ?? []
    }
  }

  if (items.length === 0) return []

  const codes = items.map((i) => i.brand_code)

  // Buscar BINs de todos os itens
  const { data: binData } = await supabase
    .from('item_bin_locations')
    .select('brand_code, bin_location')
    .in('brand_code', codes)

  // Buscar entries existentes deste contador
  const { data: entries } = await supabase
    .from('count_entries')
    .select('brand_code, bin_location, pallets, cases, units')
    .eq('team_id', teamId)
    .eq('counter_role', counterRole)
    .in('brand_code', codes)

  return items.map((item) => {
    const bins = (binData ?? [])
      .filter((b) => b.brand_code === item.brand_code)
      .map((b) => b.bin_location as string)

    const entriesExistentes: EntryExistente[] = (entries ?? [])
      .filter((e) => e.brand_code === item.brand_code)
      .map((e) => ({
        bin_location: e.bin_location,
        pallets: e.pallets,
        cases: e.cases,
        units: e.units,
      }))

    return {
      brand_code: item.brand_code,
      brand_name: item.brand_name,
      bpu: item.bpu,
      pallet_size: item.pallet_size,
      bins,
      binContexto: binContextoMap[item.brand_code],
      jaContado: entriesExistentes.length > 0,
      entriesExistentes,
    }
  })
}

// ─── lancarContagem ───────────────────────────────────────────────────────────

export async function lancarContagem(
  payload: LancarContagemPayload
): Promise<LancarContagemResult> {
  if (payload.pallets < 0 || payload.cases < 0 || payload.units < 0) {
    return { error: 'Valores não podem ser negativos.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const teamId = user.user_metadata?.team_id as string
  const counterRole = user.user_metadata?.counter_role as string

  // Buscar dados do item
  const { data: item, error: itemError } = await supabase
    .from('inventory_items')
    .select('bpu, pallet_size, brand_name')
    .eq('brand_code', payload.brand_code)
    .single()

  if (itemError || !item) return { error: 'Item não encontrado.' }
  if (!item.bpu || !item.pallet_size) {
    return { error: 'Item com dados incompletos — contate o admin.' }
  }

  // Converter via RPC
  const { data: converted, error: convError } = await supabase.rpc('convert_count', {
    p_pallets: payload.pallets,
    p_cases: payload.cases,
    p_units: payload.units,
    p_bpu: item.bpu,
    p_pallet_size: item.pallet_size,
  })

  if (convError || !converted) return { error: 'Erro ao converter contagem.' }

  const row = Array.isArray(converted) ? converted[0] : converted
  const final_cases = row.final_cases as number
  const final_units = row.final_units as number

  // Verificar se entry já existe (índices parciais — não usar upsert direto)
  const existsQuery = supabase
    .from('count_entries')
    .select('id')
    .eq('team_id', teamId)
    .eq('counter_role', counterRole)
    .eq('brand_code', payload.brand_code)

  const { data: existing } = await (payload.bin_location === null
    ? existsQuery.is('bin_location', null)
    : existsQuery.eq('bin_location', payload.bin_location)
  ).maybeSingle()

  const updateData = {
    pallets: payload.pallets,
    cases: payload.cases,
    units: payload.units,
    final_cases,
    final_units,
    entered_at: new Date().toISOString(),
  }

  if (existing) {
    const { error } = await supabase
      .from('count_entries')
      .update(updateData)
      .eq('id', existing.id)
    if (error) return { error: `Erro ao atualizar: ${error.message}` }
  } else {
    const { error } = await supabase.from('count_entries').insert({
      team_id: teamId,
      counter_role: counterRole,
      brand_code: payload.brand_code,
      bin_location: payload.bin_location,
      is_joint_recount: false,
      ...updateData,
    })
    if (error) return { error: `Erro ao salvar: ${error.message}` }
  }

  return { final_cases, final_units, brand_name: item.brand_name }
}
```

- [ ] **Step 2: Verificar commit na branch**

```
mcp__github__get_file_contents
  owner: ycristan
  repo: ProjectCountStock
  path: actions/contagem.ts
  branch: feat/pr11-busca-contador
```

Esperado: arquivo com as duas funções exportadas.

---

## Task 3 — `SearchInput.tsx`

**Files:**
- Criar: `app/(counter)/busca/_components/SearchInput.tsx`

- [ ] **Step 1: Criar arquivo**

```
mcp__github__create_or_update_file
  owner: ycristan
  repo: ProjectCountStock
  path: app/(counter)/busca/_components/SearchInput.tsx
  branch: feat/pr11-busca-contador
  message: feat: SearchInput com debounce e foco automático
```

Conteúdo:

```tsx
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
        className="w-full text-base px-4 py-3 pr-10 rounded-xl border-[1.5px] border-slate-300 bg-slate-50 focus:outline-none focus:border-indigo-500"
      />
      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
        {loading ? (
          <span className="inline-block w-4 h-4 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin" />
        ) : (
          <span>🔍</span>
        )}
      </div>
    </div>
  )
}
```

---

## Task 4 — `ResultList.tsx`

**Files:**
- Criar: `app/(counter)/busca/_components/ResultList.tsx`

- [ ] **Step 1: Criar arquivo**

```
mcp__github__create_or_update_file
  owner: ycristan
  repo: ProjectCountStock
  path: app/(counter)/busca/_components/ResultList.tsx
  branch: feat/pr11-busca-contador
  message: feat: ResultList com badge já contado
```

Conteúdo:

```tsx
import type { ItemBusca } from '@/actions/contagem'

type Props = {
  items: ItemBusca[]
  onSelect: (item: ItemBusca) => void
}

export function ResultList({ items, onSelect }: Props) {
  if (items.length === 0) return null

  return (
    <div className="mt-3 rounded-xl border border-slate-200 overflow-hidden bg-white">
      {items.map((item) => (
        <button
          key={item.brand_code}
          onClick={() => onSelect(item)}
          className="w-full text-left px-4 py-3 border-b border-slate-100 last:border-b-0 flex justify-between items-center active:bg-slate-50"
        >
          <div>
            <div className="text-sm font-semibold text-slate-900">{item.brand_code}</div>
            <div className="text-xs text-slate-500">{item.brand_name}</div>
            {item.jaContado && (
              <div className="text-xs text-green-600 font-semibold mt-0.5">✓ Já contado</div>
            )}
          </div>
          <div className="text-indigo-500 text-lg">›</div>
        </button>
      ))}
    </div>
  )
}
```

---

## Task 5 — `CountForm.tsx`

**Files:**
- Criar: `app/(counter)/busca/_components/CountForm.tsx`

O formulário detecta automaticamente se é edição (item já contado para o BIN atual) e adapta cores e label do botão.

Regra para `binSelecionado`:
- Se `item.binContexto` está definido → usa esse BIN (item encontrado via busca por BIN)
- Se `item.bins.length === 1` → usa `item.bins[0]`
- Se `item.bins.length === 0` → `null` (item sem BIN)
- Se `item.bins.length > 1` e sem `binContexto` → mostra seletor de BIN

- [ ] **Step 1: Criar arquivo**

```
mcp__github__create_or_update_file
  owner: ycristan
  repo: ProjectCountStock
  path: app/(counter)/busca/_components/CountForm.tsx
  branch: feat/pr11-busca-contador
  message: feat: CountForm — novo lançamento e edição de contagem existente
```

Conteúdo:

```tsx
'use client'

import { useState, useTransition } from 'react'
import type { ItemBusca, LancarContagemResult } from '@/actions/contagem'
import { lancarContagem } from '@/actions/contagem'

type Props = {
  item: ItemBusca
  onVoltar: () => void
  onSucesso: (result: Required<Pick<LancarContagemResult, 'final_cases' | 'final_units' | 'brand_name'>>) => void
}

function initBin(item: ItemBusca): string | null {
  if (item.binContexto) return item.binContexto
  if (item.bins.length === 1) return item.bins[0]
  if (item.bins.length === 0) return null
  return null // múltiplos BINs sem contexto → aguarda seleção
}

export function CountForm({ item, onVoltar, onSucesso }: Props) {
  const [binSelecionado, setBinSelecionado] = useState<string | null>(initBin(item))

  const entryAtual = item.entriesExistentes.find(
    (e) => e.bin_location === binSelecionado
  ) ?? (item.entriesExistentes.length > 0 && item.bins.length <= 1 ? item.entriesExistentes[0] : undefined)

  const isEdit = !!entryAtual

  const [pallets, setPallets] = useState(String(entryAtual?.pallets ?? 0))
  const [cases, setCases] = useState(String(entryAtual?.cases ?? 0))
  const [units, setUnits] = useState(String(entryAtual?.units ?? 0))
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const precisaSelecionarBin =
    !item.binContexto && item.bins.length > 1 && binSelecionado === null

  const handleSubmit = () => {
    if (precisaSelecionarBin) {
      setErro('Selecione um BIN antes de confirmar.')
      return
    }
    setErro(null)
    const p = Math.max(0, parseInt(pallets) || 0)
    const c = Math.max(0, parseInt(cases) || 0)
    const u = Math.max(0, parseInt(units) || 0)

    startTransition(async () => {
      const result = await lancarContagem({
        brand_code: item.brand_code,
        bin_location: binSelecionado,
        pallets: p,
        cases: c,
        units: u,
      })
      if (result.error) {
        setErro(result.error)
      } else {
        onSucesso({
          final_cases: result.final_cases!,
          final_units: result.final_units!,
          brand_name: result.brand_name!,
        })
      }
    })
  }

  const borderClass = isEdit ? 'border-amber-400' : 'border-slate-300'
  const bgInput = isEdit ? 'bg-amber-50' : 'bg-slate-50'
  const headerClass = isEdit
    ? 'bg-amber-50 border-amber-200 text-amber-700'
    : 'bg-green-50 border-green-200 text-green-700'
  const btnClass = isEdit ? 'bg-amber-600' : 'bg-blue-600'
  const btnLabel = isPending
    ? 'Salvando...'
    : isEdit
    ? '✏️ Salvar Edição'
    : 'Confirmar Contagem'

  return (
    <div>
      {/* Header do item */}
      <div className={`rounded-xl p-3 mb-4 border ${headerClass}`}>
        <div className="text-[11px] font-semibold uppercase tracking-wide">
          {isEdit ? '✓ Já contado — editável' : 'Item selecionado'}
        </div>
        <div className="text-lg font-bold text-slate-900 mt-0.5">{item.brand_code}</div>
        <div className="text-sm text-slate-700">{item.brand_name}</div>
        <div className="text-xs text-slate-500 mt-1">
          {item.bins.length > 0 ? `BIN: ${item.bins.join(', ')} · ` : ''}
          BPU: {item.bpu} · Pallet: {item.pallet_size}
        </div>
      </div>

      {/* Seletor de BIN quando necessário */}
      {!item.binContexto && item.bins.length > 1 && (
        <div className="mb-4">
          <div className="text-xs font-semibold text-slate-500 uppercase mb-2">
            Selecione o BIN que está contando
          </div>
          <div className="flex gap-2 flex-wrap">
            {item.bins.map((bin) => (
              <button
                key={bin}
                onClick={() => setBinSelecionado(bin)}
                className={`px-3 py-2 rounded-lg text-sm border font-medium transition-colors ${
                  binSelecionado === bin
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'border-slate-200 text-slate-700 bg-white'
                }`}
              >
                {bin}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Campos pallets/cases/units */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: 'Pallets', value: pallets, set: setPallets },
          { label: 'Cases', value: cases, set: setCases },
          { label: 'Units', value: units, set: setUnits },
        ].map(({ label, value, set }) => (
          <div key={label} className="text-center">
            <div className="text-[11px] text-slate-500 font-semibold uppercase mb-1">{label}</div>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={value}
              onChange={(e) => set(e.target.value)}
              className={`w-full text-center text-2xl font-bold px-1 py-3 rounded-xl border-[1.5px] ${borderClass} ${bgInput} focus:outline-none focus:border-indigo-500`}
            />
          </div>
        ))}
      </div>

      {!isEdit && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs text-yellow-800 mb-3">
          ℹ️ Zeros são válidos — confirma que o item foi contado e estava zerado.
        </div>
      )}

      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700 mb-3">
          {erro}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={isPending}
        className={`w-full text-white font-semibold py-4 rounded-xl text-base transition-opacity disabled:opacity-60 ${btnClass}`}
      >
        {btnLabel}
      </button>
      <button
        onClick={onVoltar}
        className="w-full mt-2 text-slate-500 text-sm py-2.5 rounded-xl border border-slate-200"
      >
        ← Voltar à busca
      </button>
    </div>
  )
}
```

---

## Task 6 — `SuccessScreen.tsx`

**Files:**
- Criar: `app/(counter)/busca/_components/SuccessScreen.tsx`

- [ ] **Step 1: Criar arquivo**

```
mcp__github__create_or_update_file
  owner: ycristan
  repo: ProjectCountStock
  path: app/(counter)/busca/_components/SuccessScreen.tsx
  branch: feat/pr11-busca-contador
  message: feat: SuccessScreen com countdown 2s e auto-retorno à busca
```

Conteúdo:

```tsx
'use client'

import { useEffect, useState } from 'react'

type Props = {
  brandCode: string
  brandName: string
  finalCases: number
  finalUnits: number
  onDone: () => void
}

export function SuccessScreen({
  brandCode,
  brandName,
  finalCases,
  finalUnits,
  onDone,
}: Props) {
  const [seconds, setSeconds] = useState(2)

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(interval)
          onDone()
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [onDone])

  return (
    <div className="text-center py-8">
      <div className="text-5xl mb-3">✅</div>
      <div className="text-xl font-bold text-slate-900">Contagem salva!</div>
      <div className="text-sm text-slate-500 mt-1">
        {brandCode} · {brandName}
      </div>
      <div className="text-green-600 font-semibold mt-1 text-sm">
        {finalCases} cases + {finalUnits} units
      </div>

      <div className="mt-6 bg-green-50 border border-green-200 rounded-xl p-4">
        <div className="text-sm text-slate-600">Voltando para busca em...</div>
        <div className="text-4xl font-bold text-green-600 leading-tight mt-1">{seconds}</div>
        <div className="text-xs text-slate-500">segundos</div>
      </div>

      <button
        onClick={onDone}
        className="mt-4 w-full text-sm py-3 rounded-xl bg-slate-100 text-slate-700 border border-slate-200"
      >
        Buscar agora →
      </button>
    </div>
  )
}
```

---

## Task 7 — `BuscaClient.tsx`

**Files:**
- Criar: `app/(counter)/busca/_components/BuscaClient.tsx`

- [ ] **Step 1: Criar arquivo**

```
mcp__github__create_or_update_file
  owner: ycristan
  repo: ProjectCountStock
  path: app/(counter)/busca/_components/BuscaClient.tsx
  branch: feat/pr11-busca-contador
  message: feat: BuscaClient — orquestrador dos 3 estados da tela
```

Conteúdo:

```tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { buscarItens, type ItemBusca, type LancarContagemResult } from '@/actions/contagem'
import { SearchInput } from './SearchInput'
import { ResultList } from './ResultList'
import { CountForm } from './CountForm'
import { SuccessScreen } from './SuccessScreen'

type Tela = 'busca' | 'form' | 'sucesso'

type SucessoData = {
  brandCode: string
  brandName: string
  finalCases: number
  finalUnits: number
}

export function BuscaClient() {
  const [tela, setTela] = useState<Tela>('busca')
  const [termo, setTermo] = useState('')
  const [resultados, setResultados] = useState<ItemBusca[]>([])
  const [loading, setLoading] = useState(false)
  const [itemSelecionado, setItemSelecionado] = useState<ItemBusca | null>(null)
  const [sucesso, setSucesso] = useState<SucessoData | null>(null)

  // Busca com debounce 300 ms
  useEffect(() => {
    if (!termo.trim()) {
      setResultados([])
      return
    }
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const items = await buscarItens(termo)
        setResultados(items)
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => {
      clearTimeout(timer)
      setLoading(false)
    }
  }, [termo])

  const handleVoltar = useCallback(() => {
    setTela('busca')
    setItemSelecionado(null)
  }, [])

  const handleSucesso = useCallback(
    (result: Required<Pick<LancarContagemResult, 'final_cases' | 'final_units' | 'brand_name'>>) => {
      setSucesso({
        brandCode: itemSelecionado!.brand_code,
        brandName: result.brand_name,
        finalCases: result.final_cases,
        finalUnits: result.final_units,
      })
      setTela('sucesso')
    },
    [itemSelecionado]
  )

  const handleDone = useCallback(() => {
    setTela('busca')
    setTermo('')
    setResultados([])
    setItemSelecionado(null)
    setSucesso(null)
  }, [])

  if (tela === 'sucesso' && sucesso) {
    return (
      <SuccessScreen
        brandCode={sucesso.brandCode}
        brandName={sucesso.brandName}
        finalCases={sucesso.finalCases}
        finalUnits={sucesso.finalUnits}
        onDone={handleDone}
      />
    )
  }

  if (tela === 'form' && itemSelecionado) {
    return (
      <CountForm
        item={itemSelecionado}
        onVoltar={handleVoltar}
        onSucesso={handleSucesso}
      />
    )
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-slate-900 mb-4">Buscar Item</h2>
      <SearchInput value={termo} onChange={setTermo} loading={loading} />

      {termo.trim() && resultados.length === 0 && !loading && (
        <p className="text-sm text-slate-400 mt-3 text-center">
          Nenhum item encontrado para &ldquo;{termo}&rdquo;.
        </p>
      )}

      <ResultList
        items={resultados}
        onSelect={(item) => {
          setItemSelecionado(item)
          setTela('form')
        }}
      />

      {!termo && (
        <p className="text-sm text-slate-400 mt-4 text-center">
          Busque por código (ex: 6323), nome do produto ou BIN (ex: A-01)
        </p>
      )}
    </div>
  )
}
```

---

## Task 8 — Atualizar `page.tsx`

**Files:**
- Modificar: `app/(counter)/busca/page.tsx`

- [ ] **Step 1: Obter SHA atual do arquivo na branch**

```
mcp__github__get_file_contents
  owner: ycristan
  repo: ProjectCountStock
  path: app/(counter)/busca/page.tsx
  branch: feat/pr11-busca-contador
```

Guardar o `sha` retornado para usar no próximo step.

- [ ] **Step 2: Atualizar arquivo com SHA**

```
mcp__github__create_or_update_file
  owner: ycristan
  repo: ProjectCountStock
  path: app/(counter)/busca/page.tsx
  branch: feat/pr11-busca-contador
  sha: <sha do step anterior>
  message: feat: página /busca — substituir placeholder por BuscaClient
```

Conteúdo:

```tsx
import { BuscaClient } from './_components/BuscaClient'

export default function BuscaPage() {
  return <BuscaClient />
}
```

- [ ] **Step 3: Verificar arquivo atualizado**

```
mcp__github__get_file_contents
  owner: ycristan
  repo: ProjectCountStock
  path: app/(counter)/busca/page.tsx
  branch: feat/pr11-busca-contador
```

Esperado: apenas `import { BuscaClient }` e `return <BuscaClient />`.

---

## Task 9 — Abrir PR

**Files:**
- Nenhum arquivo modificado neste task

- [ ] **Step 1: Verificar que todos os arquivos estão na branch**

```
mcp__github__get_file_contents
  owner: ycristan
  repo: ProjectCountStock
  path: app/(counter)/busca/_components
  branch: feat/pr11-busca-contador
```

Esperado: 5 arquivos — `BuscaClient.tsx`, `CountForm.tsx`, `ResultList.tsx`, `SearchInput.tsx`, `SuccessScreen.tsx`.

- [ ] **Step 2: Abrir PR via GitHub MCP**

```
mcp__github__create_pull_request
  owner: ycristan
  repo: ProjectCountStock
  title: feat: tela mobile do contador — busca + lançamento cego (#11)
  body: |
    ## O que muda
    - Implementa `/busca` completo: busca por código, nome ou BIN
    - Formulário cego pallets/cases/units com conversão via `convert_count` RPC
    - Upsert inteligente: detecta entry existente → UPDATE; nova → INSERT
    - Edição: item já contado abre formulário pré-preenchido (border âmbar)
    - BIN múltiplo: seletor de BIN no formulário quando necessário
    - Pós-confirmação: resultado convertido + countdown 2 s + auto-retorno à busca
    
    ## Checklist de teste manual
    - [ ] Login como contador no celular
    - [ ] Busca por brand_code exato retorna 1 item
    - [ ] Busca por BIN retorna lista de itens daquela posição
    - [ ] Busca por nome parcial retorna itens com match
    - [ ] Lançar contagem nova → SuccessScreen mostra cases+units convertidos
    - [ ] Buscar o mesmo item → badge "✓ Já contado" + form pré-preenchido
    - [ ] Editar e salvar → valores atualizados no banco
    - [ ] Item com múltiplos BINs → seletor de BIN aparece no form
    - [ ] Zeros são aceitos (item contado como zerado)
    - [ ] Após 2 s volta automaticamente para busca com campo limpo
  head: feat/pr11-busca-contador
  base: main
```

---

## Após o PR — Merge

Seguir o padrão do projeto:

```bash
git fetch origin
git checkout main
git pull origin main
git merge --no-ff origin/feat/pr11-busca-contador -m "feat: tela mobile do contador — busca + lançamento cego (#11)"
git push origin main
```
