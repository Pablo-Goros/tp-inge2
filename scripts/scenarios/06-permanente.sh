#!/usr/bin/env bash
# 06 · Falla permanente en un alumno (FAULT_INJECTION=permanent:alumno03@demo.test):
# ese certificado queda FAILED con su error y va a la DLQ; los otros 19 se emiten.
# Criterio de éxito 5 de docs/project.md.
source "$(dirname "$0")/../lib.sh"
scenario_begin 06-permanente
require_stack

FAILING=alumno03@demo.test
TOKEN=$(login "$OPERATOR_EMAIL" "$DEMO_PASSWORD")
require_worker
wait_all_idle 120
dlq_before=$(queue_len cert.issue.dlq)

step "1. Recrear el worker con FAULT_INJECTION=permanent:$FAILING"
set_worker_fault "permanent:$FAILING"

step "2. Subir lote-20.csv"
BATCH=$(post_batch "$TOKEN" "$(unique_course 06)" 2026-10-30 sample-data/lote-20.csv "$(new_key)")

step "3. El lote termina con un error visible y el resto emitido"
assert_eq COMPLETED_WITH_ERRORS "$(wait_batch "$TOKEN" "$BATCH" 240)" "estado del lote"
assert_eq 19 "$(count_status "$BATCH" ISSUED)" "solicitudes ISSUED"
assert_eq 1  "$(count_status "$BATCH" FAILED)" "solicitudes FAILED"
# C persists definitive bytes before registering. The failed request retains
# its prepared PDF for diagnosis, but is not downloadable or registered.
assert_eq 20 "$(count_certs "$BATCH")"         "PDF preparados (incluido el fallido)"
assert_eq 19 "$(count_registry "$BATCH")"      "certificados registrados"
assert_eq "$FAILING" "$(sql "SELECT u.email FROM cert_requests r JOIN users u ON u.id = r.student_id
                             WHERE r.batch_id = '$BATCH' AND r.status = 'FAILED'")" "alumno que falló"
last_error=$(sql "SELECT coalesce(last_error, '') FROM cert_requests WHERE batch_id = '$BATCH' AND status = 'FAILED'")
[[ -n "$last_error" ]] || fail "la solicitud FAILED no tiene last_error"
echo "   ok    last_error = $last_error"
FAILED_CERT=$(sql "SELECT id FROM cert_requests WHERE batch_id='$BATCH' AND status='FAILED'")
assert_eq 404 "$(download_pdf "$TOKEN" "$FAILED_CERT" "$WORKDIR/failed.pdf")" "PDF fallido no descargable"

step "4. El mensaje quedó aislado en la cola de fallidos"
assert_eq $((dlq_before + 1)) "$(queue_len cert.issue.dlq)" "mensajes en cert.issue.dlq"

step "5. El operador ve el error en el detalle del lote"
http GET "/batches/$BATCH" -H "Authorization: Bearer $TOKEN"
jq -c --arg e "$FAILING" '.items[] | select(.student_email == $e)' <<<"$HTTP_BODY" | sed 's/^/     /'
assert_eq FAILED "$(jq -r --arg e "$FAILING" '.items[] | select(.student_email == $e) | .status' <<<"$HTTP_BODY")" "estado en la API"
