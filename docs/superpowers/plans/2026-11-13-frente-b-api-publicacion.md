# Frente B — API, base de datos y publicación: Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aceptar lotes de certificados por CSV, persistirlos con outbox, publicarlos a RabbitMQ y exponer la API HTTP que consumen el frontend y el público.

**Architecture:** FastAPI con SQLAlchemy sobre PostgreSQL. Aceptar un lote escribe lote, solicitudes y outbox en una sola transacción; un proceso `publisher` separado publica el outbox con *publisher confirms*. La verificación pública delega en casos de uso del frente C.

**Tech Stack:** Python, FastAPI, Pydantic, SQLAlchemy, Alembic, PostgreSQL, Pika, bcrypt, PyJWT, pytest. Fijar versiones compatibles al iniciar; nunca `latest`.

**Spec:** `docs/contracts.md` (v1.1) y `docs/division-del-trabajo.md`.

**Dependencias con otros planes:**
- **Task 1 es prerrequisito compartido** (C y D parten de ella): subirla a `main` hoy.
- Task 9 consume `verification` y `registry` del plan C; hasta que existan, probar con un registro falso inyectado.
- A consume `frontend/openapi.json` generado en Task 2.

## Global Constraints

- Prefijo `/api`. Errores siempre `{ "error": { "code", "message", "details" } }` con los códigos de §5 de contracts.
- Estados de solicitud: `PENDING`, `PROCESSING`, `ISSUED`, `FAILED`. Estado del lote derivado, no guardado.
- Email: `strip()` + minúsculas. `course_key`: strip, espacios colapsados, `casefold`. Fecha `YYYY-MM-DD`.
- CSV: UTF-8, cabecera, una columna `email`, máximo 100 filas de datos, todo o nada.
- `Idempotency-Key` obligatoria en `POST /batches`; fingerprint = SHA-256 de `course_key` + fecha + bytes del CSV.
- JWT HS256, claims `sub`, `role`, `exp` (8 h). Contraseñas con bcrypt.
- Las rutas `/verify/*` son públicas y nunca devuelven email ni datos de cuenta.
- Mensaje AMQP: solo `{request_id, correlation_id}`, persistente. Topología según §4 de contracts.
- Las pruebas corren contra PostgreSQL y RabbitMQ reales (Compose), no SQLite ni mocks del broker.

## Review Focus

Entradas que el spec implica y ningún test de funcionalidad cubriría; cada una tiene su test en la task indicada.

1. CSV con BOM UTF-8, saltos CRLF y línea en blanco final: debe aceptarse igual que uno limpio (Task 3).
2. CSV vacío, solo cabecera, 101 filas o sin columna `email`: `400 VALIDATION_ERROR` sin tocar la base (Task 3).
3. `Idempotency-Key` ausente: `400`, no se crea nada (Task 5).
4. Mismo alumno con email en mayúsculas/espacios distintos: cuenta como duplicado (Task 3).
5. Operador A pide un lote de otro operador, o alumno pide el PDF de otro: `404`, no `403` (Tasks 6 y 8).

## File Structure

| Archivo | Responsabilidad |
| --- | --- |
| `backend/pyproject.toml`, `backend/Dockerfile` | Dependencias fijadas e imagen única (api/publisher/worker/init) |
| `backend/app/config.py` | `Settings` desde variables de entorno (§1 de contracts) |
| `backend/app/infrastructure/db.py` | Engine, `SessionLocal`, dependencia `get_session` |
| `backend/app/infrastructure/models.py` | Las 7 tablas de §3 |
| `backend/app/infrastructure/broker.py` | `connect()` y `declare_topology()` |
| `backend/app/domain/normalize.py`, `csv_validation.py` | Reglas puras, sin I/O |
| `backend/app/application/accept_batch.py`, `publish_outbox.py` | Casos de uso |
| `backend/app/api/` (`main.py`, `errors.py`, `auth.py`, `batches.py`, `certificates.py`, `verify.py`) | Rutas |
| `backend/app/entrypoints/` (`api.py`, `init.py`, `publisher.py`) | Comandos de proceso |
| `backend/tests/` | Un archivo de test por módulo; `conftest.py` con sesión transaccional |

---

### Task 1: Esqueleto, modelos, migración y topología (prerrequisito compartido)

**Files:**
- Create: `backend/pyproject.toml`, `backend/Dockerfile`, `backend/app/config.py`, `backend/app/infrastructure/db.py`, `backend/app/infrastructure/models.py`, `backend/app/infrastructure/broker.py`, `backend/migrations/` (Alembic), `backend/tests/conftest.py`, `backend/tests/test_models.py`, `backend/tests/test_broker.py`

