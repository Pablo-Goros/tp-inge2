# Contratos entre frentes (Paso 0)

Versión 1.1, 13/11/2026 (1.1: corrige el ruteo de reintento/DLQ en §4). **Aprobado** por el usuario el 13/11/2026; falta que los otros tres integrantes lo lean y confirmen. Es la fuente única para los frentes A (frontend), B (API/DB/publicación), C (worker/registro/verificación) y D (infra/documentos). Ver [división del trabajo](division-del-trabajo.md).

Las decisiones marcadas **[Decisión propuesta]** son supuestos de quien redactó el documento; no fueron confirmadas por el equipo. Revisarlas antes de aprobar.

**Regla de cambio:** un cambio a este documento se avisa al grupo y se commitea junto con el código que lo requiere. Nadie cambia esquema, mensaje o endpoint sin actualizar este archivo.

## 1. Estructura del repositorio y puertos

```text
frontend/          # A: React + TypeScript + Vite
backend/
  app/
    api/           # B: rutas FastAPI
    domain/        # reglas y tipos, sin FastAPI/Pika
    application/   # casos de uso (B: aceptar lote; C: emitir, verificar)
    infrastructure/# repos DB, RabbitMQ, PDF/QR, registro
    entrypoints/   # api, publisher, worker, init
  migrations/      # B: Alembic
  tests/
  Dockerfile
sample-data/       # D: CSV y datos sintéticos
scripts/           # D: escenarios de falla
compose.yaml       # D
docs/
```

| Servicio Compose | Puerto expuesto al host | Notas |
| --- | --- | --- |
| `web` (Nginx + build React) | `8080` | Único punto de entrada público; `/api/*` → `api:8000` |
| `api` | ninguno | Solo red interna |
| `postgres` | ninguno | Solo red interna |
| `rabbitmq` | consola `15672` solo en `127.0.0.1` | AMQP `5672` interno |
| `publisher`, `worker`, `init` | ninguno | Misma imagen que `api`, distinto comando |

**Variables de entorno** (valores de demo en `.env.example`; en cloud se reemplazan secretos):

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | PostgreSQL |
| `RABBITMQ_URL` | AMQP |
| `JWT_SECRET` | Firma de tokens |
| `DEMO_PASSWORD` | Contraseña de las cuentas sembradas por `init` (valor de demo en `.env.example`; otra en cloud) |
| `PUBLIC_BASE_URL` | Base de la URL del QR, p. ej. `http://localhost:8080`. **Fijar antes de emitir el lote de demo**: cambiarla altera el PDF |
| `REGISTRY_BACKEND` | `simulated` (por defecto) o `chain` (tarea extra) |
| `MAX_ATTEMPTS` | Reintentos por certificado, por defecto `3` |
| `RETRY_DELAY_SECONDS` | Espera entre reintentos, por defecto `5` |
| `FAULT_INJECTION` | Lista de fallos controlados para la demo (ver §8); vacía por defecto |

## 2. Autenticación y roles

**[Decisión propuesta]** Email + contraseña, cuentas precargadas, token JWT.

- `POST /api/auth/login` con `{ "email": "...", "password": "..." }` → `200 { "access_token": "<jwt>", "role": "operator" | "student", "name": "..." }`. Credenciales inválidas: `401`.
- JWT HS256, claims `sub` (id de usuario), `role`, `exp` (8 h). Cabecera `Authorization: Bearer <jwt>`.
- Contraseñas almacenadas con bcrypt. Datos sintéticos; sin registro ni recuperación de contraseña.
- Rutas `/api/verify/*` son públicas. Todas las demás exigen token; el rol se comprueba en el backend, nunca solo en el frontend.

## 3. Esquema de base de datos (PostgreSQL)

Propiedad: B define y migra; C lee y escribe solo `cert_requests` (estado), `certificates` y `registry`. Tipos: `uuid`, `text`, `timestamptz`, `bytea`.

| Tabla | Columnas principales | Notas |
| --- | --- | --- |
| `institutions` | `id`, `name` | Una fila precargada |
| `users` | `id`, `institution_id`, `email` (único, minúsculas), `name`, `password_hash`, `role` (`operator`/`student`) | Un operador y N alumnos precargados |
| `batches` | `id`, `operator_id`, `course_name`, `completion_date` (date), `idempotency_key`, `request_fingerprint`, `created_at` | Único `(operator_id, idempotency_key)` |
| `cert_requests` | `id` **= identificador del certificado**, `batch_id`, `student_id`, `course_key`, `completion_date`, `status`, `attempts` (int, 0), `last_error` (text, null), `created_at`, `updated_at` | Único `(student_id, course_key, completion_date)` |
| `outbox` | `id`, `request_id`, `correlation_id` (uuid), `created_at`, `published_at` (null hasta confirmar) | Una fila por solicitud, creada en la misma transacción que el lote |
| `certificates` | `request_id` (PK, FK), `pdf` (bytea), `sha256` (text), `issued_at` | Bytes definitivos; se escriben una sola vez |
| `registry` | `cert_id` (PK), `sha256`, `registered_at` | Registro simulado, solo inserción (ver §7) |

