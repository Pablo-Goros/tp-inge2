#!/usr/bin/env bash
# 09 · Permisos del alumno: solo ve y descarga lo propio, no hace acciones de operador,
# y la consulta pública no expone datos de la cuenta. Criterios 9 y 11 de docs/project.md.
source "$(dirname "$0")/../lib.sh"
scenario_begin 09-alumno-permisos
require_stack

OP=$(login "$OPERATOR_EMAIL" "$DEMO_PASSWORD")
ME=$(login alumno01@demo.test "$DEMO_PASSWORD")
BATCH=$(post_batch "$OP" "$(unique_course 09)" 2026-10-30 "$(csv_of alumno01@demo.test alumno02@demo.test)" "$(new_key)")

step "1. Sin token no se accede a nada privado"
http GET /me/certificates
assert_eq 401 "$HTTP_CODE" "GET /me/certificates sin token"

step "2. El alumno no puede hacer acciones de operador"
http GET /batches -H "Authorization: Bearer $ME"
assert_eq 403 "$HTTP_CODE" "GET /batches"
http GET "/batches/$BATCH" -H "Authorization: Bearer $ME"
assert_eq 403 "$HTTP_CODE" "GET /batches/{id}"
post_batch_raw "$ME" "$(unique_course 09)" 2026-10-30 "$(csv_of alumno01@demo.test)" "$(new_key)"
assert_eq 403 "$HTTP_CODE" "POST /batches"

require_worker
assert_eq COMPLETED "$(wait_batch "$OP" "$BATCH" 120)" "estado del lote"
MINE=$(sql "SELECT r.id FROM cert_requests r JOIN users u ON u.id = r.student_id
            WHERE r.batch_id = '$BATCH' AND u.email = 'alumno01@demo.test'")
OTHER=$(sql "SELECT r.id FROM cert_requests r JOIN users u ON u.id = r.student_id
             WHERE r.batch_id = '$BATCH' AND u.email = 'alumno02@demo.test'")

step "3. «Mis certificados» lista exactamente los suyos"
http GET /me/certificates -H "Authorization: Bearer $ME"
assert_eq 200 "$HTTP_CODE" "HTTP"
expected=$(sql "SELECT r.id FROM cert_requests r JOIN users u ON u.id = r.student_id
                WHERE u.email = 'alumno01@demo.test' AND r.status = 'ISSUED' ORDER BY r.id" | tr '\n' ' ')
listed=$(jq -r '.[].certificate_id' <<<"$HTTP_BODY" | sort | tr '\n' ' ')
[[ "$listed" == "$expected" ]] || fail "la lista no coincide con los ISSUED de alumno01: esperado '$expected', obtenido '$listed'"
echo "   ok    lista igual a sus certificados emitidos ($(wc -w <<<"$listed") en total)"
assert_eq 0 "$(jq --arg o "$OTHER" '[.[] | select(.certificate_id == $o)] | length' <<<"$HTTP_BODY")" "certificados ajenos en la lista"

step "4. Descarga su PDF, pero no el de otro alumno"
assert_eq 200 "$(download_pdf "$ME" "$MINE" "$WORKDIR/mio.pdf")" "PDF propio"
assert_eq 404 "$(download_pdf "$ME" "$OTHER" "$WORKDIR/ajeno.pdf")" "PDF de otro alumno"

step "5. La consulta pública muestra solo datos académicos"
require_verify
http GET "/verify/$MINE"
assert_eq 200 "$HTTP_CODE" "HTTP"
assert_eq "" "$(jq -r 'keys - ["status","certificate_id","student_name","institution","course_name","completion_date"] | join(",")' <<<"$HTTP_BODY")" "campos no acordados en la respuesta"
assert_eq 0 "$(grep -c '@' <<<"$HTTP_BODY" || true)" "emails en la respuesta"
