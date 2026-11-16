#!/usr/bin/env bash
# 04 · Lo mismo dos veces no duplica nada.
#   Parte A (API): el mismo POST con la misma Idempotency-Key devuelve el lote original.
#   Parte B (worker): reenviar a mano un mensaje ya procesado no crea otro certificado ni
#   otro registro. Criterio de éxito 4 de docs/project.md.
source "$(dirname "$0")/../lib.sh"
scenario_begin 04-mensaje-repetido
require_stack

TOKEN=$(login "$OPERATOR_EMAIL" "$DEMO_PASSWORD")
COURSE=$(unique_course 04)
KEY=$(new_key)
batches_before=$(sql "SELECT count(*) FROM batches")

step "A1. Primer POST de lote-20.csv"
post_batch_raw "$TOKEN" "$COURSE" 2026-10-30 sample-data/lote-20.csv "$KEY"
assert_eq 201 "$HTTP_CODE" "HTTP del primer POST"
BATCH=$(jq -r .batch_id <<<"$HTTP_BODY")

step "A2. Mismo POST, misma clave (simula un reintento por corte de conexión)"
post_batch_raw "$TOKEN" "$COURSE" 2026-10-30 sample-data/lote-20.csv "$KEY"
assert_eq 200 "$HTTP_CODE" "HTTP del POST repetido"
assert_eq "$BATCH" "$(jq -r .batch_id <<<"$HTTP_BODY")" "batch_id devuelto"
assert_eq $((batches_before + 1)) "$(sql "SELECT count(*) FROM batches")" "lotes en la base"
assert_eq 20 "$(sql "SELECT count(*) FROM cert_requests WHERE batch_id = '$BATCH'")" "solicitudes del lote"
assert_eq 20 "$(sql "SELECT count(*) FROM outbox o JOIN cert_requests r ON r.id = o.request_id WHERE r.batch_id = '$BATCH'")" "filas de outbox del lote"

step "A3. Misma clave con otro contenido -> conflicto"
post_batch_raw "$TOKEN" "$COURSE (otro)" 2026-10-30 sample-data/lote-20.csv "$KEY"
assert_eq 409 "$HTTP_CODE" "HTTP"
assert_eq IDEMPOTENCY_CONFLICT "$(jq -r .error.code <<<"$HTTP_BODY")" "error.code"

step "B. Reenviar a mano un mensaje ya emitido"
require_worker
assert_eq COMPLETED "$(wait_batch "$TOKEN" "$BATCH" 180)" "estado del lote"
REQ=$(sql "SELECT id FROM cert_requests WHERE batch_id = '$BATCH' AND status = 'ISSUED' ORDER BY id LIMIT 1")
snapshot() {
  sql "SELECT r.status, r.attempts, c.sha256, c.issued_at, g.sha256, g.registered_at
       FROM cert_requests r JOIN certificates c ON c.request_id = r.id JOIN registry g ON g.cert_id = r.id
       WHERE r.id = '$REQ'"
}
before=$(snapshot)
echo "   solicitud $REQ: $before"
assert_eq true "$(publish_issue "$REQ")" "mensaje ruteado a cert.issue"
wait_queue_empty cert.issue 60
assert_eq "$before" "$(snapshot)" "estado, intentos, PDF y registro sin cambios"
assert_eq 20 "$(count_certs "$BATCH")"    "certificados del lote"
assert_eq 20 "$(count_registry "$BATCH")" "entradas de registry del lote"