**Estados de `cert_requests.status`:**

```text
PENDING ──(worker toma)──► PROCESSING ──(éxito)──► ISSUED
   ▲                            │
   └──(falla transitoria,       └──(falla permanente o attempts ≥ MAX_ATTEMPTS)──► FAILED
      attempts < MAX)───────────┘
```

- `ISSUED` y `FAILED` son terminales.
- **Estado del lote:** se deriva, no se guarda. `IN_PROGRESS` si hay alguna `PENDING`/`PROCESSING`; si no, `COMPLETED` (todas `ISSUED`) o `COMPLETED_WITH_ERRORS` (alguna `FAILED`).

**Normalización (para unicidad y duplicados):**
- `email`: `strip()` + minúsculas.
- `course_key`: `course_name` con `strip()`, espacios internos colapsados, minúsculas (`casefold`). Se guarda también el nombre original en `batches.course_name` para mostrar.
- `completion_date`: formato `YYYY-MM-DD`.
- La restricción única de `cert_requests` es la defensa contra cargas simultáneas; la validación previa solo sirve para dar mensajes claros.

## 4. Mensaje de RabbitMQ

**Topología** (la declara quien arranca primero: `init`; declaración idempotente):

| Elemento | Nombre | Propiedades |
| --- | --- | --- |
| Exchange | `certs` | `direct`, durable |
| Cola de trabajo | `cert.issue` | durable; enlazada a `certs` con clave `issue`; `x-dead-letter-exchange=certs.retry`, `x-dead-letter-routing-key=wait` |
| Exchange de reintento | `certs.retry` | `direct`, durable |
| Cola de espera | `cert.issue.wait` | durable; enlazada a `certs.retry` con clave `wait`; `x-message-ttl = RETRY_DELAY_SECONDS*1000`; `x-dead-letter-exchange=certs`, `x-dead-letter-routing-key=issue` (al vencer vuelve a la cola de trabajo) |
| Cola de fallidos | `cert.issue.dlq` | durable; enlazada a `certs` con clave `dlq`; solo la alimenta el worker de forma explícita |

**[Decisión propuesta]** El reintento se implementa con la cola de espera con TTL; no se usa `requeue` inmediato.

**Mensaje** (JSON, `content_type: application/json`, `delivery_mode: 2` persistente):

```json
{ "request_id": "<uuid de cert_requests.id>", "correlation_id": "<uuid>" }
```

- Solo identificadores. El worker lee los datos desde PostgreSQL.
- `correlation_id` se genera al aceptar el lote (uno por solicitud) y aparece en todos los logs de la API, publicador y worker.
- **El publicador** lee `outbox` donde `published_at IS NULL`, publica con *publisher confirms* y recién después marca `published_at`. Puede publicar dos veces: el worker debe tolerarlo.
- **El consumidor** usa ACK manual, `prefetch_count=1`, un solo worker.

**Algoritmo del worker (contrato de comportamiento, C lo implementa):**

1. Leer la solicitud. Si `status` es `ISSUED` o `FAILED`: ACK y terminar (sin efectos).
2. Marcar `PROCESSING`, incrementar `attempts`.
3. Si ya existe `certificates` para el id, reutilizar esos bytes y hash; si no, generar PDF+QR **una sola vez** y guardar `pdf` y `sha256`.
4. `registry.register(cert_id, sha256)` (idempotente, ver §7).
5. Marcar `ISSUED` y hacer ACK. El ACK es siempre el último paso.
6. Falla transitoria con `attempts < MAX_ATTEMPTS`: volver a `PENDING` y `nack(requeue=false)`; el dead-letter lo lleva a la cola de espera y de vuelta a la cola de trabajo. Falla permanente o intentos agotados: marcar `FAILED` con `last_error`, **publicar el mensaje a `certs` con clave `dlq` y luego hacer ACK** (un `nack` no podría distinguir destino: la cola de trabajo tiene un único dead-letter exchange). El error queda en la base aunque falle la publicación a la DLQ.
7. Tras cualquier caída del worker, el broker reentrega y el paso 1 o 3 evita duplicar.

