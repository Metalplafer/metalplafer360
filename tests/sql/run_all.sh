#!/usr/bin/env bash
# =====================================================================
# METALPLAFER360 · Ejecuta el SQL real y la batería de pruebas de
# seguridad sobre un PostgreSQL 16 local y limpio.
#
#   bash tests/sql/run_all.sh
# =====================================================================
set -euo pipefail

PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PORT=${PGPORT_TEST:-5433}
DATA=/tmp/m360-pgdata
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
P="psql -h localhost -p $PORT -U postgres -v ON_ERROR_STOP=1 -q -X"

if ! "$PGBIN/pg_isready" -h localhost -p "$PORT" -q 2>/dev/null; then
  echo "▶ Arrancando PostgreSQL de pruebas en el puerto $PORT"
  rm -rf "$DATA"; mkdir -p /tmp/pgsock
  if [ "$(id -u)" = "0" ]; then
    id postgres >/dev/null 2>&1 || useradd -m postgres
    chown postgres /tmp/pgsock "$(dirname "$DATA")" 2>/dev/null || true
    su postgres -c "$PGBIN/initdb -D $DATA -U postgres --auth=trust -E UTF8 --locale=C.UTF-8" >/dev/null
    su postgres -c "$PGBIN/pg_ctl -D $DATA -o '-p $PORT -k /tmp/pgsock -c listen_addresses=localhost' -l /tmp/m360-pg.log start" >/dev/null
  else
    "$PGBIN/initdb" -D "$DATA" -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null
    "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp/pgsock -c listen_addresses=localhost" -l /tmp/m360-pg.log start >/dev/null
  fi
  sleep 2
fi

$P -c "drop database if exists m360" -c "create database m360" >/dev/null
for r in anon authenticated service_role authenticator; do
  $P -c "drop role if exists $r" >/dev/null 2>&1 || true
done

echo "▶ Preparando entorno Supabase simulado"
$P -d m360 -f "$ROOT/tests/sql/00_mock_supabase.sql" >/dev/null

echo "▶ Instalando el SQL de METALPLAFER360"
for f in "$ROOT"/supabase/sql/0[1-46-9]_*.sql "$ROOT"/supabase/sql/[12][0-9]_*.sql; do
  [ -e "$f" ] || continue
  case "$(basename "$f")" in 05_*) continue;; esac
  echo "   · $(basename "$f")"
  $P -d m360 -f "$f" 2>&1 | grep -vE '^(NOTICE|$)' || true
done

# El payload de la prueba de restauración se genera con el mismo código
# que crea las copias, para probar el camino de verdad (CSV → texto → base).
PAYLOAD=/tmp/m360-payload-real.sql
echo "▶ Generando una copia de verdad para la prueba de restauración"
node "$ROOT/tests/sql/61_payload_real.mjs" "$PAYLOAD"

echo "▶ Ejecutando pruebas"
FAILED=0
for t in "$ROOT"/tests/sql/[1-9]*.sql; do
  $P -d m360 -v payload_real="$PAYLOAD" -f "$t" 2>&1 | grep -E 'FALLO|ERROR|^==' || true
  # shellcheck disable=SC2181
  if $P -d m360 -At -c "select 1" >/dev/null 2>&1; then :; fi
done

$P -d m360 -At -F ' ' -c "
  select rpad(area, 14), count(*) filter (where ok) || '/' || count(*)
    from test.results group by area order by min(n)" | sed 's/^/   /'

TOTAL=$($P -d m360 -At -c "select count(*) from test.results")
OKS=$($P -d m360 -At -c "select count(*) filter (where ok) from test.results")
echo "   ──────────────────────────────"
echo "   TOTAL: $OKS de $TOTAL pruebas correctas"
[ "$OKS" = "$TOTAL" ] || FAILED=1
exit $FAILED
