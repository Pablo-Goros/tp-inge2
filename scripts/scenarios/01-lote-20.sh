#!/usr/bin/env bash
# 01 · Recorrido feliz: un lote de 20 termina con 20 certificados distintos, todos
# registrados, y el PDF descargado verifica VALID. Criterio de éxito 2 de docs/project.md.
# Registra tiempos de aceptación y de finalización para el white paper.
source "$(dirname "$0")/../lib.sh"
scenario_begin 01-lote-20
require_stack

TOKEN=$(login "$OPERATOR_EMAIL" "$DEMO_PASSWORD")

step "1. Subir lote-20.csv"
t0=$(now_ms)
post_batch_raw "$TOKEN" "$(unique_course 01)" 2026-10-30 sample-data/lote-20.csv "$(new_key)"
t_accept=$(( $(now_ms) - t0 ))
assert_eq 201 "$HTTP_CODE" "HTTP"
BATCH=$(jq -r .batch_id <<<"$HTTP_BODY")
echo "   (aceptado en ${t_accept} ms, sin esperar la emisión)"

require_worker

step "2. Esperar a que el lote termine"
assert_eq COMPLETED "$(wait_batch "$TOKEN" "$BATCH" 180)" "estado del lote"
echo "   (terminado $(( $(now_ms) - t0 )) ms después del POST; sondeo cada 2 s)"

step "3. 20 certificados distintos, todos registrados con la misma huella"
assert_eq 20 "$(count_status "$BATCH" ISSUED)" "solicitudes ISSUED"
assert_eq 20 "$(count_certs "$BATCH")"         "certificados"
assert_eq 20 "$(distinct_hashes "$BATCH")"     "huellas distintas"
assert_eq 20 "$(count_registry "$BATCH")"      "entradas de registry"
assert_eq 0 "$(sql "SELECT count(*) FROM certificates c
                    JOIN registry g ON g.cert_id = c.request_id
                    JOIN cert_requests r ON r.id = c.request_id
                    WHERE r.batch_id = '$BATCH' AND g.sha256 <> c.sha256")" \
  "huellas que difieren entre certificates y registry"

step "4. Descargar un PDF y verificarlo"
CERT=$(sql "SELECT id FROM cert_requests WHERE batch_id = '$BATCH' ORDER BY id LIMIT 1")
PDF="$WORKDIR/cert.pdf"
assert_eq 200 "$(download_pdf "$TOKEN" "$CERT" "$PDF")" "HTTP de la descarga"
assert_eq "%PDF" "$(head -c 4 "$PDF")" "el archivo es un PDF"
require_verify
verify_file "$CERT" "$PDF"
assert_eq 200 "$HTTP_CODE" "HTTP de la verificación"
assert_eq VALID "$(jq -r .result <<<"$HTTP_BODY")" "resultado"