**Qué es transitorio / permanente [Decisión propuesta]:** transitorio = error de conexión a PostgreSQL o al registro; permanente = datos inválidos, excepción de generación de PDF, o fallo controlado `permanent` de la inyección de fallos.

## 5. API HTTP

Prefijo `/api`. JSON salvo donde se indica. Errores con formato único:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "texto legible", "details": [ ... ] } }
```

| Código HTTP | `error.code` | Cuándo |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | CSV o formulario inválido; `details` lista las filas |
| 401 | `UNAUTHENTICATED` | Falta token o es inválido |
| 403 | `FORBIDDEN` | Rol o dueño incorrecto |
| 404 | `NOT_FOUND` | Recurso inexistente (o ajeno, para no filtrar existencia) |
| 409 | `IDEMPOTENCY_CONFLICT` | Misma `Idempotency-Key` con contenido distinto |
| 503 | `UNAVAILABLE` | Dependencia no disponible |
| (otro 4xx/5xx HTTP) | `HTTP_ERROR` | Error HTTP no listado (p. ej. 405); conserva el estado original |
| 500 | `INTERNAL_ERROR` | Excepción no controlada; mensaje genérico, sin detalles internos |

### Endpoints

| Método y ruta | Rol | Propósito |
| --- | --- | --- |
| `POST /auth/login` | público | Ver §2 |
| `POST /batches` | operator | Aceptar un lote |
| `GET /batches` | operator | Listar lotes propios, más recientes primero (máx. 100). Cada elemento: `{ batch_id, course_name, completion_date, status, total, counts{pending,processing,issued,failed}, created_at }` |
| `GET /batches/{id}` | operator | Avance y detalle por alumno |
| `GET /me/certificates` | student | Listar certificados propios `ISSUED` |
| `GET /certificates/{id}/pdf` | student dueño u operator | Descargar PDF |
| `GET /verify/{cert_id}` | público | Datos académicos registrados |
| `POST /verify/{cert_id}/file` | público | Comparar PDF subido con la huella registrada |

**`POST /batches`** — `multipart/form-data`: `course_name` (texto, 1–200), `completion_date` (`YYYY-MM-DD`), `file` (CSV). Cabecera obligatoria `Idempotency-Key` (texto, uuid recomendado).

- CSV: UTF-8, con cabecera, **una columna `email`**, máximo **100 filas** de datos. **[Decisión propuesta]** (el nombre del alumno sale de su cuenta precargada, no del CSV).
- Todo o nada. Se informa y no se crea nada si: fila con email mal formado, email sin cuenta de alumno, email repetido dentro del CSV, o combinación alumno/curso/fecha ya existente.
- `details`: `[ { "row": 3, "email": "x@y.com", "reason": "NO_ACCOUNT" | "DUPLICATE_IN_FILE" | "ALREADY_REQUESTED" | "INVALID_EMAIL" } ]` (`row` cuenta desde 1 sin la cabecera).
- Idempotencia: `request_fingerprint` = SHA-256 de `course_name` normalizado + fecha + bytes del CSV. Misma clave y mismo fingerprint → `200` con el lote original (sin crear nada). Misma clave, otro fingerprint → `409`.
- Éxito: `201 { "batch_id": "<uuid>", "status": "IN_PROGRESS", "total": 20 }`. Responde sin esperar la emisión.
- En una sola transacción: `batches`, `cert_requests` (`PENDING`) y `outbox`.

**`GET /batches/{id}`** → `200`:

```json
{
  "batch_id": "<uuid>", "course_name": "...", "completion_date": "2026-10-30",
  "status": "IN_PROGRESS|COMPLETED|COMPLETED_WITH_ERRORS",
  "counts": { "total": 20, "pending": 0, "processing": 1, "issued": 18, "failed": 1 },
  "items": [
    { "certificate_id": "<uuid>", "student_name": "...", "student_email": "...",
      "status": "ISSUED", "attempts": 1, "last_error": null }
  ]
}
```

El frontend consulta este endpoint cada 2 s mientras el estado sea `IN_PROGRESS`.

**`GET /me/certificates`** → `200 [ { "certificate_id", "course_name", "completion_date", "issued_at" } ]`.

**`GET /certificates/{id}/pdf`** → `200 application/pdf` con `Content-Disposition: attachment`. Alumno que no es dueño: `404`. Si no está `ISSUED`: `404`.

**`GET /verify/{cert_id}`** (público) → `200`:

```json
{ "status": "REGISTERED", "certificate_id": "<uuid>",
  "student_name": "...", "institution": "...", "course_name": "...", "completion_date": "2026-10-30" }
