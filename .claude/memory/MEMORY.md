# Memory Index

A memória deste projeto é espelhada em **dois lugares**: este repo (`.claude/memory/`) e a máquina local do usuário (`~/.claude/projects/.../memory/`). **Atualizar os dois juntos, sempre** — nunca só um.

Este índice é a primeira coisa lida ao retomar o projeto. Se ele estiver desatualizado, uma sessão nova começa trabalhando com estado errado (já aconteceu: ficou preso em 2026-07-03 mandando mergear uma PR que já estava na main).

## Count Stock — ler nesta ordem ao retomar

- [Project: Count Stock](project_count_stock.md) — **LER PRIMEIRO.** Estado atual, stack, fluxo de contagem tripla, solo count, PRs, migrations até 025, bugs conhecidos já resolvidos. Atualizado 2026-08-05 (PR #58 mergeado e fechado).
- [Arquitetura Técnica](project_count_stock_architecture.md) — schema, qual cliente Supabase usar onde, autenticação de Realtime, fórmulas de contagem, e as armadilhas que já custaram produção: `proxy.ts` (login em loop), cap de 1000 linhas do PostgREST (`fetchAllRows`), soma aditiva do `BuscaClient`.
- [Roadmap pós-primeira contagem real](project_count_stock_roadmap.md) — 10 itens P0–P4, ordem de execução **já decidida pelo usuário, não repreguntar**. Itens 1 e 7 concluídos; próximo da fila é o item 2 (contagem por peso não permite "adicionar rodada" nem reconciliação).
- [Contagem por peso — escopo](project_count_stock_weight.md) — regras de negócio, fórmula, regra de arredondamento 0.7, máscara do input de gramas. Implementado desde o PR #12; útil como referência do porquê das fórmulas.

## Como trabalhar neste projeto

- [Perfil do usuário](user_profile.md) — gerente de projeto e especialista de negócio, **não é desenvolvedor**. Claude faz 100% do trabalho técnico (arquivos, commits, PRs, migrations, deploy). Português brasileiro sempre.
- [Git workflow](feedback_git_workflow.md) — toda mudança de código vira branch + PR. **Merge na main só com autorização explícita do usuário naquela vez** — já houve 2 incidentes de merge não autorizado.
- [Reuso de componentes](feedback_reuse_components.md) — reusar `BuscaClient`, `CountForm` e afins em vez de escrever versões paralelas; divergência visual é inaceitável para o usuário. É a base do plano de rebrand em 4 PRs.
- [Ponytail](feedback_ponytail.md) — modo `full` obrigatório antes de escrever qualquer código: mínimo necessário, sem over-engineering.

## Histórico — contexto, não estado atual

Os snapshots abaixo são fotos de momentos passados. **Não use nenhum deles como "estado atual"** — para isso existe o `project_count_stock.md`.

- [Snapshot 2026-07-03](project_count_stock_snapshot_2026-07-03.md) — registro do reset de produção. **Obsoleto como estado**: diz que a PR #49 está aberta aguardando merge, quando ela foi mergeada no mesmo dia.
- [Snapshot 2026-07-01](project_count_stock_snapshot_2026-07-01.md) — solo count (#43), Excel (#44), achado de colisão de sessão multi-login.
- [Snapshot 2026-06-29](project_count_stock_snapshot_2026-06-29.md) — o mais antigo.

## Outro projeto

- [JurisMaster](project_jurismaster.md) — sistema de gestão para escritório de advocacia. **Nada a ver com o Count Stock**; mora nesta pasta por acidente de histórico.
