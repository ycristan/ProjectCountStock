# Laboratório remoto no Codespaces

Preparação isolada, sem publicação. Código rastreado da branch é copiado para um diretório temporário remoto; arquivos modificados do Codespace não são sobrescritos. Nada é instalado ou salvo no Windows.

## Iniciar
Na branch codex/team-flow-foundation, dentro do terminal do Codespace:
```bash
test "$(git branch --show-current)" = "codex/team-flow-foundation" && git fetch origin codex/team-flow-foundation && git merge --ff-only FETCH_HEAD && node scripts/codespace-lab.mjs
```

O comando confirma a branch e atualiza somente por avanço linear. Se houver conflito com alterações existentes, para sem apagá-las; não executar reset/checkout forçado.

Primeiro início baixa ferramentas e constrói o app. CLI Supabase fixado em 2.117.0; dependências do aplicativo vêm do lockfile com npm ci. Não usa login/link/db push, URL remota, dump de produção ou reset automático. Migrações versionadas constroem o banco local de teste.

O launcher não depende do comando de administração de portas do GitHub CLI. Após LAB READY, na aba Ports adicione 3100 se necessário e confirme Port Visibility > Private antes de abrir o navegador. Private é o padrão do Codespaces, mas uma porta previamente alterada precisa ser conferida. O processo escuta somente em 127.0.0.1. Não publique nenhuma porta do banco/Studio. Fluxo privado de autenticação e WebSocket no domínio real do Codespaces ainda requer avaliação manual.

Dois admins sintéticos são gerados a cada início; contas anteriores e contagens não são apagadas. Os acessos ficam exclusivamente em .count-stock-lab-access.json (ignorado pelo Git, permissão 0600), aberto no editor quando disponível. Não compartilhar arquivo, credenciais ou cartões. Dados fictícios permanecem nos volumes do Codespace; não há garantia de conservação se o Codespace for excluído.

## Isolamento
Supabase local com Docker ligado ao loopback. Uma entrada privada na porta 3100 encaminha app, Auth/REST/Storage e Realtime WebSocket no mesmo domínio; servidor usa API local. Quatro adaptações guardadas de URL/cookie são feitas somente no snapshot temporário, sem mudar os arquivos de produção. RLS e comandos reais são mantidos.
Ambiente herdado remove variáveis Supabase/Sentry/EmailJS/Vercel/Postgres; snapshot não inclui .env não rastreado. Chaves locais somente em memória; service_role nunca entregue ao navegador. Telemetria externa desativada neste laboratório.
Banco sintético contém LAB Main Warehouse / LAB Service Warehouse, BIN 40B em ambas, produto ativo/inativo e BPU1/peso. Produtos existentes não são atualizados silenciosamente ao reiniciar.

Ctrl+C para aplicação/serviços locais, preservando banco sintético. Pare também o Codespace para não consumir processamento. Armazenamento continua consumindo franquia enquanto o ambiente existir. Sem upgrade/cartão/cobrança configurados pelo agente.

## Teste manual necessário, depois de LAB READY
1. Entrar como admin sintético, consultar Inventory: LAB Kinder Active / Inactive na LAB Main, produto LAB Service Only na outra.
2. Criar sessão somente na LAB Main e equipe variável. Guardar cartões somente no ambiente de teste.
3. Abrir perfis/janelas separados para dois contadores e Independente; admin inicia equipe pelo monitor.
4. Contadores localizam ativo/inativo e registram valores diferentes; nenhum vê o valor do outro. Independente acompanha sem formulário de contagem inicial.
5. Recarregar páginas: login e registros persistem; somente produtos da WHS escolhida aparecem.
6. Observar atualização ao vivo; não confundir fallback de 15 segundos com comprovação de WebSocket no domínio do Codespaces.

Bloco 4 é testável; pedido individual nas telas, conciliação, assinaturas e fechamento completos ainda são próximos blocos. Não tratar ausência desses botões como implementação concluída.
CI usa o mesmo launcher e reutiliza a verificação real de contagem/monitor de 3/4/5 pessoas. Simula gateway local, não comprova autenticação externa do GitHub. Resultado aprovado: https://github.com/ycristan/ProjectCountStock/actions/runs/37006686672 no código 1da71ca9a2d7258e0d147d79f901a03a12640209.

Ponytail full/Review: CLI existente, biblioteca padrão Node, verificações do bloco 4 reutilizadas; nenhuma dependência de produção ou mudança de regra de negócio. Snapshot temporário evita introduzir modo laboratório no app de produção. Lean already. Ship. (complexidade; não substitui testes).
