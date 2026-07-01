# Memory Index

- [JurisMaster — Contexto do Projeto](project_jurismaster.md) — decisões de negócio, stack, módulos, estado atual e próximos passos do sistema para o escritório Família Sem Fronteiras
- [Perfil do usuário](user_profile.md) — gerente de projeto, especialista jurídico, não-dev; todas as decisões técnicas ficam com o Claude
- [Count Stock — Projeto](project_count_stock.md) — stack, fluxo, links de acesso (histórico de PRs desatualizado — ver snapshot 2026-07-01)
- [Count Stock — Arquitetura Técnica](project_count_stock_architecture.md) — schema DB, padrão Realtime auth, fórmulas contagem, convenções código, armadilhas conhecidas
- [Count Stock — Contagem por Peso](project_count_stock_weight.md) — weight_avg, tara, multi-rodada, fórmula arredondamento, tolerância 200g no finalize RPC
- [Count Stock — Snapshot 2026-07-01 (ATUAL)](project_count_stock_snapshot_2026-07-01.md) — estado após PRs #24–#44: solo count admin-only, Excel espelhado + Template Import Reconc, achado de colisão de sessão multi-login, pendências
- [Count Stock — Snapshot 2026-06-29 (SUPERADO)](project_count_stock_snapshot_2026-06-29.md) — histórico; use o snapshot 2026-07-01 para o estado atual
- [Feedback — reusar componentes / padronizar](feedback_reuse_components.md) — reusar CountForm/BuscaClient etc. em vez de reimplementar; valores sempre cases+units sem rótulos
- [Ponytail obrigatório](feedback_ponytail.md) — plugin Ponytail deve ser ativado em toda tarefa de escrita de código
- [Git workflow](feedback_git_workflow.md) — sempre PR; push direto na main só se o usuário mandar explicitamente
