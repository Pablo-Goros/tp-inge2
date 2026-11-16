#!/usr/bin/env bash
# Demo guiada para la defensa (≈ 7 minutos). Pausa entre pasos: Enter para seguir.
#
# Uso, en la máquina donde corre el compose (local o la VM por SSH):
#   docker compose up -d
#   scripts/demo.sh
#
# Variables opcionales:
#   BASE_URL      URL de la app (por defecto http://localhost:8080)
#   DEMO_DIR      carpeta donde se guardan los PDF (por defecto ~/demo-certificados)
#   DEMO_AUTO=1   sin pausas ni abrir archivos (para probar el script)
#   DEMO_FALLA=1  agrega el paso opcional de falla permanente (≈ 1 minuto más)
#
# Si algo falla en vivo: plan B en docs/demo-script.md (logs en evidence/).
source "$(dirname "$0")/lib.sh"

DEMO_DIR="${DEMO_DIR:-$HOME/demo-certificados}"
mkdir -p "$DEMO_DIR"

B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; C=$'\e[36m'; R=$'\e[31m'; N=$'\e[0m'
title() { echo; echo "${B}${C}━━━ $* ━━━${N}"; }
say()   { echo "${Y}» $*${N}"; }
show()  { echo "  $*"; }
pause() { [[ "${DEMO_AUTO:-0}" == 1 ]] || read -rp "${B}   [Enter para seguir]${N}" _; }
open_file() { [[ "${DEMO_AUTO:-0}" == 1 ]] || { command -v xdg-open >/dev/null && xdg-open "$1" >/dev/null 2>&1 & }; }

cleanup() {
  local s
  for s in "${_RESTORE[@]+"${_RESTORE[@]}"}"; do docker compose start "$s" >/dev/null 2>&1 || true; done
  [[ "$_RESTORE_FAULT" == 1 ]] && FAULT_INJECTION= docker compose up -d --no-deps worker >/dev/null 2>&1
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

progress() {  # progress <token> <batch>: una línea con el avance del lote
  http GET "/batches/$2" -H "Authorization: Bearer $1"
  jq -r '"  estado: \(.status)  ·  emitidos \(.counts.issued)/\(.counts.total)  ·  pendientes \(.counts.pending)  ·  fallidos \(.counts.failed)"' <<<"$HTTP_BODY"
}

require_stack
OP=$(login "$OPERATOR_EMAIL" "$DEMO_PASSWORD")
COURSE="Introducción a RabbitMQ (demo $(date +%H:%M:%S))"

# ------------------------------------------------------------------------------
title "1 · El worker está caído (simulamos un corte del proceso que emite)"
say "Detenemos el worker: es el proceso que arma cada PDF y lo registra."
stop_service worker kill
pause

title "2 · El operador sube un lote de 20 alumnos igual"
say "La API guarda el lote y responde enseguida: no espera a que se emitan."
t0=$(now_ms)
post_batch_raw "$OP" "$COURSE" 2026-10-30 sample-data/lote-20.csv "$(new_key)"
show "HTTP $HTTP_CODE en $(( $(now_ms) - t0 )) ms → $(jq -c . <<<"$HTTP_BODY")"
BATCH=$(jq -r .batch_id <<<"$HTTP_BODY")
sleep 2
progress "$OP" "$BATCH"
say "Los 20 trabajos no se perdieron: están esperando en la cola de RabbitMQ."
show "mensajes en la cola cert.issue: ${B}$(queue_len cert.issue)${N}"
say "(Se puede mostrar en la consola de RabbitMQ: http://localhost:15672, usuario certs)"
pause

title "3 · Vuelve el worker: retoma solo desde la cola"
start_service worker
for _ in $(seq 1 30); do
  line=$(progress "$OP" "$BATCH"); echo "$line"
  [[ "$line" == *IN_PROGRESS* ]] || break
  sleep 1
done
pause

title "4 · Sin pérdidas y sin duplicados"
show "certificados emitidos:     ${B}$(count_status "$BATCH" ISSUED)${N} de 20"
show "PDF distintos (huellas):   ${B}$(distinct_hashes "$BATCH")${N}"
show "entradas en el registro:   ${B}$(count_registry "$BATCH")${N}"
show "mensajes en la cola ahora: ${B}$(queue_len cert.issue)${N}"
say "RabbitMQ entrega «al menos una vez»; el worker es idempotente, así que nunca hay dos certificados."
pause

title "5 · El alumno entra y descarga su certificado"
ST=$(login alumno01@demo.test "$DEMO_PASSWORD")
http GET /me/certificates -H "Authorization: Bearer $ST"
CERT=$(jq -r --arg c "$COURSE" '[.[] | select(.course_name == $c)][0].certificate_id' <<<"$HTTP_BODY")
show "«Mis certificados» de alumno01: $(jq length <<<"$HTTP_BODY") certificado(s); el de este curso: $CERT"
PDF="$DEMO_DIR/alumno01-original.pdf"
show "descarga: HTTP $(download_pdf "$ST" "$CERT" "$PDF") → $PDF"
OTHER=$(sql "SELECT r.id FROM cert_requests r JOIN users u ON u.id = r.student_id
             WHERE r.batch_id = '$BATCH' AND u.email = 'alumno02@demo.test'")
show "el mismo alumno pidiendo el PDF de alumno02: HTTP $(download_pdf "$ST" "$OTHER" "$WORKDIR/x.pdf") (no puede)"
open_file "$PDF"
say "El PDF tiene un QR que apunta a la verificación pública de este certificado."
pause

title "6 · Un tercero verifica el certificado (sin cuenta)"
http GET "/verify/$CERT"
show "consulta pública (lo que abre el QR): $(jq -c . <<<"$HTTP_BODY")"
say "Muestra solo datos académicos: ni email ni nota."
verify_file "$CERT" "$PDF"
show "sube el PDF original      → ${G}${B}$(jq -r .result <<<"$HTTP_BODY")${N}"
ALT="$DEMO_DIR/alumno01-alterado.pdf"
cp "$PDF" "$ALT"
printf 'X' | dd of="$ALT" bs=1 seek=$(( $(wc -c < "$ALT") / 2 )) conv=notrunc 2>/dev/null
verify_file "$CERT" "$ALT"
show "sube el PDF con 1 byte cambiado → ${R}${B}$(jq -r .result <<<"$HTTP_BODY")${N}"
say "Se compara la huella SHA-256 del archivo con la registrada por el emisor (registro simulado)."
pause

# ------------------------------------------------------------------------------
if [[ "${DEMO_FALLA:-0}" == 1 ]]; then
  title "Extra · Un alumno con un error permanente no frena al resto"
  say "Configuramos el worker para que falle siempre con alumno03."
  set_worker_fault "permanent:alumno03@demo.test"
  dlq_before=$(queue_len cert.issue.dlq)
  BATCH2=$(post_batch "$OP" "$COURSE (bis)" 2026-10-30 sample-data/lote-20.csv "$(new_key)")
  wait_batch "$OP" "$BATCH2" 60 >/dev/null
  progress "$OP" "$BATCH2"
  http GET "/batches/$BATCH2" -H "Authorization: Bearer $OP"
  show "detalle del fallido: $(jq -c '.items[] | select(.status == "FAILED") | {student_email, status, attempts, last_error}' <<<"$HTTP_BODY")"
  show "mensajes en la cola de fallidos (DLQ): $dlq_before → ${B}$(queue_len cert.issue.dlq)${N}"
  pause
fi

title "Fin de la demo"
say "PDFs guardados en $DEMO_DIR"
