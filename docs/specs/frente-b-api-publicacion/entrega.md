# Entrega e integración de Parte B

Referencia: [spec](spec.md), [tickets](tickets/) y antecedente [plan de B](../../superpowers/plans/2026-11-13-frente-b-api-publicacion.md). Las validaciones pendientes no se consideran realizadas por existir código o pruebas.

## Dependencias para cerrar 03 y 07

El árbol recibido no contiene entrypoint de worker, generador PDF/QR ni casos de uso de verificación de C. No se implementan dentro de B ni se sustituye su evidencia por un stub. La ejecución normal de verificación responde 503 hasta conectar la dependencia de C; los falsos se usan exclusivamente en pruebas HTTP.

C debe leer `cert_requests.final_grade` como decimal opcional, incluirla solamente cuando existe, calcular SHA-256 sobre el PDF definitivo y conservar bytes/huella ante reentregas. El mensaje AMQP mantiene exclusivamente `request_id` y `correlation_id`. El registro de entrega es simulado y su interfaz debe distinguir ausencia e indisponibilidad. C debe conectar los casos de uso a la dependencia HTTP documentada en el contrato, sin un segundo registro en B.

A debe mostrar la nota opcional del detalle autorizado, representada como número o null, sin agregarla a listados ni verificación pública. La consulta sigue cada dos segundos mientras exista trabajo pendiente. La adaptación de pantalla pertenece a A.

B mantiene API, aceptación, migraciones, seed, modelos compartidos y publicador. C mantiene emisión/PDF, registro y decisión de autenticidad. Los cambios de estos módulos requieren integrar ambos frentes antes de afirmar el recorrido completo.

## Para D

Usar el Compose aislado de `backend/tests/docker-compose.test.yml` para pruebas; no detener/purgar servicios compartidos. El publicador garantiza entrega al menos una vez: un fallo entre envío y commit permite repetir identificadores. La idempotencia de emisión corresponde a C.

Revisar referencias anteriores: README declara ausencia de aplicación y blockchain local; docs/project.md dice que todavía no hay software; docs/architecture.md y docs/implementation-plan.md describen blockchain como entrega. Esta spec de B entrega integración con registro simulado, sin atribuir aprobación de este cambio al resto del equipo. Estos documentos generales pertenecen a D y requieren reconciliación.

## Evidencia

Los resultados por ticket se agregan durante la integración. Los tickets 03 y 07 continúan pendientes mientras no esté disponible C; no existe evidencia de emisión real, PDF con/sin nota ni ausencia de doble emisión en el árbol recibido.
