# Produto — Count Stock

## Objetivo
Sistema web para contagem física de inventário em warehouse. Ele reduz divergências ao separar responsabilidades, registrar contagens e conduzir a reconciliação antes de consolidar o resultado.

## Usuários
- **Administrador:** importa inventário, cria sessões e equipes, acompanha o progresso, encerra/combina resultados e administra a modalidade solo.
- **Contador 1 e Contador 2:** registram suas próprias contagens sem ver a contagem do outro.
- **Independente:** atua na reconciliação dos itens com divergência.
- **Contador solo fixo:** recebe sessões solo atribuídas, pode ter lista de itens restrita e encerra sua própria sessão.

## Fluxo principal
1. Administrador importa ou atualiza o inventário.
2. Cria uma sessão e equipes.
3. Contadores 1 e 2 registram contagens cegas.
4. O sistema compara resultados; itens divergentes vão para reconciliação.
5. O independente resolve divergências.
6. O administrador consolida as equipes e fecha a sessão.
7. O sistema permite exportar os resultados.

## Regras de negócio importantes
- Itens de inventário com histórico não são apagados: ficam inativos quando removidos da planilha.
- Um contador não pode visualizar nem alterar a contagem de outro.
- Após o fechamento, não pode haver novas contagens naquela sessão.
- Formato exibido de quantidade: `casos+unidades`, por exemplo `10+21`.
- Contagem por peso desconta tara das caixas e converte peso líquido usando o peso médio do item.
- Para BPU igual a 1, a contagem é somente em unidades.
