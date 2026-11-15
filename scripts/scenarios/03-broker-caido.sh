#!/usr/bin/env bash
# 03 · RabbitMQ caído: el lote se acepta igual (queda guardado en el outbox) y se
# publica cuando el broker vuelve. Criterio de éxito 7 de docs/project.md.
source "$(dirname "$0")/../lib.sh"
scenario_begin 03-broker-caido
require_stack

TOKEN=$(login "$OPERATOR_EMAIL" "$DEMO_PASSWORD")
outbox_pending() {
  sql "SELECT count(*) FROM outbox o JOIN cert_requests r ON r.id = o.request_id
       WHERE r.batch_id = '$1' AND o.published_at IS NULL"
}

step "1. Detener RabbitMQ"
stop_service rabbitmq

step "2. Subir lote-20.csv con el broker caído"
post_batch_raw "$TOKEN" "$(unique_course 03)" 2026-10-30 sample-data/lote-20.csv "$(new_key)"
assert_eq 201 "$HTTP_CODE" "HTTP (la API acepta sin depender del broker)"
BATCH=$(jq -r .batch_id <<<"$HTTP_BODY")

step "3. Las 20 solicitudes quedan guardadas esperando en el outbox"
sleep 5   # tiempo de sobra para que el publicador lo intente y no pueda
assert_eq 20 "$(outbox_pending "$BATCH")" "filas de outbox sin publicar"

step "4. Volver a prender RabbitMQ"
start_service rabbitmq
t0=$SECONDS

step "5. El publicador se reconecta solo y publica las 20"
deadline=$((SECONDS + 90))
while [[ "$(outbox_pending "$BATCH")" != 0 ]]; do
  [[ $SECONDS -ge $deadline ]] && fail "quedan $(outbox_pending "$BATCH") filas sin publicar tras 90 s"
  sleep 1
done
assert_eq 0 "$(outbox_pending "$BATCH")" "filas de outbox sin publicar"
echo "   (publicadas $((SECONDS - t0)) s después de que el broker volvió)"

step "6. El lote termina de emitirse"
require_worker
assert_eq COMPLETED "$(wait_batch "$TOKEN" "$BATCH" 180)" "estado del lote"
assert_eq 20 "$(count_certs "$BATCH")"    "certificados del lote"
assert_eq 20 "$(count_registry "$BATCH")" "entradas de registry del lote"
