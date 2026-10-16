#!/bin/sh
# Runs in the backup container: pg_dump every night at 02:00 UTC, keep 14 days.
set -eu
while true; do
  now=$(date -u +%s)
  next=$(date -u -d "$(date -u +%Y-%m-%d) 02:00" +%s 2>/dev/null || echo $((now + 86400)))
  [ "$next" -le "$now" ] && next=$((next + 86400))
  sleep $((next - now))
  file="/backups/daddy_jokes-$(date -u +%Y%m%d-%H%M).sql.gz"
  if pg_dump -h postgres -U daddy daddy_jokes | gzip > "$file.part"; then
    mv "$file.part" "$file"
    echo "backup: wrote $file"
  else
    rm -f "$file.part"
    echo "backup: FAILED" >&2
  fi
  ls -1t /backups/daddy_jokes-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
done
