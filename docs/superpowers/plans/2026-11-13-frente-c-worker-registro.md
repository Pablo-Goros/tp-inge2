# Frente C — Emisión, registro y verificación: Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consumir solicitudes de emisión desde RabbitMQ y producir, sin duplicados, un PDF con QR registrado por su huella; exponer la lógica de verificación.

**Architecture:** El procesamiento vive en una función pura de AMQP (`process_request`) que opera sobre PostgreSQL y una interfaz `Registry`; un envoltorio fino de Pika traduce su resultado a ACK/nack/DLQ. El registro es una tabla de solo inserción detrás de una interfaz sustituible por blockchain.

**Tech Stack:** Python, SQLAlchemy, Pika, ReportLab, `qrcode`, pypdf (solo tests), pytest.

**Spec:** `docs/contracts.md` (v1.1, §3, §4, §6, §7, §8) y `docs/division-del-trabajo.md`.

**Dependencias con otros planes:**
- Parte del esqueleto del plan B (Task 1): modelos, `Settings`, `declare_topology`. Hasta que esté en `main`, esperar o trabajar sobre una rama de B.
- B consume de este plan: `get_public_certificate`, `verify_file`, `RegistryUnavailable`, `get_registry` (Tasks 1 y 3). Mantener esos nombres exactos.
- D usa `FAULT_INJECTION` (Task 4) para los escenarios de falla.

## Global Constraints

- El ACK es siempre el último paso. El mensaje solo lleva `request_id` y `correlation_id`; los datos se leen de PostgreSQL.
- Un solo worker, `prefetch_count=1`, ACK manual. `MAX_ATTEMPTS` por defecto 3; `RETRY_DELAY_SECONDS` por defecto 5.
- Los bytes del PDF se generan **una sola vez**, se guardan en `certificates.pdf` y el hash SHA-256 se calcula sobre esos bytes exactos. Ninguna fecha «ahora» dentro del PDF.
- El QR codifica `{PUBLIC_BASE_URL}/verify/{cert_id}` y no contiene el hash del PDF.
- `register(cert_id, sha256)` idempotente; mismo id con hash distinto lanza `RegistryConflict`. La verificación compara contra el registro, no contra `certificates`.
- Transitorio: error de conexión a PostgreSQL o al registro. Permanente: datos inválidos, error de generación de PDF o fallo `permanent` inyectado.
- Falla permanente o intentos agotados: marcar `FAILED` con `last_error`, **publicar a `certs` con clave `dlq` y luego ACK**.
- Pruebas contra PostgreSQL y RabbitMQ reales. Fallos inyectados deterministas, nunca aleatorios.
- La documentación y la defensa dicen «registro simulado»; no llamarlo blockchain.

## Review Focus

1. Caída del worker entre guardar el PDF y el ACK: la reentrega debe reutilizar los mismos bytes y dejar un solo certificado (Tasks 5 y 7).
2. Mismo mensaje entregado dos veces seguidas con la solicitud ya `ISSUED`: ACK sin efectos (Task 5).
3. Mensaje cuyo `request_id` no existe en la base, o JSON malformado: no debe quedar reencolándose en bucle; va a DLQ (Task 6).
4. Nombres con acentos, eñes o muy largos en el PDF: no rompen la generación (Task 2).
5. Registro caído al verificar: `RegistryUnavailable`, nunca «alterado» ni «no encontrado» (Task 3).

## File Structure

| Archivo | Responsabilidad |
| --- | --- |
| `backend/app/domain/registry.py` | `Registry` (Protocol), `RegistryConflict`, `RegistryUnavailable` |
| `backend/app/domain/errors.py` | `TransientError`, `PermanentError` |
| `backend/app/infrastructure/registry_simulated.py`, `registry_factory.py` | `SimulatedRegistry`, `get_registry(settings)` |
| `backend/app/infrastructure/pdf.py` | `CertificateData`, `build_verify_url`, `render_certificate` |
| `backend/app/application/verification.py` | `get_public_certificate`, `verify_file` |
| `backend/app/application/faults.py` | `FaultInjector` |
| `backend/app/application/issue_certificate.py` | `process_request` y `Outcome` |
| `backend/app/entrypoints/worker.py` | Bucle AMQP con reconexión |
| `backend/tests/` | Un archivo por módulo, más `test_worker_integration.py` |

