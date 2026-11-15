# 06: Demostrar publicación tras una caída del broker

**Spec:** [Frente B: API, base de datos y publicación](../spec.md)
**Status:** done

## What to build

Demostrar, y corregir solo si la evidencia lo requiere, que el flujo existente acepta un lote con RabbitMQ caído y lo publica cuando el broker se recupera. Recorrer HTTP, PostgreSQL, outbox y RabbitMQ real. No reimplementar el publicador por estar sin marcar las casillas del plan anterior.

Usar servicios aislados de prueba y los mecanismos de seguridad existentes de la suite. No detener ni purgar servicios compartidos o datos de demo ajenos para producir el escenario.

## Acceptance criteria

- [x] Con PostgreSQL disponible y RabbitMQ de prueba detenido, un lote válido se acepta por HTTP, crea solicitudes PENDING y conserva outbox sin published_at; no depende de una comprobación síncrona del broker.
- [x] Al volver RabbitMQ y ejecutar el publicador, aparecen mensajes persistentes con exactamente request_id y correlation_id, y se marca publicación solo tras publisher confirm y enrutamiento válido.
- [x] Un envío no enrutable o no confirmado conserva la fila pendiente; el proceso puede reconectar y continuar sin perder solicitudes.
- [x] Simular fallo tras publicar y antes de confirmar el cambio en base permite republicar el mismo request_id/correlation_id; se documenta como entrega al menos una vez.
- [x] Un nuevo ciclo no republica filas ya marcadas. El escenario no exige que el worker esté disponible ni promete que no existan mensajes repetidos.
- [x] Pruebas existentes y evidencia reproducible con PostgreSQL/RabbitMQ reales cubren el comportamiento. Se registran comandos, resultados y correcciones realizadas, si fueron necesarias.

## Blocked by

None


