#!/bin/sh
set -eu
# Usage: sh scripts/backup_files.sh /absolute/data-root /absolute/backup-directory
source=${1:?Provide the host DATA_ROOT}
dest=${2:?Provide the backup directory}
test -d "$source/uploads"
mkdir -p "$dest"
umask 077
file="$dest/uploads-$(date +%Y%m%d-%H%M%S).tar.gz"
tar -czf "$file.partial" -C "$source" uploads
mv "$file.partial" "$file"
printf 'Upload backup completed: %s\n' "$file"