**Interfaces:**
- Produces: modelos SQLAlchemy `Institution`, `User`, `Batch`, `CertRequest`, `Outbox`, `Certificate`, `RegistryEntry` (tablas de §3); `Settings`; `get_session() -> Iterator[Session]`; `declare_topology(channel) -> None` (idempotente); `connect(url: str) -> pika.BlockingConnection`; enum `RequestStatus`.

- [ ] **Step 1: Test de modelos.** `test_unique_student_course_date_rejects_duplicate`: insertar dos `CertRequest` con mismo `(student_id, course_key, completion_date)` lanza `IntegrityError`. `test_batch_idempotency_key_unique_per_operator`: mismo `(operator_id, idempotency_key)` lanza `IntegrityError`. `test_registry_primary_key_is_cert_id`.
- [ ] **Step 2:** Ejecutar con PostgreSQL levantado: `pytest backend/tests/test_models.py -v`. Esperado: FAIL (modelos no existen).
- [ ] **Step 3:** Implementar modelos y migración inicial Alembic con las columnas exactas de §3; `cert_requests.id` es el identificador del certificado; `attempts` default 0.
- [ ] **Step 4:** Test de broker: `test_declare_topology_creates_all_queues_and_is_idempotent` declara dos veces y comprueba `cert.issue`, `cert.issue.wait`, `cert.issue.dlq` con sus argumentos de §4 (usar `passive=True` para verificar existencia).
- [ ] **Step 5:** Implementar `declare_topology` exactamente como la tabla de §4 (exchanges `certs`, `certs.retry`; claves `issue`, `wait`, `dlq`; TTL = `RETRY_DELAY_SECONDS*1000`).
- [ ] **Step 6:** Dockerfile único con `ENTRYPOINT ["python","-m"]` y `pyproject` con versiones fijadas. Ejecutar `pytest backend/tests -v`; esperado: PASS.
- [ ] **Step 7: Commit** y avisar al grupo: C y D ya pueden partir de `main`.

---

### Task 2: Formato de error, autenticación y OpenAPI

**Files:**
- Create: `backend/app/api/main.py`, `errors.py`, `auth.py`, `backend/app/entrypoints/api.py`, `scripts/export_openapi.py`
- Test: `backend/tests/test_auth.py`, `test_errors.py`

**Interfaces:**
- Produces: `create_app() -> FastAPI`; `class ApiError(Exception)` con `status`, `code`, `message`, `details`; dependencia `current_user() -> User`; `require_role(role: str) -> Callable`; `POST /api/auth/login`. `scripts/export_openapi.py` escribe `frontend/openapi.json`.

- [ ] **Step 1: Tests.** `test_login_ok_returns_token_role_name` (200, `role` y `name`); `test_login_wrong_password_401_envelope` (`error.code == "UNAUTHENTICATED"`); `test_student_token_on_operator_route_403`; `test_missing_token_401`; `test_unknown_route_uses_error_envelope`.
- [ ] **Step 2:** Run `pytest backend/tests/test_auth.py -v`; esperado FAIL.
- [ ] **Step 3:** Implementar login (bcrypt + PyJWT HS256, `exp` 8 h) y handlers globales que conviertan `ApiError`, validación de Pydantic y 404 al formato de error de §5.
- [ ] **Step 4:** Ejecutar tests; esperado PASS.
- [ ] **Step 5:** Implementar `scripts/export_openapi.py` y commitear `frontend/openapi.json` (con endpoints aún por implementar declarados como stubs que devuelven `501`, para que A tenga el contrato completo). Avisar a A.
- [ ] **Step 6: Commit.**

---

### Task 3: Normalización y validación de CSV (dominio puro)

**Files:**
- Create: `backend/app/domain/normalize.py`, `backend/app/domain/csv_validation.py`
- Test: `backend/tests/test_csv_validation.py`

**Interfaces:**
- Produces: `normalize_email(s: str) -> str`; `course_key(name: str) -> str`; `parse_csv(data: bytes) -> list[str]` (lanza `CsvFormatError` con `reason`); `validate_rows(emails: list[str], known_students: dict[str, UUID], existing: set[tuple[UUID, str, date]], course_key: str, completion_date: date) -> list[RowIssue]`, con `RowIssue(row: int, email: str, reason: Literal["NO_ACCOUNT","DUPLICATE_IN_FILE","ALREADY_REQUESTED","INVALID_EMAIL"])`.

