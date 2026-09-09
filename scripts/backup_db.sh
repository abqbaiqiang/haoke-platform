#!/bin/sh
set -eu
# Usage: sh scripts/backup_db.sh /absolute/host/backup-directory
dest=${1:?Provide the host backup directory}
mkdir -p "$dest"
file="$dest/songmao-$(date +%Y%m%d-%H%M%S).dump"
umask 077
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$file.partial"
mv "$file.partial" "$file"
printf 'Database backup completed: %s\n' "$file"
