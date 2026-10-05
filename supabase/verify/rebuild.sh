#!/bin/bash
# Uji rebuild migrasi: buat database kosong, pasang stub minimal lingkungan
# Supabase (auth/storage/role), lalu jalankan SEMUA file supabase/migrations
# berurutan -- berhenti di error pertama. Dipakai saat audit migrasi
# 5 Okt 2026 untuk membuktikan repo bisa membangun ulang production.
#
# Pakai: PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres supabase/verify/rebuild.sh
# (butuh Postgres >= 14 lokal; JANGAN diarahkan ke database production --
# skrip ini DROP DATABASE "$REBUILD_DB").
#
# Setelah lolos, bandingkan sidik skema dengan production:
#   psql -d "$REBUILD_DB" -tA -f supabase/verify/schema_fingerprint.sql
# lalu jalankan query yang sama di Supabase SQL Editor dan bandingkan.
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
MIGRATIONS="$DIR/../migrations"
REBUILD_DB="${REBUILD_DB:-migration_rebuild_test}"
P="psql -X -q"
$P -d postgres -c "drop database if exists $REBUILD_DB" -c "create database $REBUILD_DB" >/dev/null || exit 1
$P -d "$REBUILD_DB" -v ON_ERROR_STOP=1 -f "$DIR/supabase_stub.sql" >/dev/null 2>&1 || { echo "STUB GAGAL"; exit 1; }
n=0
for f in $(ls "$MIGRATIONS"/*.sql | LC_ALL=C sort); do
  out=$($P -d "$REBUILD_DB" -v ON_ERROR_STOP=1 -1 -f "$f" 2>&1)
  if [ $? -ne 0 ]; then
    echo "GAGAL di $(basename "$f") (setelah $n file lolos):"
    echo "$out" | grep -E "ERROR|LINE|DETAIL|HINT" | head -6
    exit 2
  fi
  n=$((n + 1))
done
echo "OK: $n migrasi berhasil diterapkan berurutan dari database kosong."
