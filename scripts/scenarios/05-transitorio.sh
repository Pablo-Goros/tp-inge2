#!/usr/bin/env bash
# 05 · Falla transitoria: el worker falla 2 veces seguidas (FAULT_INJECTION=transient:2),
# los mensajes pasan por la cola de espera y el lote termina igual, sin ir a la DLQ.
# Criterio de éxito 5 de docs/project.md.
source "$(dirname "$0")/../lib.sh"
scenario_begin 05-transitorio
require_stack

TOKEN=$(login "$OPERATOR_EMAIL" "$DEMO_PASSWORD")
require_worker
wait_all_idle 120
dlq_before=$(queue_len cert.issue.dlq)

step "1. Recrear el worker con FAULT_INJECTION=transient:2"
set_worker_fault "transient:2"

step "2. Subir lote-20.csv"
BATCH=$(post_batch "$TOKEN" "$(unique_course 05)" 2026-10-30 sample-data/lote-20.csv "$(new_key)")

step "3. El lote termina completo pese a las fallas"
assert_eq COMPLETED "$(wait_batch "$TOKEN" "$BATCH" 240)" "estado del lote"
assert_eq 20 "$(count_status "$BATCH" ISSUED)" "solicitudes ISSUED"
assert_eq 0  "$(count_status "$BATCH" FAILED)" "solicitudes FAILED"
max_attempts=$(sql "SELECT max(attempts) FROM cert_requests WHERE batch_id = '$BATCH'")
[[ "$max_attempts" -ge 2 ]] || fail "ningún certificado se reintentó (máx. intentos = $max_attempts): la falla no se inyectó"
echo "   ok    hubo reintentos (máx. intentos = $max_attempts)"
assert_eq "$dlq_before" "$(queue_len cert.issue.dlq)" "mensajes en la DLQ (ninguno nuevo)"
echo "   solicitudes reintentadas:"
sql "SELECT u.email, r.attempts FROM cert_requests r JOIN users u ON u.id = r.student_id
     WHERE r.batch_id = '$BATCH' AND r.attempts > 1 ORDER BY u.email" | sed 's/|/ -> intentos: /; s/^/     /'
