#!/usr/bin/env bash
# Funciones comunes de los escenarios de falla (frente D).
# Uso, desde un escenario:  source "$(dirname "$0")/../lib.sh"
#
# Requisitos en el host: docker compose, curl, jq. Se corre en la máquina donde
# está levantado el compose (local o la VM), porque los escenarios detienen servicios.
#
# Variables opcionales: BASE_URL (por defecto http://localhost:8080). Si existe .env,
# se leen de ahí DEMO_PASSWORD, POSTGRES_*, RABBITMQ_*.
#
# Códigos de salida de un escenario: 0 = PASS, 77 = PENDIENTE (falta una pieza
# de otro frente), cualquier otro = FAIL.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"   # docker compose necesita la carpeta del compose.yaml

if [[ -f .env ]]; then set -a; . ./.env; set +a; fi

BASE_URL="${BASE_URL:-http://localhost:8080}"
API="$BASE_URL/api"
DEMO_PASSWORD="${DEMO_PASSWORD:-demo1234}"
OPERATOR_EMAIL="operador@demo.test"
EXIT_PENDING=77
_PENDING=0

# ---------- evidencia y resultado ----------

# log_evidence <archivo>: copia toda la salida (stdout y stderr) a evidence/<archivo>.
log_evidence() {
  mkdir -p evidence
  local f="evidence/$1"
  : > "$f"
  exec > >(tee -a "$f") 2>&1
  echo "# $(date -u +%Y-%m-%dT%H:%M:%SZ) · commit $(git rev-parse --short HEAD 2>/dev/null || echo '?') · $BASE_URL"
}

# scenario_begin <nombre>: abre el log de evidencia y registra el resultado al salir.
scenario_begin() {
  SCENARIO="$1"
  log_evidence "$1.log"
  echo "== Escenario $1"
  trap '_scenario_end $?' EXIT
}

_scenario_end() {
  if [[ "$_PENDING" == 1 ]]; then echo "== PENDIENTE $SCENARIO"
  elif [[ "$1" == 0 ]]; then echo "== PASS $SCENARIO"
  else echo "== FAIL $SCENARIO (código $1)"
  fi
}

step() { echo "-- $*"; }

# assert_eq <esperado> <obtenido> <mensaje>: corta el escenario con FAIL si difieren.
assert_eq() {
  if [[ "$1" == "$2" ]]; then
    echo "   ok    $3 = $2"
  else
    echo "   FAIL  $3: esperado '$1', obtenido '$2'"
    exit 1
  fi
}

fail() { echo "   FAIL  $*"; exit 1; }

# pending <motivo>: corta el escenario como PENDIENTE (no como PASS ni FAIL).
pending() { echo "   PENDIENTE: $*"; _PENDING=1; exit "$EXIT_PENDING"; }

# ---------- utilidades ----------

new_key() { uuidgen 2>/dev/null | tr 'A-Z' 'a-z' || cat /proc/sys/kernel/random/uuid; }

# Nombre de curso único por corrida: así el escenario se puede repetir sin chocar con
# la regla "mismo alumno + curso + fecha ya pedido".
unique_course() { echo "Escenario $1 $(date +%s)-$RANDOM"; }

sql() {
  docker compose exec -T postgres \
    psql -U "${POSTGRES_USER:-certs}" -d "${POSTGRES_DB:-certs}" -tAqc "$1"
}

container_id() { docker compose ps -aq "$1"; }

# ---------- HTTP ----------

# http <MÉTODO> <ruta bajo /api> [args de curl...]: deja HTTP_CODE y HTTP_BODY.
# Llamarla directo (no dentro de $(...)) para conservar esas variables.
http() {
  local method="$1" path="$2" out
  shift 2
  out=$(curl -sS -X "$method" "$API$path" -w $'\n%{http_code}' "$@")
  HTTP_CODE="${out##*$'\n'}"
  HTTP_BODY="${out%$'\n'*}"
}

# require_stack: falla con un mensaje claro si la API no responde.
require_stack() {
  http GET /batches || true
  [[ "${HTTP_CODE:-}" == 401 ]] || fail "la API no responde en $API (¿corriste 'docker compose up -d'?)"
}

