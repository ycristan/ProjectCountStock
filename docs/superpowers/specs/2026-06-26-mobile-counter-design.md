# Spec — Tela Mobile do Contador (PR #11)

**Data:** 2026-06-26  
**Rota:** `/busca` → `app/(counter)/busca/page.tsx`  
**Usuário alvo:** contador autenticado (role = 'counter') acessando pelo celular no chão do armazém

---

## Visão Geral

Tela única de contagem cega para o contador. Ele busca um item (por código, nome ou BIN), lança pallets/cases/units e confirma. Não vê o que os outros contadores lançaram — a cegueira é garantida por RLS no banco.

Após confirmar, a tela mostra o resultado convertido (cases + units) e volta automaticamente para a busca em 2 segundos.

---

## Estados da Tela

### ① Busca
- Campo de texto único, `inputmode="search"`, foco automático ao entrar na tela
- Busca em tempo real (debounce 300 ms) com três variantes:
  - **brand_code** (match exato): digita `6323` → retorna o item diretamente
  - **brand_name** (ILIKE `%termo%`): digita `coca` → lista itens com aquele nome
  - **bin_location** (ILIKE `A-01%`): digita `A-01` → lista itens daquela posição
- Cada resultado na lista exibe: `brand_code`, `brand_name`, e badge **"✓ Já contado"** se o contador já tem uma entry para aquele item naquele BIN
- Itens sem BIN cadastrado não aparecem em busca por BIN — comportamento esperado, não erro

### ② Seleção de item quando BIN retorna múltiplos
- Se a busca por BIN retornar mais de um `brand_code`, exibe lista para o contador escolher
- Toca num item → vai para o estado ③ ou ④

### ③ Novo lançamento (item ainda não contado)
- Card verde com dados do item: `brand_code`, `brand_name`, BINs cadastrados, BPU, Pallet Size
- Três campos numéricos grandes (`inputmode="numeric"`): **Pallets**, **Cases**, **Units** — todos iniciam em 0
- Nota informativa: "Incluindo zeros é válido — confirma que o item foi contado e estava zerado"
- Botão azul **"Confirmar Contagem"**
- Link "← Voltar à busca"

### ④ Editar lançamento existente (item já contado)
- Card âmbar com badge "✓ Já contado — editável"
- Campos pré-preenchidos com os valores da entry existente do contador
- Bordas âmbar nos inputs para sinalizar que é edição
- Botão âmbar **"✏️ Salvar Edição"** (mesma action que ③ — é um upsert)
- Link "← Voltar à busca"

### ⑤ Pós-confirmação
- Tela de sucesso com: ✅, nome do item, resultado convertido (`X cases + Y units`)
- Contador regressivo visual de 2 segundos
- Botão "Buscar agora →" para quem não quer esperar
- Após 2s: limpa tudo e volta para o estado ① com campo de busca em foco

---

## Arquitetura de Componentes

```
app/(counter)/busca/
  page.tsx              ← Server Component: carrega dados do usuário autenticado
  _components/
    BuscaClient.tsx     ← Client Component: orquestra os 4 estados
    SearchInput.tsx     ← input com debounce
    ResultList.tsx      ← lista de resultados (inclui badge "já contado")
    CountForm.tsx       ← formulário pallets/cases/units (usado nos estados ③ e ④)
    SuccessScreen.tsx   ← tela pós-confirmação com countdown 2s
actions/
  contagem.ts           ← server action: buscarItens() + lancarContagem()
```

### `page.tsx` (Server Component)
Responsabilidade única: buscar `team_id`, `counter_role` e `full_name` do usuário via `supabase.auth.getUser()` (user_metadata) e passar como props para `BuscaClient`.

Não faz query de itens — isso fica no client via server action para suportar busca interativa.

### `BuscaClient.tsx`
Gerencia o estado local da tela:
```ts
type Tela = 'busca' | 'form' | 'sucesso'
```
- `busca`: exibe `SearchInput` + `ResultList`
- `form`: exibe `CountForm` com item selecionado
- `sucesso`: exibe `SuccessScreen` com resultado; após 2s → volta para `'busca'`

### `CountForm.tsx`
Recebe `itemExistente?: CountEntry` — se presente, pré-preenche e muda label do botão para "Salvar Edição" e estilo para âmbar.

---

## Camada de Dados

### `actions/contagem.ts`

#### `buscarItens(termo: string, teamId: string, counterRole: string)`
Query em `inventory_items` + LEFT JOIN `item_bin_locations` + LEFT JOIN `count_entries` (filtrando `team_id` e `counter_role` do contador autenticado).

Retorna para cada item:
```ts
{
  brand_code: string
  brand_name: string
  bpu: number
  pallet_size: number
  bins: string[]           // BINs cadastrados
  jaContado: boolean       // true se já existe count_entry para este contador
  entryExistente?: {       // preenchido quando jaContado = true
    pallets: number
    cases: number
    units: number
    bin_location: string | null
  }
}
```

Lógica de busca:
- Se `termo` bate com `brand_code` exato → retorna 1 item diretamente
- Senão, testa se `termo` bate com BIN (ILIKE `termo%` em `item_bin_locations`) → retorna todos os `brand_code`s daquele BIN
- Senão, faz ILIKE `%termo%` em `brand_name`

#### `lancarContagem(payload: LancarContagemPayload)`
```ts
type LancarContagemPayload = {
  brand_code: string
  bin_location: string | null
  pallets: number
  cases: number
  units: number
}
```

Passos no servidor:
1. Busca `bpu` e `pallet_size` do item em `inventory_items`
2. Chama função SQL `convert_count(pallets, cases, units, bpu, pallet_size)` via RPC → `{ final_cases, final_units }`
3. Faz UPSERT em `count_entries` com `onConflict: 'team_id,counter_role,brand_code,bin_location'`
4. Retorna `{ final_cases, final_units, brand_name }`

`team_id` e `counter_role` vêm de `user_metadata` do usuário autenticado no servidor — nunca do cliente.

---

## RLS e Cegueira

O RLS já existente em `count_entries` garante que cada contador só lê as suas próprias entries. A cegueira é automática: a query de `buscarItens` retorna `jaContado` apenas para o próprio contador.

Nenhuma lógica extra é necessária no frontend para esconder dados alheios.

---

## Validação e Erros

| Situação | Comportamento |
|---|---|
| Todos os campos em 0 | Permitido — significa "item contado, quantidade zero" |
| Campo negativo | Bloqueado no `<input min="0">` + validação no servidor |
| Item sem BPU ou pallet_size | Server action retorna erro, mostra toast "Item com dados incompletos — contate o admin" |
| Falha de rede ao buscar | Exibe mensagem inline "Erro ao buscar — tente novamente" |
| Falha de rede ao confirmar | Exibe toast de erro, mantém form preenchido para retry |
| Sessão expirada | Supabase retorna 401; proxy.ts redireciona para `/login` |

---

## Casos de Borda (de regras-de-negocio.md §2)

- **BIN com múltiplos produtos:** lista de escolha obrigatória — nunca assume o item
- **Item sem BIN:** `bin_location = null` na entry; busca por BIN não retorna esse item (esperado)
- **Contador conta mesmo item em BINs diferentes:** cada combinação `(brand_code, bin_location)` é uma entry separada — UNIQUE index cobre isso
- **`count_focus` da equipe:** é rótulo organizacional, não trava campo — os 3 campos ficam sempre disponíveis

---

## Fora de Escopo deste PR

- Tela de "Finalizar Contagem" (encerra a rodada cega da equipe)
- Tela de Reconciliação
- Contador independente registrando valor pós-recontagem
- Qualquer tela do admin