---

### Task 1: Interfaz `Registry` y `SimulatedRegistry`

**Files:**
- Create: `backend/app/domain/registry.py`, `backend/app/infrastructure/registry_simulated.py`, `registry_factory.py`
- Test: `backend/tests/test_registry.py`

**Interfaces:**
- Produces: `class Registry(Protocol)` con `register(cert_id: UUID, sha256: str) -> None` y `lookup(cert_id: UUID) -> str | None`; `RegistryConflict`, `RegistryUnavailable`; `SimulatedRegistry(session_factory)`; `get_registry(settings: Settings) -> Registry` (`REGISTRY_BACKEND=simulated`; `chain` lanza `NotImplementedError` hasta la Task 8).

- [ ] **Step 1: Tests.** `test_register_then_lookup_returns_hash`; `test_register_same_pair_twice_is_noop` (una sola fila); `test_register_same_id_different_hash_raises_RegistryConflict` y el hash original sigue intacto; `test_lookup_unknown_returns_None`; `test_db_connection_error_maps_to_RegistryUnavailable` (engine apuntando a un puerto cerrado); `test_simulated_registry_exposes_no_update_or_delete_methods`.
- [ ] **Step 2:** Run `pytest backend/tests/test_registry.py -v`; esperado FAIL.
- [ ] **Step 3:** Implementar con `INSERT … ON CONFLICT (cert_id) DO NOTHING` y comparación posterior del hash; mapear `OperationalError` a `RegistryUnavailable`.
- [ ] **Step 4:** Run; esperado PASS.
- [ ] **Step 5: Commit.** Avisar a B: la interfaz ya está.

---

### Task 2: PDF con QR

**Files:**
- Create: `backend/app/infrastructure/pdf.py`
- Test: `backend/tests/test_pdf.py`

**Interfaces:**
- Produces: `@dataclass CertificateData(cert_id: UUID, institution: str, student_name: str, course_name: str, completion_date: date, verify_url: str)`; `build_verify_url(public_base_url: str, cert_id: UUID) -> str`; `render_certificate(data: CertificateData) -> bytes`.

- [ ] **Step 1: Tests.** `test_build_verify_url_joins_without_double_slash` (`"http://x:8080/"` y sin barra dan el mismo resultado, forma `…/verify/<uuid>`); `test_pdf_starts_with_pdf_magic_and_is_nonempty`; `test_render_is_deterministic` (dos llamadas con la misma entrada → bytes idénticos; usar `invariant=True` de ReportLab); `test_text_contains_student_course_institution_date_and_id` (extraer con pypdf); `test_accents_enye_and_long_names_render` (`"Ñandú Pérez-Gómez …"` de 120 caracteres no lanza); `test_qr_encodes_verify_url_not_hash` (el texto que recibe `qrcode` es `verify_url`; comprobar con un spy sobre la función de generación); `test_different_cert_id_gives_different_bytes`.
- [ ] **Step 2:** Run; esperado FAIL.
- [ ] **Step 3:** Implementar `render_certificate` con ReportLab en A4, QR por `qrcode` insertado como imagen en memoria; ajustar o truncar visualmente nombres largos sin cambiar los datos guardados.
- [ ] **Step 4:** Run; esperado PASS.
- [ ] **Step 5: Commit.**

---

### Task 3: Casos de uso de verificación

**Files:**
- Create: `backend/app/application/verification.py`
- Test: `backend/tests/test_verification.py`

**Interfaces:**
- Consumes: Task 1.
- Produces: `@dataclass PublicCertificate(certificate_id: UUID, student_name: str, institution: str, course_name: str, completion_date: date)`; `get_public_certificate(session, registry: Registry, cert_id: UUID) -> PublicCertificate | None`; `verify_file(registry: Registry, cert_id: UUID, data: bytes) -> Literal["VALID","ALTERED","NOT_FOUND"]`.

