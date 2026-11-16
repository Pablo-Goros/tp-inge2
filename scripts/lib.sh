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
_RESTORE=()          # servicios a volver a prender al salir
_RESTORE_FAULT=0     # 1 = recrear el worker sin FAULT_INJECTION al salir
WORKDIR="$(mktemp -d)"   # archivos temporales del escenario

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
  local s
  for s in "${_RESTORE[@]+"${_RESTORE[@]}"}"; do   # vuelve a prender lo que el escenario apagó
    docker compose start "$s" >/dev/null 2>&1 || true
  done
  if [[ "$_RESTORE_FAULT" == 1 ]]; then
    FAULT_INJECTION= docker compose up -d --no-deps worker >/dev/null 2>&1 || true
  fi
  rm -rf "$WORKDIR"
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

# csv_of <email>...: arma un CSV temporal con esos emails e imprime su ruta.
csv_of() {
  local f="$WORKDIR/lote-$RANDOM.csv" e
  echo email > "$f"
  for e in "$@"; do echo "$e" >> "$f"; done
  echo "$f"
}

# now_ms: milisegundos desde epoch (precisión de segundos si la shell no tiene EPOCHREALTIME).
now_ms() {
  if [[ -n "${EPOCHREALTIME:-}" ]]; then local t="${EPOCHREALTIME/,/.}"; echo $(( ${t%.*} * 1000 + 10#${t#*.} / 1000 ))
  else echo $(( $(date +%s) * 1000 )); fi
}

sql() {
  docker compose exec -T postgres \
    psql -U "${POSTGRES_USER:-certs}" -d "${POSTGRES_DB:-certs}" -tAqc "$1"
}

container_id() { docker compose ps -aq "$1"; }

# ---------- detener y recuperar servicios ----------

# stop_service <servicio> [kill]: lo detiene (con `kill`, de forma abrupta, como una caída),
# comprueba que de verdad quedó detenido y lo anota para volver a prenderlo al salir.
stop_service() {
  _RESTORE+=("$1")
  if [[ "${2:-}" == kill ]]; then docker compose kill "$1" >/dev/null 2>&1
  else docker compose stop "$1" >/dev/null 2>&1; fi
  assert_eq false "$(docker inspect -f '{{.State.Running}}' "$(container_id "$1")")" "$1 corriendo"
}

# start_service <servicio> [timeout_s]: lo prende y espera a que esté sano (o corriendo, si
# no tiene healthcheck).
start_service() {
  docker compose start "$1" >/dev/null 2>&1
  wait_up "$1" "${2:-90}"
}

wait_up() {
  local deadline=$((SECONDS + $2)) st
  while :; do
    st=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$(container_id "$1")")
    [[ "$st" == healthy || "$st" == running ]] && break
    [[ $SECONDS -ge $deadline ]] && fail "$1 no quedó sano tras $2 s (estado: $st)"
    sleep 1
  done
  echo "   ok    $1 arriba ($st)"
}

# set_worker_fault <valor>: recrea el worker con FAULT_INJECTION=<valor> (contracts §8).
# Al salir, el escenario lo vuelve a dejar sin fallas.
set_worker_fault() {
  _RESTORE_FAULT=1
  FAULT_INJECTION="$1" docker compose up -d --no-deps worker >/dev/null 2>&1
  assert_eq "FAULT_INJECTION=$1" \
    "$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$(container_id worker)" | grep '^FAULT_INJECTION=')" \
    "variable del worker"
  wait_up worker 60
}

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

# download_pdf <token> <cert_id> <archivo> -> código HTTP
download_pdf() {
  curl -sS -o "$3" -w '%{http_code}' "$API/certificates/$2/pdf" -H "Authorization: Bearer $1"
}

# verify_file <cert_id> <archivo>: POST público de verificación; deja HTTP_CODE/HTTP_BODY.
verify_file() { http POST "/verify/$1/file" -F "file=@$2;type=application/pdf"; }

# require_verify: PENDIENTE mientras la verificación responda 501 (no implementada).
require_verify() {
  http GET "/verify/$(new_key)"
  [[ "$HTTP_CODE" != 501 ]] || pending "la verificación pública todavía responde 501 (frentes B y C)"
}

# ---------- base de datos ----------

count_certs()    { sql "SELECT count(*) FROM certificates c JOIN cert_requests r ON r.id = c.request_id WHERE r.batch_id = '$1'"; }
count_registry() { sql "SELECT count(*) FROM registry g JOIN cert_requests r ON r.id = g.cert_id WHERE r.batch_id = '$1'"; }
count_status()   { sql "SELECT count(*) FROM cert_requests WHERE batch_id = '$1' AND status = '$2'"; }
distinct_hashes(){ sql "SELECT count(DISTINCT c.sha256) FROM certificates c JOIN cert_requests r ON r.id = c.request_id WHERE r.batch_id = '$1'"; }

# wait_issued_at_least <batch_id> <n> <timeout_s>: sondeo rápido hasta que haya n ISSUED.
wait_issued_at_least() {
  local deadline=$((SECONDS + $3))
  until [[ "$(count_status "$1" ISSUED)" -ge "$2" ]]; do
    [[ $SECONDS -ge $deadline ]] && fail "no hubo $2 certificados emitidos tras $3 s"
    sleep 0.2
  done
}

# wait_all_idle <timeout_s>: espera a que no quede ninguna solicitud PENDING/PROCESSING en
# ningún lote, para que mensajes viejos no se mezclen con el escenario.
wait_all_idle() {
  local deadline=$((SECONDS + $1)) n
  while :; do
    n=$(sql "SELECT count(*) FROM cert_requests WHERE status IN ('PENDING', 'PROCESSING')")
    [[ "$n" == 0 ]] && return 0
    [[ $SECONDS -ge $deadline ]] && fail "quedan $n solicitudes sin terminar de corridas anteriores tras $1 s"
    sleep 1
  done
}

# ---------- RabbitMQ ----------

# queue_len <cola>: mensajes listos + sin ACK (exacto, vía rabbitmqctl).
queue_len() {
  docker compose exec -T rabbitmq rabbitmqctl list_queues name messages -q \
    | awk -v q="$1" '$1 == q { print $2 }'
}

# publish_issue <request_id>: reenvía a mano el mensaje de esa solicitud a cert.issue
# (vía la API de la consola, solo en 127.0.0.1). Imprime "true" si se ruteó a una cola.
publish_issue() {
  local corr payload
  corr=$(sql "SELECT correlation_id FROM outbox WHERE request_id = '$1'")
  payload=$(jq -nc --arg r "$1" --arg c "$corr" '{request_id:$r, correlation_id:$c}')
  curl -sS -u "${RABBITMQ_USER:-certs}:${RABBITMQ_PASSWORD:-certs}" -H 'content-type: application/json' \
    -X POST "http://127.0.0.1:15672/api/exchanges/%2F/certs/publish" \
    -d "$(jq -nc --arg p "$payload" \
      '{properties:{delivery_mode:2, content_type:"application/json"}, routing_key:"issue", payload:$p, payload_encoding:"string"}')" \
    | jq -r .routed
}

# wait_queue_empty <cola> <timeout_s>
wait_queue_empty() {
  local deadline=$((SECONDS + $2)) n
  while :; do
    n=$(queue_len "$1")
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
