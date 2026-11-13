# División del trabajo en 4 frentes paralelos

Fecha: 12/11/2026. Entrega: 19/11. Defensa: 26/11.

Los frentes se dividen por **fronteras de contrato**, no por capas técnicas. Cada integrante trabaja contra stubs hasta la integración, de modo que nadie espera a otro durante los primeros días.

## Paso 0: acuerdo conjunto (todos, hoy, ~1.5 h)

Bloquea al resto. Se commitea en `docs/contracts.md`:

1. **Esquema de base de datos:** tablas `students`, `batches`, `cert_requests`, `outbox`, `certificates`. Estados de una solicitud: `PENDING → PROCESSING → ISSUED | FAILED`.
2. **Mensaje RabbitMQ:** `{"request_id": "<uuid>", "correlation_id": "<uuid>"}`. Solo identificadores; el worker lee los datos académicos desde PostgreSQL.
3. **Endpoints HTTP (OpenAPI mínimo):**
   - `POST /batches` (curso, fecha de finalización, CSV, cabecera `Idempotency-Key`)
   - `GET /batches/{id}`
   - `GET /me/certificates`
   - `GET /certificates/{id}/pdf`
   - `GET /verify/{cert_id}` (público)
   - `POST /verify/file` (público)
4. **Identificador de certificado:** UUID generado por el frente B al aceptar el lote. Estable; nunca se regenera.
5. **Estructura de repositorio, puertos y variables de entorno.**

## Frente A: Frontend y sesión

**Responsabilidad:** pantallas de operador (subir CSV, ver avance), alumno («Mis certificados» y descarga), verificación pública y login.

**Trabaja de forma independiente con:** el OpenAPI del paso 0 y un mock (respuestas JSON fijas o MSW). No necesita backend real.

**Entrega:** build que consume `/api`.

**Recorte sugerido:** HTML plano o plantillas servidas por FastAPI en lugar de React + Nginx, si el tiempo apremia.

**Carpeta propia:** `frontend/`

## Frente B: API, base de datos y publicación

**Responsabilidad:**
- FastAPI, migraciones y datos sintéticos (institución, operador, alumnos).
- Validación del CSV (rechazo total ante errores, detección de duplicados).
- Idempotencia HTTP, permisos de operador y alumno.
- Outbox y publicador hacia RabbitMQ.
- Exponer por HTTP las funciones de verificación implementadas en C.

**Trabaja de forma independiente con:** PostgreSQL y RabbitMQ en contenedores sueltos. Para probar sin worker: un consumidor de consola que imprime los mensajes.

**Entrega:** lote aceptado → filas en la base → mensajes en la cola.

**Carpeta propia:** `backend/app/api`, `backend/migrations`, `backend/app/entrypoints/publisher`

## Frente C: Emisión, registro y verificación