```

- `404` con `status: "NOT_FOUND"` si no está en `registry`. **Nunca** se devuelve email ni datos de cuenta.
- `503 UNAVAILABLE` si el registro no responde (no confundir con «no registrado»).

**`POST /verify/{cert_id}/file`** (público) — `multipart/form-data`: `file` (PDF, máx. 5 MB). `200`:

```json
{ "result": "VALID" | "ALTERED" | "NOT_FOUND" }
```

- Calcula SHA-256 del archivo subido y lo compara con `registry.lookup(cert_id)`, **no** con la copia en `certificates`.
- `VALID`: coincide. `ALTERED`: el id existe y la huella difiere. `NOT_FOUND`: id sin registro. Registro no disponible: `503 UNAVAILABLE`.
- **[Decisión propuesta]** La verificación de archivo cuelga de un `cert_id`: el QR del PDF apunta a `{PUBLIC_BASE_URL}/verify/{cert_id}` y esa página permite subir el archivo. No se intenta extraer el id desde el PDF subido. *(Cambia respecto del borrador previo, que listaba `POST /verify/file` sin id.)*

## 6. PDF y QR

- ReportLab + `qrcode`. Un A4 sencillo con: institución, nombre del alumno, curso, fecha de finalización, identificador del certificado, QR.
- El QR codifica `{PUBLIC_BASE_URL}/verify/{cert_id}`. No incluye el hash del PDF (dependencia circular).
- Los bytes se generan una sola vez y se guardan en `certificates.pdf`; el hash se calcula sobre esos bytes exactos. No usar fechas «ahora» al regenerar: toda fecha dentro del PDF sale de datos persistidos.

## 7. Interfaz del registro

Propiedad: C. Se usa desde el worker (escritura) y la API (lectura).

```python
class Registry(Protocol):
    def register(self, cert_id: UUID, sha256: str) -> None:
        """Idempotente. Mismo (id, hash) -> sin efecto.
        Mismo id con hash distinto -> RegistryConflict."""
    def lookup(self, cert_id: UUID) -> str | None:
        """Hash registrado, o None si no hay registro.
        Lanza RegistryUnavailable si no se puede consultar."""
```

- `SimulatedRegistry` (por defecto): tabla `registry`, solo inserción, sin `UPDATE` ni `DELETE` desde la aplicación. Escribe solo el worker.
- `BlockchainRegistry` (tarea extra, `REGISTRY_BACKEND=chain`): misma interfaz. Ver [tarea extra](division-del-trabajo.md#tarea-extra-migración-del-registro-a-blockchain-real). Ni A ni B cambian.
- La documentación y la defensa dicen **«registro simulado»**; no presentarlo como blockchain.

## 8. Datos de demo e inyección de fallos

**Seed** (lo carga `init`, idempotente; B lo implementa):
- 1 institución, 1 operador (`operador@demo.test`), 25 alumnos (`alumno01@demo.test` … `alumno25@demo.test`). Contraseña de demo documentada en el README; en cloud se cambia por canal privado.
- `sample-data/lote-20.csv` (20 emails válidos) y variantes inválidas: `con-error.csv` (email sin cuenta + duplicado en el archivo).

**`FAULT_INJECTION`** (D la usa; C la implementa en el worker; lista separada por comas):
- `transient:<n>`: el worker falla `n` veces seguidas con error transitorio antes de dejar pasar.
- `permanent:<email>`: la emisión de ese alumno falla con error permanente.
- Determinista y repetible; nunca aleatoria.

## 9. Qué consume cada frente

| Frente | Consume | Mock hasta la integración |
| --- | --- | --- |
| A | Endpoints de §5 y errores | OpenAPI exportado de B o respuestas JSON fijas (MSW) con los ejemplos de este documento |
| B | Esquema §3, mensaje §4, interfaz `Registry` §7 (para `/verify`) | `SimulatedRegistry` de C, o un stub con dict |
| C | Esquema §3, mensaje §4, algoritmo §4, `Registry` §7 | Script que inserta una `cert_request` en PostgreSQL y publica un mensaje a mano |
| D | Puertos y variables §1, topología §4, seed §8 | Contenedores placeholder |

## 10. Pendientes que no cierra este documento

- Contraseñas y secretos reales para cloud (D, canal privado).
- Diseño visual del PDF y de las pantallas (A, C).
- Versiones exactas de imágenes y dependencias: fijarlas al iniciar el arranque limpio (D), no `latest`.
- Límite de tamaño del CSV por encima de 100 filas y rendimiento: no se especifica.
