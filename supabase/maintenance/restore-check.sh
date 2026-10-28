#!/usr/bin/env bash
# Abre o arquivo criptografado de backup-dump.sh, restaura num banco descartável e confere,
# tabela por tabela, que todas as linhas do dump entraram.
# Uso: BACKUP_PASSPHRASE=... restore-check.sh <backup.tar.gz.gpg>   (PG* apontando para o banco descartável)
# Nunca apontar para produção: a restauração cria e grava tudo.
set -euo pipefail
file=${1:?arquivo backup.tar.gz.gpg}
: "${BACKUP_PASSPHRASE:?}"
case "${PGHOST:-}" in 127.0.0.1|localhost) ;; *) echo "restore-check só roda em banco local (PGHOST=${PGHOST:-})"; exit 1 ;; esac
dir=$(mktemp -d); trap 'rm -rf "$dir"' EXIT
gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 3 -d "$file" 3<<< "$BACKUP_PASSPHRASE" | tar -C "$dir" -xzf -

for f in roles schema data history_schema history_data; do
  test -s "$dir/$f.sql" || { echo "arquivo ausente ou vazio: $f.sql"; exit 1; }
done
grep -q '^COPY "public"."inventory_items"' "$dir/data.sql" || { echo "data.sql sem inventory_items"; exit 1; }

# Problema conhecido do guia da Supabase: esse GRANT falha fora do projeto de origem.
sed -i 's/^GRANT "postgres" TO "cli_login_postgres"/-- &/' "$dir/roles.sql"

psql -X -q --single-transaction -v ON_ERROR_STOP=1 \
  -f "$dir/roles.sql" -f "$dir/schema.sql" \
  -c 'SET session_replication_role = replica' -f "$dir/data.sql" >/dev/null
psql -X -q --single-transaction -v ON_ERROR_STOP=1 \
  -f "$dir/history_schema.sql" -f "$dir/history_data.sql" >/dev/null

# Linhas esperadas: cada linha entre `COPY "s"."t" ... FROM stdin;` e `\.` é um registro.
expected=$(cat "$dir/data.sql" "$dir/history_data.sql" | awk '
  /^COPY "[^"]+"\."[^"]+" .* FROM stdin;$/ { split($2, p, "."); t = p[1] "." p[2]; n = 0; next }
  t != "" && $0 == "\\." { print t, n; t = ""; next }
  t != "" { n++ }')

fail=0
while read -r table rows; do
  got=$(psql -X -At -c "select count(*) from $table")
  printf '%-55s dump=%-7s restaurado=%s\n' "$table" "$rows" "$got"
  [ "$got" = "$rows" ] || fail=1
done <<< "$expected"

[ "$(psql -X -At -c 'select count(*) from public.inventory_items')" -gt 0 ] || { echo "inventory_items vazio"; fail=1; }
[ "$fail" = 0 ] && echo "Restauração conferida: todas as tabelas com a mesma contagem do dump." || echo "Restauração DIVERGENTE."
exit $fail
