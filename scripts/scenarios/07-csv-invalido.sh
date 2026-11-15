#!/usr/bin/env bash
# 07 · CSV inválido: se rechaza entero (400), dice qué filas corregir y no crea nada.
# Criterio de éxito 10 de docs/project.md.
source "$(dirname "$0")/../lib.sh"
scenario_begin 07-csv-invalido
require_stack

TOKEN=$(login "$OPERATOR_EMAIL" "$DEMO_PASSWORD")
batches_before=$(sql "SELECT count(*) FROM batches")
requests_before=$(sql "SELECT count(*) FROM cert_requests")
outbox_before=$(sql "SELECT count(*) FROM outbox")

step "Subir sample-data/con-error.csv (email sin cuenta + email repetido + una fila válida)"
post_batch_raw "$TOKEN" "$(unique_course 07)" 2026-10-30 sample-data/con-error.csv "$(new_key)"
jq . <<<"$HTTP_BODY"

assert_eq 400 "$HTTP_CODE" "HTTP"
assert_eq VALIDATION_ERROR "$(jq -r .error.code <<<"$HTTP_BODY")" "error.code"
assert_eq NO_ACCOUNT \
  "$(jq -r '.error.details[] | select(.email == "nadie@demo.test") | .reason' <<<"$HTTP_BODY")" \
  "motivo de nadie@demo.test"
assert_eq DUPLICATE_IN_FILE \
  "$(jq -r '[.error.details[] | select(.email == "alumno22@demo.test") | .reason] | unique | join(",")' <<<"$HTTP_BODY")" \
  "motivo de alumno22@demo.test"

step "Nada se creó (todo o nada)"
assert_eq "$batches_before"  "$(sql "SELECT count(*) FROM batches")"       "lotes"
assert_eq "$requests_before" "$(sql "SELECT count(*) FROM cert_requests")" "solicitudes"
assert_eq "$outbox_before"   "$(sql "SELECT count(*) FROM outbox")"        "filas de outbox"
