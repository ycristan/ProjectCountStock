#!/bin/bash
# Caveman é obrigatório neste projeto (CLAUDE.md): a saída deste hook entra no contexto do agente.
echo "Modo caveman obrigatório nesta sessão. Siga estas regras em toda resposta:"
sed '1,/^---$/d' "$CLAUDE_PROJECT_DIR/.claude/skills/caveman/SKILL.md"

# Sessões na nuvem começam sem node_modules; instala para typecheck, lint e testes funcionarem.
[ "$CLAUDE_CODE_REMOTE" = "true" ] || exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0
[ -d node_modules ] && exit 0
npm ci --ignore-scripts --no-audit --no-fund >/tmp/npm-ci.log 2>&1 && exit 0
echo "npm ci falhou (ver /tmp/npm-ci.log). Se for 403 em cdn.sheetjs.com, a rede do ambiente precisa liberar esse domínio."
exit 0
