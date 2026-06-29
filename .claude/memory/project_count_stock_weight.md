---
name: count-stock-weight-counting
description: "Escopo de contagem por peso — regras de negócio, campos, fluxo do contador e fórmula de cálculo"
metadata: 
  node_type: memory
  type: project
  originSessionId: 30e6d838-8f3e-4fe9-93ee-1594f3d6dd51
---

# Contagem por Peso — Escopo Completo

## Schema — nova coluna no inventário
- Adicionar coluna `weight_avg` (NUMERIC, default 0) na tabela de inventário
- Apenas itens com `weight_avg > 0` podem ser contados por peso

## Config admin — tara da caixa
- Admin configura o peso da tara de caixa (em gramas) por sessão ou globalmente
- Ex: caixa cinza = 300g

## Fluxo do contador (tela /busca)
1. Contador seleciona item com `weight_avg > 0`
2. Aparece opção: **"Insert count by weight"**
3. Ao selecionar, exibe formulário com:
   - Campo: **Número de caixas** (para cálculo da tara total)
   - Campo: **Peso final** (leitura da balança, em gramas)
4. Botão **"Adicionar nova rodada de pesagem"** — permite múltiplas pesagens quando as caixas não cabem todas na balança de uma vez
5. O sistema agrupa e soma todas as rodadas ao calcular

## Fórmula de cálculo
```
tara_total = num_caixas × tara_por_caixa
peso_liquido = peso_final - tara_total
quantidade_raw = peso_liquido / weight_avg
quantidade_final = arredondar(quantidade_raw)
```

## Regra de arredondamento (conservador)
- Parte decimal < 0.7 → arredonda para BAIXO
- Parte decimal >= 0.7 → arredonda para CIMA

### Exemplo
- Tara da caixa = 300g
- `weight_avg` do item (ex: barra Mars) = 20g
- Rodada: 3 caixas, peso final na balança = 962g
- Tara total = 3 × 300 = 900g
- Peso líquido = 962 - 900 = 62g
- Quantidade raw = 62 / 20 = 3.1
- 3.1 → decimal 0.1 < 0.7 → arredonda para **3 unidades**

## Input de peso — máscara automática
- Campo de peso usa máscara estilo moeda: usuário digita só os dígitos, o campo formata automaticamente
- Balança exibe em **gramas inteiros** (ex: `1250`)
- Campo armazena e recebe gramas inteiros — sem decimais
- Máscara formata com separador de milhar: usuário digita `1250` → exibe `1.250 g`
- Implementar com lógica de máscara no `onChange` (sem lib extra — ponytail)

## Status — IMPLEMENTADO (PR #12 em diante)
Tudo acima foi implementado. `weight_avg` existe em `inventory_items`. `box_tare_g` é coluna em `count_sessions`. Tela /busca tem o modo peso com múltiplas rodadas. Reconciliação por peso também implementada (PR #23).

## Tolerância no finalize_team_count (migration 010)
Se todos 3 contadores usaram is_weight_count: `GREATEST - LEAST <= 200g` → combinado.