- [ ] **Step 1: Tests (uno por línea).** `test_bom_and_crlf_accepted`; `test_trailing_blank_line_ignored`; `test_header_only_rejected`; `test_empty_file_rejected`; `test_missing_email_column_rejected`; `test_101_rows_rejected`; `test_100_rows_accepted`; `test_email_case_and_spaces_normalized_before_duplicate_check` (`" A@x.com"` y `"a@x.com"` → `DUPLICATE_IN_FILE` en la segunda fila); `test_row_numbers_start_at_1_without_header`; `test_no_account`; `test_already_requested`; `test_invalid_email`; `test_all_issues_reported_not_only_first`; `test_course_key_collapses_spaces_and_casefolds` (`"  Intro   a  Python "` == `"intro a python"`).
- [ ] **Step 2:** Run; esperado FAIL.
- [ ] **Step 3:** Implementar. Usar el módulo `csv` de la biblioteca estándar y decodificar con `utf-8-sig`.
- [ ] **Step 4:** Run; esperado PASS.
- [ ] **Step 5: Commit.**

---

### Task 4: Datos sintéticos e `init`

**Files:**
- Create: `backend/app/entrypoints/init.py`, `backend/app/application/seed.py`
- Test: `backend/tests/test_seed.py`

**Interfaces:**
- Consumes: Task 1 (`declare_topology`, modelos).
- Produces: `seed(session) -> None` idempotente; comando `python -m app.entrypoints.init` que migra (Alembic `upgrade head`), siembra y declara topología.

- [ ] **Step 1: Tests.** `test_seed_creates_one_institution_one_operator_25_students` (`operador@demo.test`, `alumno01@demo.test`…`alumno25@demo.test`); `test_seed_twice_does_not_duplicate`; `test_seed_passwords_are_hashed_not_plaintext`.
- [ ] **Step 2:** Run; esperado FAIL.
- [ ] **Step 3:** Implementar `seed` con `INSERT … ON CONFLICT DO NOTHING` por email; contraseña de demo tomada de una variable `DEMO_PASSWORD` con valor por defecto documentado en `.env.example`.
- [ ] **Step 4:** Implementar `init.py` (migrar → sembrar → `declare_topology`); ejecutarlo dos veces seguidas; esperado: sin error ni duplicados.
- [ ] **Step 5: Commit.** Avisar a D: `init` listo para Compose.

---

### Task 5: `POST /api/batches` (aceptar lote)

**Files:**
- Create: `backend/app/application/accept_batch.py`, `backend/app/api/batches.py`
- Test: `backend/tests/test_accept_batch.py`

**Interfaces:**
- Consumes: Task 3 (`parse_csv`, `validate_rows`, `course_key`), Task 2 (`require_role`, `ApiError`).
- Produces: `accept_batch(session, operator_id: UUID, course_name: str, completion_date: date, csv_bytes: bytes, idempotency_key: str) -> AcceptResult(batch_id: UUID, status: str, total: int, replayed: bool)`; ruta `201` (nuevo) o `200` (repetido).

- [ ] **Step 1: Tests.**
  - `test_valid_batch_201_creates_batch_requests_outbox`: 20 emails → 20 `cert_requests` en `PENDING`, 20 filas de `outbox` con `published_at` nulo, respuesta `{batch_id, status:"IN_PROGRESS", total:20}`.
  - `test_same_key_same_content_returns_200_same_batch_no_new_rows`.
  - `test_same_key_different_csv_409_IDEMPOTENCY_CONFLICT`.
  - `test_missing_idempotency_key_400_nothing_created`.
  - `test_invalid_rows_400_lists_details_and_creates_nothing` (conteos de las 4 tablas intactos).
  - `test_already_requested_in_previous_batch_400`.
  - `test_concurrent_identical_pairs_one_wins_other_gets_400_ALREADY_REQUESTED` (dos hilos, restricción única como respaldo; el perdedor no deja filas huérfanas).
  - `test_student_token_403`.
  - `test_each_request_gets_its_own_correlation_id` (guardado en `outbox.correlation_id`, columna ya definida en §3 de contracts y creada en la migración de la Task 1).
- [ ] **Step 2:** Run; esperado FAIL.
- [ ] **Step 3:** Implementar `accept_batch` en una sola transacción. Capturar `IntegrityError` de la restricción única y convertirlo a `ApiError(400, "VALIDATION_ERROR", details=[ALREADY_REQUESTED…])`. Fingerprint según Global Constraints.
- [ ] **Step 4:** Run; esperado PASS.
- [ ] **Step 5: Commit.**

---

### Task 6: `GET /api/batches` y `GET /api/batches/{id}`

**Files:**
- Create/Modify: `backend/app/api/batches.py`, `backend/app/application/batch_status.py`
- Test: `backend/tests/test_batch_status.py`

