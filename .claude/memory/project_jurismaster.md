---
name: JurisMaster — Contexto do Projeto
description: Decisões de negócio e arquitetura do sistema JurisMaster para o escritório Família Sem Fronteiras
type: project
---

Sistema de gestão para escritório de advocacia "Família Sem Fronteiras". App: JurisMaster.

## Stack
Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + Lucide Icons. pnpm como package manager. Mock data primeiro, Supabase depois.

## Decisões de negócio confirmadas
- **Valor/hora:** fixo por escritório (as sócias compartilham o mesmo valor)
- **Imposto (ISS etc.):** configurável — deixar em aberto para equipe financeira preencher no painel
- **Proposta PDF:** sim, com campo de assinatura/concordância do cliente
- **Cálculo de honorários:** vinculado a cliente + processo específico

## Módulos do sistema
1. **Configurações do Escritório** — valor/hora, taxa de imposto (editável)
2. **Clientes** — CRUD completo
3. **Processos** — vinculado a cliente
4. **Calculadora de Honorários** — vinculada a processo/cliente, gera proposta PDF

## Lógica de cálculo de honorários (camadas acumulativas)
1. Base = Σ(horas por atividade) × valor/hora
   - Atividades: análise de documentos, petições, reuniões de negociação, diligências, audiência de conciliação, audiência de instrução, contatos com cliente
2. + Complexidade: A=10% | B=20% | C=30% | D=40%
3. + Duração: 1-2 anos=10% | 2-4 anos=20% | 4-5 anos=30% | +6 anos=40%
4. + % de Lucro (livre)
5. + Parcelamento: 3 meses=10% | 6-8 meses=20% | 8-12 meses=30%
6. + Taxa de urgência/emergência (livre, %)
7. + Imposto (configurável, ex: ISS 6,5%)
= TOTAL com tabela de parcelas de 2 a 12x

## Planilha 2 — Cálculo da hora base
Custos fixos mensais ÷ (horas/dia × dias/mês) = valor/hora
Isso alimenta o módulo de Configurações do Escritório.

**Why:** Escritório real em operação, dados reais serão inseridos. Imposto variável por município.
**How to apply:** Nunca hardcodar taxas. Tudo que é financeiro deve ser configurável.

## Estado atual do projeto (29/03/2026 — sessão 1)

### Projeto criado do zero
- Localização: `C:\Users\yuna-\Desktop\Projeto Site Familia Sem Fronteiras\jurismaster\`
- Stack instalada e configurada: Next.js 16.2 + TypeScript + Tailwind v4 + shadcn/ui (base-ui) + pnpm

### Arquivos-chave criados
- `src/types/index.ts` — todos os tipos TypeScript
- `src/lib/honorarios.ts` — engine de cálculo com as 7 camadas
- `src/lib/mock-data.ts` — dados mockados
- `src/components/app-sidebar.tsx` — sidebar de navegação
- `src/components/cliente-dialog.tsx` — modal CRUD de clientes
- `src/components/processo-dialog.tsx` — modal CRUD de processos
- `src/components/proposta-pdf.tsx` — documento PDF com @react-pdf/renderer
- `src/components/download-proposta-btn.tsx` — botão de geração e download do PDF

### Páginas funcionando
- `/dashboard`, `/clientes`, `/processos`, `/honorarios`, `/honorarios/calcular`, `/configuracoes`

### Observação técnica importante
- O shadcn/ui nesta versão usa `@base-ui/react` (não Radix). O `Select.Root.onValueChange` recebe `(value: string | null, eventDetails)`. Já existe helper `onSelect()` nos componentes para adaptar isso.
- A geração de PDF usa dynamic import para evitar problemas de SSR.

### Próximos passos (Fase 1 restante)
- Refinamentos visuais/UX solicitados pelas clientes após ver o MVP
- Persistência de dados criados via CRUD (hoje os dados mockados são recarregados ao refresh)
- Integração Supabase (Fase 2)