- [ ] **Step 1: Tests.** `test_valid_when_hash_matches_registry`; `test_altered_when_one_byte_changes`; `test_not_found_when_id_not_registered`; `test_verify_uses_registry_not_certificates_table` (modificar `certificates.sha256` en la base no cambia el resultado); `test_registry_unavailable_propagates_not_swallowed`; `test_public_certificate_has_no_email_field` (el dataclass no tiene atributo `email`); `test_public_certificate_none_when_not_registered`.
- [ ] **Step 2:** Run; esperado FAIL.
- [ ] **Step 3:** Implementar. `verify_file` calcula SHA-256 y llama `registry.lookup`.
- [ ] **Step 4:** Run; esperado PASS.
- [ ] **Step 5: Commit.** Avisar a B.

---

### Task 4: Inyección de fallos

**Files:**
- Create: `backend/app/application/faults.py`
- Test: `backend/tests/test_faults.py`

**Interfaces:**
- Produces: `FaultInjector.parse(spec: str) -> FaultInjector`; `before_register(email: str) -> None` (lanza `TransientError` o `PermanentError` según la configuración, cuenta las veces).

- [ ] **Step 1: Tests.** `test_empty_spec_never_fails`; `test_transient_n_fails_n_times_then_passes` (`"transient:2"`); `test_permanent_email_fails_only_that_student` (`"permanent:alumno03@demo.test"`); `test_combined_spec_comma_separated`; `test_invalid_spec_raises_ValueError`.
- [ ] **Step 2–4:** Run → FAIL → implementar → PASS.
- [ ] **Step 5: Commit.**

---

### Task 5: `process_request` (núcleo idempotente)

**Files:**
- Create: `backend/app/domain/errors.py`, `backend/app/application/issue_certificate.py`
- Test: `backend/tests/test_issue_certificate.py`

**Interfaces:**
- Consumes: Tasks 1, 2, 4 y los modelos del plan B.
- Produces: `class Outcome(Enum): DONE, RETRY, FAILED`; `process_request(session_factory, registry: Registry, request_id: UUID, *, max_attempts: int, faults: FaultInjector, public_base_url: str) -> Outcome`.

- [ ] **Step 1: Tests** (PostgreSQL real, registro simulado real salvo indicación).
  - `test_happy_path_issues_stores_pdf_hash_registers_and_returns_DONE` (`status=ISSUED`, `certificates.sha256` == SHA-256 del `pdf`, `registry.lookup` == ese hash, `attempts == 1`).
  - `test_already_issued_is_noop_DONE_without_touching_certificate_or_registry`.
  - `test_already_failed_is_noop_DONE`.
  - `test_unknown_request_id_returns_FAILED_without_exception`.
  - `test_crash_after_pdf_saved_then_redelivery_reuses_same_bytes_and_hash` (hacer fallar el registro una vez con `RegistryUnavailable`; segunda llamada: mismos bytes, un solo registro en `certificates`, un solo registro en `registry`).
  - `test_crash_after_register_before_issued_then_redelivery_ends_ISSUED_once` (excepción forzada tras `register`; reintento con el mismo hash es no-op en el registro).
  - `test_transient_below_max_returns_RETRY_and_status_PENDING_with_attempts_incremented`.
  - `test_transient_at_max_attempts_returns_FAILED_with_last_error`.
  - `test_permanent_returns_FAILED_immediately_with_last_error`.
  - `test_registry_conflict_is_permanent`.
  - `test_failure_of_one_request_does_not_change_other_requests_in_batch`.
- [ ] **Step 2:** Run; esperado FAIL.
- [ ] **Step 3:** Implementar siguiendo el algoritmo de §4 de contracts (pasos 1 a 6 sin el ACK). Cada fase en su propia transacción corta, de modo que el PDF queda persistido antes de llamar al registro. Mapear excepciones a `TransientError`/`PermanentError`.
- [ ] **Step 4:** Run; esperado PASS.
- [ ] **Step 5: Commit.**

---

### Task 6: Envoltorio AMQP del worker

**Files:**
- Create: `backend/app/entrypoints/worker.py`
- Test: `backend/tests/test_worker_integration.py` (RabbitMQ y PostgreSQL reales)

