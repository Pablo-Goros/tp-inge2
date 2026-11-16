# Frente C: emisión, registro y verificación

Implementación del plan acordado el 16/11/2026, integrada en `frente-c` con `origin/implement/parte-b` y `origin/frente-d`. Registro de entrega **simulado en PostgreSQL**; no se implementó blockchain. A y cloud permanecen fuera de C.

## Componentes entregados

- `Registry` con escritura idempotente, conflicto de huella e indisponibilidad diferenciados. `SimulatedRegistry` solo inserta y consulta; cada operación usa una transacción independiente de emisión.
- Diploma A4 horizontal en español, ReportLab y QR. Institución, alumno, curso, fecha, identificador y nota opcional decimal exacta. Nombres largos y acentos conservados; sin logos ni firmas inventadas.
- `process_request` separa el caso de uso de AMQP. Persiste PDF y SHA-256 antes del registro; nunca reemplaza un PDF guardado durante una reentrega.
- Worker real en Compose: `python -m app.entrypoints.worker`, un consumidor, prefetch 1, ACK manual, reconexión y parada ordenada.
- Verificación pública conectada a la interfaz HTTP de B mediante `RegistryVerification`; los dobles quedan limitados a pruebas.
- Inyección de fallos determinista para los escenarios de D; logs con identificadores, intento y resultado.

## Consistencia y fallos

Una solicitud pasa de PENDING a PROCESSING y luego ISSUED o FAILED. `MAX_ATTEMPTS=3` cuenta el primer intento. Un transitorio recuperable pasa por `cert.issue.wait`, con cinco segundos de TTL por defecto. No se usa requeue inmediato.

Los registros de `certificates` contienen **PDF preparados**, incluso antes de terminar la emisión. La solicitud solo permite descargar el archivo cuando está ISSUED. Un fallo permanente inyectado antes de registrar puede dejar un PDF preparado, sin registro y sin descarga autorizada. Por eso el escenario de un fallo entre 20 produce 20 PDF preparados, 19 emisiones y 19 registros.

Si el proceso cae después del registro, repetir `register` con la misma huella no crea otra entrada. Si ya agotó los intentos, consulta primero el registro; una coincidencia cierra ISSUED. Un timeout de la última escritura queda pendiente de reconciliación, sin declarar un fallo que quizá ya se registró. Una caída de PostgreSQL que impide persistir deja el mensaje sin ACK hasta reconectar.

Los fallos terminales conservan su error en base y se publican a DLQ con mensaje persistente, mandatory y confirmación. El ACK viene después. Si el traslado falla, la reentrega de FAILED repite solo el traslado. La DLQ puede tener duplicados tras una caída entre confirmación y ACK; no se promete exactamente una vez. Mensajes malformados, mayores de 4096 bytes o con solicitud inexistente también van a DLQ.

El reintento con DLX/TTL conserva la topología clásica de B/D. Se demuestra recuperación de procesos y reinicios del broker con su volumen; no se promete alta disponibilidad, tolerancia a pérdida de disco ni transferencia de dead letters sin pérdida ante cualquier caída abrupta del broker.

`transient:n` usa un contador global del proceso: los primeros n trabajos elegibles fallan antes de registrar. Reconectar no reinicia el contador; recrear el proceso sí. `permanent:email` tiene prioridad y no consume ese contador.

## Interfaz pública

- `GET /api/verify/{id}` consulta el registro y devuelve únicamente identificador, nombre, institución, curso y fecha. Ausencia: 404 NOT_FOUND. Nunca expone email ni nota.
- `POST /api/verify/{id}/file` compara SHA-256 de los bytes recibidos con el registro, sin usar `certificates.sha256` como autoridad. Devuelve VALID, ALTERED o NOT_FOUND; admite el máximo de 5 MiB establecido por B.
- Dependencia indisponible: 503 UNAVAILABLE. Un PDF local por sí solo no basta para declarar REGISTERED o VALID.
- El QR usa `PUBLIC_BASE_URL/verify/{id}`. A debe completar esa pantalla; mientras tanto se prueban los endpoints HTTP. Cambiar la base pública no cambia la huella de PDFs emitidos, pero puede dejar sus enlaces apuntando a una dirección anterior.

## Reproducción

```bash
docker compose up -d --build
bash scripts/run-all.sh
```

Los escenarios requieren Bash, curl y jq. En Git Bash se admiten rutas temporales Windows y jq nativo sin CR en los tokens. El escenario 02 bloquea temporalmente solicitudes del lote en PostgreSQL: permite emitir la primera y matar el worker con el lote incompleto, sin depender de la velocidad de la máquina. Libera la barrera al terminar, incluso ante error.

Pruebas aisladas, sin tocar los volúmenes de la demo:

```bash
docker compose -f backend/tests/docker-compose.test.yml up -d --wait
python -m pip install -e './backend[test]'
cd backend
python -m pytest -q
```

Las pruebas usan PostgreSQL/RabbitMQ reales en localhost:55432 y localhost:55672, y conservan las guardas de B. Incluyen procesos reales terminados después de persistir el PDF y después del registro, lotes de 20, broker detenido/reiniciado, ACK después del commit, DLQ sin ruta y recuperación, notas con/sin valor y permisos HTTP.

Muestra visual: `python scripts/preview_certificate.py` desde la raíz tras instalar el backend. Genera `output/pdf/certificado-demo.pdf`: datos ficticios y UUID fijo, **sin registro**; su QR no pretende verificar una emisión real. La muestra se renderizó y su QR se decodificó desde la página completa.

CSV adicional: `sample-data/lote-con-notas.csv` incluye nota 9.75, ausencia de nota y nota cero; no existe regla adicional de aprobación por calificación.

## Evidencia

Suite completa del backend, 16/11/2026: **234 passed, 1 warning in 169.09s** sobre PostgreSQL y RabbitMQ reales. La advertencia heredada corresponde a la deprecación del cliente httpx de Starlette. Se verificó también el contrato OpenAPI exportándolo de nuevo sin cambios.

Validación adicional del recorrido HTTP: **3 passed in 8.90s**, incluida la edición de la nota de 9.75 a 8.75 dentro del contenido de un PDF legible; la API devolvió ALTERED. No se suman estas tres pruebas al total anterior porque son la misma familia con una comprobación adicional.

Los resultados de los escenarios se guardan en `evidence/` y su resumen en `evidence/RESUMEN.txt`. Los fallos de validación de scripts se corrigen y vuelven a ejecutar antes de considerar cerrado el recorrido; no se sustituyen por resultados esperados.

Corrida integrada del 16/11: **10 de 10 escenarios PASS**. El lote de 20 se aceptó en 1922 ms y terminó 8642 ms después del POST en esa corrida local (sondeo cada dos segundos; no es un benchmark). El escenario de caída dejó 1 emitido y 19 mensajes pendientes, y terminó con 20 PDF y registros distintos tras reiniciar. La prueba permanente terminó con 19 emitidos, un FAILED con error visible, sin descarga del fallido y con traslado a DLQ. La caída del registro devolvió 503 y recuperó VALID al volver.