# login <email> <password> -> token
login() {
  http POST /auth/login -H 'Content-Type: application/json' \
    -d "$(jq -nc --arg e "$1" --arg p "$2" '{email:$e,password:$p}')"
  [[ "$HTTP_CODE" == 200 ]] || { echo "   login $1 falló: HTTP $HTTP_CODE $HTTP_BODY" >&2; return 1; }
  jq -r .access_token <<<"$HTTP_BODY"
}

# post_batch_raw <token> <curso> <fecha> <csv> <idempotency-key>: deja HTTP_CODE/HTTP_BODY.
post_batch_raw() {
  http POST /batches -H "Authorization: Bearer $1" -H "Idempotency-Key: $5" \
    --form-string "course_name=$2" --form-string "completion_date=$3" \
    -F "file=@$4;type=text/csv"
}

# post_batch <token> <curso> <fecha> <csv> <key> -> batch_id (acepta 201 nuevo o 200 repetido)
post_batch() {
  post_batch_raw "$@"
  [[ "$HTTP_CODE" == 201 || "$HTTP_CODE" == 200 ]] \
    || { echo "   post_batch: HTTP $HTTP_CODE $HTTP_BODY" >&2; return 1; }
  jq -r .batch_id <<<"$HTTP_BODY"
}

# wait_batch <token> <batch_id> <timeout_s> -> estado final (IN_PROGRESS si venció el plazo)
wait_batch() {
  local deadline=$((SECONDS + $3)) status
  while :; do
    http GET "/batches/$2" -H "Authorization: Bearer $1"
    status=$(jq -r .status <<<"$HTTP_BODY")
    if [[ "$status" != IN_PROGRESS || $SECONDS -ge $deadline ]]; then break; fi
    sleep 2
  done
  echo "$status"
}

# ---------- base de datos ----------

count_certs()    { sql "SELECT count(*) FROM certificates c JOIN cert_requests r ON r.id = c.request_id WHERE r.batch_id = '$1'"; }
count_registry() { sql "SELECT count(*) FROM registry g JOIN cert_requests r ON r.id = g.cert_id WHERE r.batch_id = '$1'"; }

# ---------- RabbitMQ (vía la API de la consola, solo en 127.0.0.1) ----------

_rabbit_api() {
  curl -sS -u "${RABBITMQ_USER:-certs}:${RABBITMQ_PASSWORD:-certs}" \
    -H 'content-type: application/json' "$@"
}

# publish_issue <request_id>: reenvía a mano el mensaje de esa solicitud a cert.issue.
# Imprime "true" si RabbitMQ lo ruteó a una cola.
publish_issue() {
  local corr payload
  corr=$(sql "SELECT correlation_id FROM outbox WHERE request_id = '$1'")
  payload=$(jq -nc --arg r "$1" --arg c "$corr" '{request_id:$r, correlation_id:$c}')
  _rabbit_api -X POST "http://127.0.0.1:15672/api/exchanges/%2F/certs/publish" \
    -d "$(jq -nc --arg p "$payload" \
      '{properties:{delivery_mode:2, content_type:"application/json"}, routing_key:"issue", payload:$p, payload_encoding:"string"}')" \
    | jq -r .routed
}

# wait_queue_empty <cola> <timeout_s>: espera a que no queden mensajes listos ni sin ACK.
wait_queue_empty() {
  local deadline=$((SECONDS + $2)) n
  while :; do
    n=$(_rabbit_api "http://127.0.0.1:15672/api/queues/%2F/$1" | jq '.messages_ready + .messages_unacknowledged')
    [[ "$n" == 0 ]] && return 0
    [[ $SECONDS -ge $deadline ]] && fail "la cola $1 sigue con $n mensajes tras $2 s"
    sleep 1
  done
}

# ---------- piezas de otros frentes ----------

# require_worker: marca el escenario PENDIENTE mientras el worker sea el placeholder.
require_worker() {
  local id
  id=$(container_id worker)
  [[ -n "$id" ]] || fail "no hay contenedor worker"
  if docker inspect -f '{{join .Config.Entrypoint " "}}' "$id" | grep -q placeholder; then
    pending "requiere el worker real (frente C); hoy compose.yaml usa un placeholder"
  fi
}
