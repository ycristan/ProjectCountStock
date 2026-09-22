# Entrega 2 — fundação técnica em implementação

PR dependente da #73. Não publicar ou aplicar isoladamente.

## Implementado neste bloco
- team_flows identifica exclusivamente equipes do novo fluxo; ausência significa legado, nunca conversão implícita.
- team_memberships separa identidade Auth e participação/papel/ordem/estado individual. Uma identidade pode participar de mais de uma equipe.
- team_count_slots representa a posição lógica e team_slot_assignments preserva autoria temporal na substituição.
- team_count_records preserva Pallets/Cases/Units, BPU/Pallet Size usados e método; unidades canônicas são geradas pela mesma fórmula de convert_count. Histórico preserva componentes e resultados, permitindo futura correção aprovada de BPU sem perder o que foi contado.
- Leitura RLS: contador vê só seus registros, independente monitora seus vínculos ativos, admin protegido lê histórico. Encerrar A não remove acesso B.
- Nenhum cliente, admin da aplicação ou service_role recebe escrita direta nas tabelas novas. Comandos transacionais com autorização entram nas próximas partes; não conceder ALL para contornar erros.
- Guardas de autoria, revisões, WHS, bloqueio individual, transições básicas, congelamento e exclusão. Escritas legadas rejeitam equipes versionadas.
- Migration aditiva, sem backfill, sem alteração de PIN/contagens/autenticação legados.
- CLI gerou o nome da migration no runner: execução 35720003065, sem conexão ao banco real.

## Limites explícitos
Este bloco NÃO conclui a entrega 2 inteira. Ainda faltam comandos autorizados, decisões/ações auditadas, snapshot completo de resultados e integração com a identidade da aplicação.
Não há botão novo, novo login, criação de equipe pela UI nem captura de assinatura habilitados.
Quantidade canônica é derivada dos componentes, não fornecida livremente pelo cliente. Não há API de escrita. Validação de métodos e conversão de peso continuam pendentes na integração.
Guardas de fase não comprovam pendências de conciliação ou evidências de assinatura. Essas verificações devem existir nos comandos antes de liberar qualquer escrita.
Substituição pelo independente permanece indisponível até a operação dedicada da entrega 6; a fundação não autoriza esse atalho.
A proteção de contagem cega nova não corrige por si só as rotas legadas. Correções da PR72 serão incorporadas com rastreabilidade.
Não implementar duas aplicações em paralelo: os registros antigos permanecem para histórico/compatibilidade, equipes novas só serão roteadas ao novo fluxo após integração completa e ativação aprovada.

## Verificação executada
Código: 4c06317ca3a29d4476ac04d825eb3c488530f940.
Execução aprovada: https://github.com/ycristan/ProjectCountStock/actions/runs/35722151547
- 136 testes SQL (90 anteriores + 46 novos).
- Upgrade com comparação de todas as tabelas públicas preexistentes e auth.users, incluindo PIN individual sintético gerado no runner.
- Duas disputas concorrentes usando conexões PostgreSQL separadas: edição/edição e edição/congelamento.
- Lint SQL sem erros.
- Build e regressão HTTP de Auth/ZIP/erro com coletor SDK isolado. Não prova recebimento no Sentry hospedado.
Cobertura parcial T01/T03/T04/T05/T06/T07/T08/T31/T33/T37/T38/T44/T45/T49/T50/T53.
Não equivale à execução completa dos 55 cenários nem a navegador/Realtime/PIN do novo fluxo.
O exemplo BPU 20/24 verifica capacidade de armazenamento/recálculo, NÃO a operação de aprovação dupla ainda pendente.
Falhas anteriores de sintaxe e preparação/isolamento dos testes foram corrigidas sem relaxar permissões nem remover verificações.

## Referências técnicas
RLS/grants e diferença entre autorização e autenticação conferidos na documentação oficial:
https://supabase.com/docs/guides/database/postgres/row-level-security
O índice changelog.md não foi renderizado pelo leitor web (tipo text/markdown); não alegar revisão desse conteúdo.
