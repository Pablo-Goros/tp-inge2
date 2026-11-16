#!/usr/bin/env bash
# 08 · Verificación: original VALID, alterado ALTERED, inexistente NOT_FOUND, y con el
# registro caído "no se pudo verificar" (503), nunca "inválido".
# Criterios de éxito 6 y 11 de docs/project.md.
source "$(dirname "$0")/../lib.sh"
scenario_begin 08-verificacion
require_stack

# Servicio que sostiene el registro: postgres (registro simulado) o anvil (REGISTRY_BACKEND=chain).
REGISTRY_SERVICE="${REGISTRY_SERVICE:-postgres}"

TOKEN=$(login "$OPERATOR_EMAIL" "$DEMO_PASSWORD")
require_worker
require_verify

step "1. Emitir un certificado y descargarlo"
BATCH=$(post_batch "$TOKEN" "$(unique_course 08)" 2026-10-30 "$(csv_of alumno01@demo.test)" "$(new_key)")
assert_eq COMPLETED "$(wait_batch "$TOKEN" "$BATCH" 120)" "estado del lote"
CERT=$(sql "SELECT id FROM cert_requests WHERE batch_id = '$BATCH'")
PDF="$WORKDIR/original.pdf"
assert_eq 200 "$(download_pdf "$TOKEN" "$CERT" "$PDF")" "HTTP de la descarga"

step "2. Consulta pública por id (lo que abre el QR)"
http GET "/verify/$CERT"
jq . <<<"$HTTP_BODY"
assert_eq 200 "$HTTP_CODE" "HTTP"
assert_eq REGISTERED "$(jq -r .status <<<"$HTTP_BODY")" "status"
assert_eq "$CERT" "$(jq -r .certificate_id <<<"$HTTP_BODY")" "certificate_id"
assert_eq 0 "$(grep -c '@' <<<"$HTTP_BODY" || true)" "emails en la respuesta pública"

step "3. Subir el PDF original"
verify_file "$CERT" "$PDF"
assert_eq VALID "$(jq -r .result <<<"$HTTP_BODY")" "resultado"

step "4. Subir el mismo PDF con un solo byte cambiado"
ALT="$WORKDIR/alterado.pdf"
cp "$PDF" "$ALT"
size=$(wc -c < "$ALT")
printf 'X' | dd of="$ALT" bs=1 seek=$((size / 2)) conv=notrunc 2>/dev/null
cmp -s "$PDF" "$ALT" && fail "el archivo alterado quedó igual al original"
verify_file "$CERT" "$ALT"
assert_eq ALTERED "$(jq -r .result <<<"$HTTP_BODY")" "resultado"

step "5. Identificador inexistente"
GHOST=$(new_key)
http GET "/verify/$GHOST"
assert_eq 404 "$HTTP_CODE" "HTTP de la consulta"
assert_eq NOT_FOUND "$(jq -r '.status // .error.code' <<<"$HTTP_BODY")" "status"
verify_file "$GHOST" "$PDF"
assert_eq NOT_FOUND "$(jq -r .result <<<"$HTTP_BODY")" "resultado al subir el PDF con otro id"

step "6. Registro no disponible ($REGISTRY_SERVICE detenido): 503, no 'inválido'"
stop_service "$REGISTRY_SERVICE"
http GET "/verify/$CERT"
assert_eq 503 "$HTTP_CODE" "HTTP de la consulta"
assert_eq UNAVAILABLE "$(jq -r .error.code <<<"$HTTP_BODY")" "error.code"
verify_file "$CERT" "$PDF"
assert_eq 503 "$HTTP_CODE" "HTTP al subir el PDF"

step "7. Al volver el registro, el original verifica de nuevo"
start_service "$REGISTRY_SERVICE"
deadline=$((SECONDS + 30))
until verify_file "$CERT" "$PDF"; [[ "$HTTP_CODE" == 200 ]]; do
  [[ $SECONDS -ge $deadline ]] && fail "la API no se recuperó tras 30 s (HTTP $HTTP_CODE)"
  sleep 1
done
assert_eq VALID "$(jq -r .result <<<"$HTTP_BODY")" "resultado"
