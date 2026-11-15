#!/usr/bin/env bash
# 02 · El worker se cae a mitad del lote (kill abrupto, como un corte) y al volver
# termina sin perder ni duplicar certificados. Criterio de éxito 3 de docs/project.md.
source "$(dirname "$0")/../lib.sh"
scenario_begin 02-worker-caido
require_stack

TOKEN=$(login "$OPERATOR_EMAIL" "$DEMO_PASSWORD")
require_worker
wait_all_idle 120

step "1. Subir lote-20.csv"
BATCH=$(post_batch "$TOKEN" "$(unique_course 02)" 2026-10-30 sample-data/lote-20.csv "$(new_key)")
echo "   lote $BATCH"

step "2. Apenas se emite el primero, matar el worker"
wait_issued_at_least "$BATCH" 1 60
stop_service worker kill
at_crash=$(count_status "$BATCH" ISSUED)
echo "   emitidos al momento de la caída: $at_crash / 20"
[[ "$at_crash" -lt 20 ]] || fail "el lote terminó antes de matar el worker; el escenario no probaría nada"

step "3. Con el worker caído, el lote no avanza (y nada se pierde: los mensajes esperan en RabbitMQ)"
sleep 5
assert_eq "$at_crash" "$(count_status "$BATCH" ISSUED)" "emitidos con el worker caído"
echo "   mensajes esperando en cert.issue: $(queue_len cert.issue)"

step "4. Volver a prender el worker"
start_service worker

step "5. El lote termina sin pérdidas ni duplicados"
assert_eq COMPLETED "$(wait_batch "$TOKEN" "$BATCH" 180)" "estado del lote"
assert_eq 20 "$(count_status "$BATCH" ISSUED)"     "solicitudes ISSUED"
assert_eq 0  "$(count_status "$BATCH" PROCESSING)" "solicitudes trabadas en PROCESSING"
assert_eq 0  "$(count_status "$BATCH" FAILED)"     "solicitudes FAILED"
assert_eq 20 "$(count_certs "$BATCH")"             "certificados"
assert_eq 20 "$(distinct_hashes "$BATCH")"         "huellas distintas"
assert_eq 20 "$(count_registry "$BATCH")"          "entradas de registry"
echo "   intentos por solicitud (los >1 fueron reentregados tras la caída):"
sql "SELECT attempts, count(*) FROM cert_requests WHERE batch_id = '$BATCH' GROUP BY attempts ORDER BY attempts" \
  | sed 's/|/ intento(s): /; s/^/     /'