**Responsabilidad:**
- Worker con ACK manual, reintentos acotados, dead-letter queue e idempotencia.
- Generación de PDF + QR (ReportLab + qrcode).
- Huella SHA-256 y registro de la huella en una **tabla `registry` simulada** (solo inserción) en PostgreSQL, detrás de la interfaz `register(cert_id, hash)` / `lookup(cert_id)`. Ver [Tarea extra](#tarea-extra-migración-del-registro-a-blockchain-real).
- Lógica de verificación: coincidencia, ausencia de registro, archivo alterado, servicio no disponible.

**Trabaja de forma independiente con:** un script que inserta una `cert_request` en PostgreSQL y publica un mensaje a mano. No necesita la API.

**Entrega:** mensaje recibido → PDF y huella guardados → estado `ISSUED`.

**Nota:** es el frente de mayor carga junto con B. El registro se entrega simulado; la migración a blockchain real es una tarea extra opcional (abajo).

**Carpeta propia:** `backend/app/application`, `backend/app/infrastructure`, `backend/app/entrypoints/worker`

## Frente D: Infraestructura, evidencia y documentos

**Responsabilidad:**
- `compose.yaml` (PostgreSQL, RabbitMQ y, a medida que existan, los servicios de A, B y C), healthchecks y tarea `init`.
- Cuenta y VM en la nube; despliegue del mismo flujo con credenciales para la cátedra.
- Escenarios de falla repetibles: worker caído, broker caído, error transitorio y permanente, mismo mensaje reenviado.
- White paper (máx. 5 páginas), README, guion de demo y diapositivas.

**Arranca con:** compose con PostgreSQL y RabbitMQ y contenedores placeholder; y la verificación de elegibilidad cloud (**primera tarea de todas, hoy**).

**Entrega:** `docker compose up` funcional, VM desplegada, scripts de falla y borrador del white paper en curso desde el primer día.

**Carpeta propia:** `compose.yaml`, `scripts/`, `sample-data/`, `docs/`, `README.md`

## Tarea extra: migración del registro a blockchain real

**Estado:** opcional. **Por defecto el registro es simulado** (tabla `registry`). Solo se ejecuta si se cumplen las condiciones de entrada.

**Dueño:** frente C (con apoyo de D para Compose). **Contrato de Paso 0:** no cambia; es el mismo `register(cert_id, hash)` / `lookup(cert_id)`, por lo que A y B no se ven afectados.

**Condiciones de entrada (todas):**
1. Integración 1 (B + C) completa y estable, con los escenarios de falla de RabbitMQ ya probados.
2. Al menos un integrante conoce Solidity/Foundry, o hay holgura de horas explícita acordada por el grupo.
3. Fecha límite de decisión: **15/11**. Después se congela el registro simulado.

**Alcance de la migración:**
- Contrato Solidity mínimo: emisor autorizado, registro único por id, misma huella idempotente, huella distinta rechazada.
- Servicio `anvil` en Compose con estado persistente y healthcheck.
- Compilación del contrato dentro de la imagen y despliegue idempotente en `init` (no redesplegar en cada `up`; guardar dirección y comprobar que exista en la red).
- Implementación `BlockchainRegistry` con web3.py detrás de la interfaz existente, seleccionable por variable de entorno (`REGISTRY_BACKEND=simulated|chain`).
- Un solo worker (nonces de la cuenta emisora).
- Reconciliación: si el worker cae tras enviar la transacción y antes de guardar en PostgreSQL, consultar la cadena antes de reenviar.
- Detectar nodo reiniciado sin estado; nodo caído responde «no se pudo verificar», no «inválido».

**Criterio de aceptación:** los mismos escenarios de falla del frente D pasan con `REGISTRY_BACKEND=chain` sin cambios en API ni frontend.

**Si no se cumple:** se entrega simulado y la documentación (white paper, defensa) lo declara explícitamente como «registro simulado, reemplazable por blockchain mediante la interfaz». No presentar el registro simulado como blockchain.

**Estimación:** 10–15 h para quien conozca Solidity; más si no. Sin estimación validada con el equipo.

## Calendario de sincronización

| Fecha | Hito | Frentes |
| --- | --- | --- |
| 12/11 | Paso 0 acordado; cuenta cloud en trámite; compose base | Todos / D |
| 12–14/11 | Trabajo en paralelo contra stubs | A, B, C, D |
| **14/11** | **Integración 1:** lote → RabbitMQ → worker → PDF → verificación por API | B + C |
| 15/11 | **Integración 2:** UI real contra la API | A + B |
| **15/11** | **Decisión:** ¿se ejecuta la migración a blockchain real? Si no, se congela el registro simulado | C + grupo |
| 15–16/11 | Despliegue en la VM; escenarios de falla; medidas reales | D con todos |
| 16/11 | Congelar alcance; prueba desde cero por otra persona | Todos |
| 18/11 | Ensayo integral y versión candidata | Todos |
| 19/11 | **Entrega** | Todos |
| 20–25/11 | Ensayo de exposición y demo | Todos |
| 26/11 | Defensa | Todos |

## Acoplamientos a vigilar

| Par | Contrato compartido | Riesgo |
| --- | --- | --- |
| B ↔ C | Formato del mensaje y estados en la base | Worker y publicador desalineados |
| B ↔ A | OpenAPI | Pantallas que no coinciden con la API |
| C ↔ D | Persistencia del registro y estado tras reinicios | Contrato/registro perdido al reiniciar |
| Todos | Cambios al paso 0 | Cambios silenciosos rompen a otro frente |

## Reglas de trabajo

- **Un dueño por carpeta.** Cambios en carpetas ajenas se piden por PR o aviso.
- **Una rama por frente**, merges pequeños y frecuentes a `main`.
- **Cambios de contrato** (esquema, mensaje, endpoints): se avisan al grupo y se actualiza `docs/contracts.md` en el mismo commit.
- **Integrar temprano:** primer E2E en 48 h, no al final.
- **D no es «lo que sobra»:** cloud, README y white paper son entregables obligatorios del enunciado.
- Todos deben poder explicar el rol de RabbitMQ en la defensa.

## Carga relativa y asignación

C ≈ B > A ≈ D. Poner a las personas con más disponibilidad y experiencia técnica en B y C. Quien tenga menos horas, en A o D (más desacoplados).

| Frente | Responsable | Disponibilidad (h/semana) |
| --- | --- | --- |
| A: Frontend | _a definir_ | |
| B: API y publicación | _a definir_ | |
| C: Emisión y verificación | _a definir_ | |
| D: Infra y documentos | _a definir_ | |

## Recortes si el plazo se complica

Ver [plan de trabajo](implementation-plan.md#recortes-si-el-plazo-se-complica). Orden sugerido de recorte: (1) React → HTML plano; (2) la [tarea extra de migración a blockchain real](#tarea-extra-migración-del-registro-a-blockchain-real) no se ejecuta y el registro queda simulado, declarado explícitamente; (3) simplificar mecanismos de consistencia a idempotencia en worker + restricción única en base. No recortar white paper, Docker Compose, despliegue cloud ni el caso no trivial de RabbitMQ.
