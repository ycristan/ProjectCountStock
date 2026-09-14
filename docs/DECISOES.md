# Decisões do projeto

## Como trabalhamos
- O repositório GitHub é a fonte de verdade; toda alteração vai por branch e PR.
- Yuri define comportamento de negócio; o agente propõe, explica e implementa a solução técnica.
- A comunicação com Yuri deve ser em português simples.
- Não fazer merge em `main` sem autorização explícita.

## Banco de dados
- Mudanças no Supabase devem existir como migration versionada em `supabase/migrations/`.
- A aplicação pode exigir aplicação manual da migration no Supabase; o PR deve dizer claramente se há esse passo.
- Dados de inventário com histórico são desativados, não excluídos.

## Segurança
- Papéis e permissões não devem usar `user_metadata` como fonte de autorização.
- Cada ação que altera dados precisa conferir permissão no servidor, mesmo que a rota já seja protegida visualmente.
- O cliente com `service_role` só pode ser usado depois da conferência de autorização.

## Produto
- O contador solo usa uma conta fixa administrada pela tela de configurações; credenciais nunca são documentadas.
- A abordagem antiga de login solo por cookie/PIN foi abandonada; não reintroduzir sem uma nova especificação.


## Autorização protegida
- A fonte de autorização será a tabela protegida `app_user_access`, lida no servidor e nas políticas RLS. Ela poderá conter mais de um tipo de acesso por usuário.
- `user_metadata` pode continuar a guardar apenas informação de apresentação, como nome; não concede permissões.
- A migration de autorização precisa ser aplicada no Supabase antes de publicar o código que passa a depender dela.

## Testes de contrato — PR #69
Executar funções reais com dependências simuladas sem produção. Manter falhas de regras pendentes visíveis; não inverter expectativas nem usar skip para aparentar aprovação. Cobertura da aplicação não substitui testes de banco e integração.

## Proteções solo implementadas em proposta — PR #69
- Guardas na aplicação e no banco: fechados imutáveis, lista iniciada congelada, BPU bloqueado enquanto existir solo aberto. Campos restantes continuam editáveis com BPU inalterado.
- Início durável: nome do contador já definido ou primeira entrada registrada; backfill preserva esse fato para sessões existentes. Não exigir recontagem.
- Triggers invoker em schema privado mantêm as permissões atuais; não expõem RPC privilegiada. Testes de banco usam service_role para verificar também caminhos administrativos.
- Sem aplicação em produção nem merge nesta etapa. Aprovação dupla de equipes não foi implementada aqui.
