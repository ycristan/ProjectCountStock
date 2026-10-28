#!/usr/bin/env bash
# Exporta o banco (só leitura) e grava um único arquivo criptografado: <saida>/backup.tar.gz.gpg.
# Uso: SUPABASE_DB_URL=... BACKUP_PASSPHRASE=... backup-dump.sh <saida>
# O texto puro nunca sai da pasta temporária, que é apagada no fim.
set -euo pipefail
out=${1:?pasta de saída}
: "${SUPABASE_DB_URL:?}" "${BACKUP_PASSPHRASE:?}"
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
dump() { supabase db dump --db-url "$SUPABASE_DB_URL" "$@"; }
dump -f "$work/roles.sql" --role-only
dump -f "$work/schema.sql"
dump -f "$work/data.sql" --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
dump -f "$work/history_schema.sql" --schema supabase_migrations
dump -f "$work/history_data.sql" --use-copy --data-only --schema supabase_migrations
mkdir -p "$out"
tar -C "$work" -czf - . | gpg --batch --yes --pinentry-mode loopback --symmetric --cipher-algo AES256 \
  --passphrase-fd 3 -o "$out/backup.tar.gz.gpg" 3<<< "$BACKUP_PASSPHRASE"
echo "Backup criptografado: $(du -h "$out/backup.tar.gz.gpg" | cut -f1)"