**Interfaces:**
- Consumes: Task 5, `declare_topology` y `connect` del plan B.
- Produces: `handle_message(channel, method, properties, body, *, deps) -> None` (lógica de ACK/nack/DLQ); comando `python -m app.entrypoints.worker` con reconexión y `prefetch_count=1`.

- [ ] **Step 1: Tests.**
  - `test_done_acks_message_and_queue_is_empty`.
  - `test_retry_nacks_without_requeue_and_message_returns_after_delay` (`RETRY_DELAY_SECONDS=1`; el mismo `request_id` reaparece en `cert.issue`).
  - `test_failed_publishes_to_dlq_then_acks` (mensaje en `cert.issue.dlq`, ninguno en `cert.issue`).
  - `test_malformed_json_goes_to_dlq_not_requeued_forever`.
  - `test_unknown_request_id_goes_to_dlq`.
  - `test_ack_happens_after_status_ISSUED_is_committed` (leer el estado desde otra conexión dentro del callback de ACK).
  - `test_worker_reconnects_after_broker_restart` (reiniciar RabbitMQ con Compose; publicar; el worker consume).
- [ ] **Step 2:** Run; esperado FAIL.
- [ ] **Step 3:** Implementar `handle_message` traduciendo `Outcome`: `DONE` → `basic_ack`; `RETRY` → `basic_nack(requeue=False)`; `FAILED` → `basic_publish(exchange="certs", routing_key="dlq", persistent)` y luego `basic_ack`. Si falla el traslado a DLQ, el error queda en la base y se loguea con `correlation_id`.
- [ ] **Step 4:** Run; esperado PASS.
- [ ] **Step 5: Commit.** Con Task 7 de B se cierra la Integración 1.

---

### Task 7: Escenario de caída y reentrega

**Files:**
- Test: `backend/tests/test_worker_crash.py`

- [ ] **Step 1: Tests de proceso real.** `test_kill_worker_mid_batch_then_restart_finishes_20_without_duplicates` (publicar 20 solicitudes, matar el proceso tras algunas, reiniciar, esperar; `COUNT(certificates) == 20`, `COUNT(DISTINCT cert_id) == 20`, 20 filas en `registry`, ninguna solicitud en `PROCESSING`); `test_message_redelivered_after_unacked_kill`.
- [ ] **Step 2:** Run; si falla, corregir en Task 5 o 6, no aquí.
- [ ] **Step 3: Commit.** Entregar el comando a D para sus escenarios.

---

### Task 8 (EXTRA, opcional): Migración a `BlockchainRegistry`

**Decisión:** el 15/11 el grupo decide si se ejecuta (condiciones en `docs/division-del-trabajo.md`). Si no, el registro simulado queda congelado y se declara como tal.

**Files:**
- Create: `contracts/CertRegistry.sol`, `contracts/test/`, `backend/app/infrastructure/registry_chain.py`
- Modify: `registry_factory.py`, `compose.yaml` (con D), imagen para compilar el contrato
- Test: `backend/tests/test_registry_chain.py`

**Interfaces:**
- Produces: `BlockchainRegistry(web3_url, contract_address, account)` que implementa `Registry`; contrato con `register(bytes32 id, bytes32 hash)` (solo emisor autorizado, idempotente, hash distinto revierte) y `lookup(bytes32 id) -> bytes32`.

- [ ] **Step 1: Tests de contrato y adaptador.** Los mismos de la Task 1 (parametrizar `test_registry.py` sobre ambas implementaciones), más `test_node_down_raises_RegistryUnavailable`, `test_register_after_timeout_checks_chain_before_resending` y `test_only_issuer_account_can_register`.
- [ ] **Step 2:** Run; esperado FAIL.
- [ ] **Step 3:** Contrato mínimo; compilación dentro de la imagen; despliegue idempotente en `init` (guardar dirección, comprobar que exista en la red); `anvil` con estado persistente. Un solo worker (nonces).
- [ ] **Step 4:** Run; PASS. Ejecutar los escenarios de D con `REGISTRY_BACKEND=chain`.
- [ ] **Step 5: Commit.** Si algo falla el 16/11, volver a `simulated` sin tocar a A ni B.