**Interfaces:**
- Produces: `derive_batch_status(counts: Counts) -> Literal["IN_PROGRESS","COMPLETED","COMPLETED_WITH_ERRORS"]`; `GET /batches/{id}` con la forma de §5 (counts + items).

- [ ] **Step 1: Tests.** `test_status_in_progress_when_any_pending_or_processing`; `test_completed_when_all_issued`; `test_completed_with_errors_when_any_failed_and_none_open`; `test_detail_includes_last_error_and_attempts`; `test_other_operators_batch_404`; `test_list_most_recent_first`.
- [ ] **Step 2:** Run; esperado FAIL.
- [ ] **Step 3:** Implementar `derive_batch_status` pura y las consultas agregadas (un `GROUP BY status`).
- [ ] **Step 4:** Run; esperado PASS.
- [ ] **Step 5: Commit.**

---

### Task 7: Publicador del outbox

**Files:**
- Create: `backend/app/application/publish_outbox.py`, `backend/app/entrypoints/publisher.py`
- Test: `backend/tests/test_publisher.py` (RabbitMQ real)

**Interfaces:**
- Consumes: Task 1 (`declare_topology`, `connect`).
- Produces: `publish_pending(session, channel, batch_size: int = 50) -> int` (cantidad publicada); comando `python -m app.entrypoints.publisher` que repite con espera corta y reconecta ante errores.

- [ ] **Step 1: Tests.**
  - `test_publishes_pending_and_marks_published_after_confirm` (3 filas → 3 mensajes en `cert.issue` con `delivery_mode=2` y JSON `{request_id, correlation_id}`; `published_at` no nulo).
  - `test_second_run_publishes_nothing`.
  - `test_unroutable_message_is_not_marked_published` (usar `mandatory=True`; sin cola enlazada la fila sigue pendiente).
  - `test_broker_down_leaves_rows_pending_and_recovers` (detener RabbitMQ con Compose, ejecutar, volver a levantar, ejecutar: se publican).
  - `test_crash_between_publish_and_mark_may_republish_same_request_id` (simular excepción antes de marcar; el siguiente ciclo republica el mismo `request_id`, lo cual es aceptable por contrato).
- [ ] **Step 2:** Run; esperado FAIL.
- [ ] **Step 3:** Implementar con `confirm_delivery()` y `SELECT … FOR UPDATE SKIP LOCKED`. Marcar `published_at` solo tras la confirmación.
- [ ] **Step 4:** Run; esperado PASS.
- [ ] **Step 5: Commit.** Con esto y el worker de C se cierra la Integración 1.

---

### Task 8: Certificados del alumno y descarga

**Files:**
- Create: `backend/app/api/certificates.py`
- Test: `backend/tests/test_certificates_api.py`

**Interfaces:**
- Produces: `GET /me/certificates`, `GET /certificates/{id}/pdf` (`application/pdf`, `Content-Disposition: attachment`).

- [ ] **Step 1: Tests.** `test_student_lists_only_own_issued_certificates`; `test_student_downloads_own_pdf`; `test_student_other_students_pdf_404`; `test_pdf_not_yet_issued_404`; `test_operator_can_download_any_pdf_of_its_institution`; `test_operator_token_on_me_certificates_403`.
- [ ] **Step 2–4:** Run → FAIL → implementar → PASS.
- [ ] **Step 5: Commit.**

---

### Task 9: Verificación pública (consume el plan C)

**Files:**
- Create: `backend/app/api/verify.py`
- Test: `backend/tests/test_verify_api.py`

**Interfaces:**
- Consumes (del plan C): `get_public_certificate(session, registry, cert_id) -> PublicCertificate | None`; `verify_file(registry, cert_id, data: bytes) -> Literal["VALID","ALTERED","NOT_FOUND"]`; excepción `RegistryUnavailable`; `get_registry(settings) -> Registry`.
- Produces: `GET /verify/{cert_id}`, `POST /verify/{cert_id}/file` (límite 5 MB).

- [ ] **Step 1: Tests** con un registro falso inyectado mediante la dependencia de FastAPI. `test_registered_returns_public_fields_only` (las claves de la respuesta son exactamente `status, certificate_id, student_name, institution, course_name, completion_date`; no aparece el email); `test_unknown_id_404_not_found`; `test_malformed_uuid_404_or_422_envelope`; `test_registry_unavailable_503_not_confused_with_not_found`; `test_file_valid`; `test_file_altered`; `test_file_over_5mb_413_or_400`; `test_no_token_required`.
- [ ] **Step 2–4:** Run → FAIL → implementar delegando en las funciones de C → PASS.
- [ ] **Step 5: Commit.** Cuando C haya mergeado, reemplazar el registro falso por `get_registry` real y ejecutar la Integración 1.
