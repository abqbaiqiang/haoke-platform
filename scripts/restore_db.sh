#!/bin/sh
set -eu
# Restores ONLY to a new, explicitly named database. Never overwrites the active database.
file=${1:?Provide a pg_dump custom-format backup}
target=${2:?Provide a new database name ending in _restore}
case "$target" in *[!a-z0-9_]*|'') echo 'Only lowercase letters, numbers and underscores allowed'; exit 1;; esac
case "$target" in *_restore) ;; *) echo 'Target must end in _restore'; exit 1;; esac
test -f "$file"
docker compose exec -T postgres sh -c 'createdb -U "$POSTGRES_USER" "$1"' sh "$target"
docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$1" --exit-on-error --single-transaction' sh "$target" < "$file"
printf 'Restored into isolated database: %s\n' "$target"
