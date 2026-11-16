#!/usr/bin/env bash
# Corre todos los escenarios en orden y deja un resumen en evidence/RESUMEN.txt.
# Uso (con el proyecto levantado):  scripts/run-all.sh [filtro]
#   scripts/run-all.sh        -> todos
#   scripts/run-all.sh 0[1-4] -> solo 01 a 04
# Sale con código 1 si algún escenario dio FAIL (los PENDIENTE no cuentan como falla).
set -uo pipefail
cd "$(dirname "$0")/.."

filter="${1:-}"
mkdir -p evidence
summary="evidence/RESUMEN.txt"
{
  echo "# $(date -u +%Y-%m-%dT%H:%M:%SZ) · commit $(git rev-parse --short HEAD 2>/dev/null || echo '?') · ${BASE_URL:-http://localhost:8080}"
  printf '%-26s %-10s %s\n' ESCENARIO RESULTADO DURACION
} > "$summary"

fails=0
for script in scripts/scenarios/${filter}*.sh; do
  [[ -e "$script" ]] || { echo "no hay escenarios que coincidan con '$filter'"; exit 2; }
  name=$(basename "$script" .sh)
  printf '%-26s ' "$name"
  start=$SECONDS
  "$script" > /dev/null 2>&1
  rc=$?
  case $rc in
    0)  result=PASS ;;
    77) result=PENDIENTE ;;
    *)  result=FAIL; fails=$((fails + 1)) ;;
  esac
  line=$(printf '%-10s %ss' "$result" $((SECONDS - start)))
  echo "$line"
  printf '%-26s %s\n' "$name" "$line" >> "$summary"
done

echo
echo "Detalle de cada uno en evidence/<escenario>.log · resumen en $summary"
[[ $fails -eq 0 ]]
