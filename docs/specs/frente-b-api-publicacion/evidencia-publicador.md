# Evidencia de publicación y recuperación (ticket 06)

Fecha: 15/11/2026. Infraestructura aislada del proyecto Compose `frente-b-test`:
PostgreSQL 17.6 en localhost:55432 y RabbitMQ 4.1.4 en localhost:55672.
No se detuvo ni purgó el PostgreSQL nativo ni servicios de demo. Las guardas
existentes limitan las operaciones destructivas a las instancias de prueba.

Desde la raíz:

```powershell
docker compose -f backend/tests/docker-compose.test.yml -p frente-b-test up -d --wait
```

Desde `backend`, con las dependencias de prueba instaladas:

```powershell
python -m pytest tests/test_publisher.py tests/test_broker.py tests/test_safety.py -q --tb=short
```

Resultado: **19 passed**, 1 advertencia de deprecación de Starlette/httpx,
29,89 segundos. Una ejecución inicial anterior a la disponibilidad de los
contenedores produjo errores de conexión en las fixtures; no fue evidencia
funcional y se repitió tras comprobar ambos servicios healthy.

`test_broker_down_accepts_http_batch_and_recovers` detiene únicamente el servicio
rabbitmq del proyecto de prueba y, durante la caída, hace login y POST de un CSV
válido mediante HTTP. Comprueba 201, solicitud PENDING y outbox persistido sin
published_at. El loop publicador permanece vivo y conserva la fila pendiente.
Al reiniciar RabbitMQ, comprueba el mensaje real persistente con exactamente
request_id y correlation_id, la marca de publicación y un ciclo adicional sin
mensajes nuevos. La fixture usa transacciones realmente confirmadas y limpia
solo la base de prueba; no requiere worker.

Las otras pruebas existentes verifican topología, publisher confirms y mandatory,
fallo de enrutamiento que conserva pendientes y recuperación al restablecer el
enlace, lotes acotados, dos publicadores concurrentes con SKIP LOCKED y parada.
La prueba de caída entre envío y commit provoca ese fallo en la frontera de
persistencia y observa dos mensajes reales con el mismo request_id **y**
correlation_id. La garantía es **entrega al menos una vez**: no demuestra ni
promete ausencia de mensajes repetidos. El worker de C debe ser idempotente.
No se forzó un NACK del broker; el escenario real de mensaje no enrutable sí se
observó. No fue necesario cambiar el publicador existente.

Este ticket añade cobertura de comportamiento existente, por lo que las nuevas
aserciones pasaron sin modificar producción; no se informa un ciclo red/green
inexistente. La emisión, PDF, registro y tolerancia del worker a reentregas
requieren C y se validan en los tickets 03/07.
