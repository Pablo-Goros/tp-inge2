# Frente A — Frontend React: Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Interfaz web para operador (cargar lote, ver avance), alumno («Mis certificados») y verificación pública, independiente del backend hasta la integración.

**Architecture:** SPA React + TypeScript construida con Vite y servida por Nginx, que también reenvía `/api` a FastAPI. Todo el desarrollo y las pruebas usan un servidor mock (MSW) con los ejemplos de `docs/contracts.md`; no hay lógica de emisión en el navegador.

**Tech Stack:** React, TypeScript, Vite, React Router, Vitest, Testing Library, MSW. Fijar versiones al iniciar; nunca `latest`.

**Spec:** `docs/contracts.md` (v1.1, §2 y §5) y `docs/division-del-trabajo.md`.

**Dependencias con otros planes:** ninguna para empezar. B publica `frontend/openapi.json` en su Task 2; usarlo en la Task 7 para contrastar los tipos. `web` en Compose lo integra D.

## Global Constraints

- Todas las llamadas van a `/api/*` (mismo origen); el token en `Authorization: Bearer <jwt>`.
- Errores del backend con forma `{ "error": { "code", "message", "details" } }`; el cliente los convierte en `ApiError`.
- Roles `operator` y `student`; el frontend solo oculta rutas, el backend decide. Un `401` en cualquier llamada cierra la sesión y lleva a login.
- `Idempotency-Key` en `POST /batches`: una clave por intento de envío, reutilizada en los reintentos del mismo formulario.
- Consulta de avance cada 2 s mientras el lote esté `IN_PROGRESS`; se detiene en estado terminal y al salir de la pantalla.
- Descarga de PDF mediante `fetch` con token y `Blob` (un enlace directo no envía la cabecera).
- La verificación pública no pide sesión. «No se pudo verificar» (503) debe verse distinto de «no registrado» y de «alterado».
- Nunca mostrar el email del alumno en las pantallas públicas.
- Pruebas con Vitest + MSW; sin llamadas reales a la red.

## Review Focus

1. Token vencido o `401` a mitad de una pantalla: volver a login sin pantalla rota (Task 2).
2. Doble clic en «Emitir»: un solo `POST` y una sola clave de idempotencia (Task 3).
3. CSV con errores: mostrar todas las filas con su motivo en lenguaje claro, no solo la primera (Task 3).
4. Lote con certificados `FAILED`: se ve cuál y por qué, y el polling termina igual (Task 4).
5. Verificación con el servicio caído (503): mensaje «no se pudo verificar», nunca «inválido» (Task 6).

## File Structure

| Archivo | Responsabilidad |
| --- | --- |
| `frontend/src/api/client.ts`, `types.ts` | `apiFetch`, `ApiError`, tipos de §5 |
| `frontend/src/api/mocks/` | Handlers MSW con los JSON de contracts |
| `frontend/src/features/session/` | `AuthProvider`, `useAuth`, `RequireRole`, `LoginPage` |
| `frontend/src/features/operator/` | `NewBatchPage`, `BatchDetailPage`, `BatchListPage`, `usePollBatch` |
| `frontend/src/features/student/` | `MyCertificatesPage` |
| `frontend/src/features/verify/` | `VerifyPage` |
| `frontend/Dockerfile`, `frontend/nginx.conf` | Build Vite y Nginx con proxy `/api` |

---

### Task 1: Andamiaje, cliente HTTP y mocks

**Files:**
- Create: `frontend/` (Vite React-TS), `src/api/client.ts`, `src/api/types.ts`, `src/api/mocks/handlers.ts`, `src/api/client.test.ts`, `Dockerfile`, `nginx.conf`

**Interfaces:**
- Produces: `class ApiError extends Error { status: number; code: string; details: unknown }`; `apiFetch<T>(path: string, init?: RequestInit & { json?: unknown; form?: FormData }): Promise<T>` (agrega token desde el almacenamiento de sesión, prefijo `/api`, lanza `ApiError`); tipos `LoginResponse`, `BatchSummary`, `BatchDetail`, `CertificateItem`, `PublicCertificate`, `VerifyResult`.

- [ ] **Step 1: Tests.** `test_apiFetch_sends_bearer_token_when_present`; `test_apiFetch_parses_error_envelope_into_ApiError` (400 con `details`); `test_apiFetch_401_triggers_onUnauthorized_callback`; `test_apiFetch_network_failure_throws_ApiError_with_code_NETWORK`.
- [ ] **Step 2:** Run `npm test -- client`; esperado FAIL.
- [ ] **Step 3:** Implementar y escribir los handlers MSW con los ejemplos exactos de §5 (login, batches, detail, me/certificates, verify).
- [ ] **Step 4:** Run; esperado PASS. `npm run dev` arranca contra los mocks.
- [ ] **Step 5:** `nginx.conf` sirve `dist/` con fallback a `index.html` y `location /api/ { proxy_pass http://api:8000; }`; Dockerfile de dos etapas (Node para construir, Nginx para servir). Verificar `docker build frontend`.
- [ ] **Step 6: Commit.** Avisar a D: imagen `web` lista.

---

### Task 2: Sesión, login y rutas por rol

**Files:**
- Create: `src/features/session/AuthProvider.tsx`, `LoginPage.tsx`, `RequireRole.tsx`, tests

**Interfaces:**
- Produces: `useAuth(): { user: { name: string; role: "operator"|"student" } | null; login(email, password): Promise<void>; logout(): void }`; `<RequireRole role="operator">` redirige a `/login`; tras login, operador → `/operator/batches`, alumno → `/student/certificates`.

- [ ] **Step 1: Tests.** `test_login_success_redirects_by_role` (ambos roles); `test_login_wrong_password_shows_message_and_stays`; `test_student_visiting_operator_route_redirected`; `test_unauthorized_response_clears_session_and_redirects_to_login`; `test_session_survives_reload` (token en `sessionStorage`; envolver lecturas en try/catch).
- [ ] **Step 2:** Run; esperado FAIL.
- [ ] **Step 3:** Implementar con contexto de React y `RequireRole`.
- [ ] **Step 4:** Run; esperado PASS.
- [ ] **Step 5: Commit.**

---

### Task 3: Operador — formulario de nuevo lote

**Files:**
- Create: `src/features/operator/NewBatchPage.tsx`, `errorRows.ts`, tests

**Interfaces:**
- Produces: `NewBatchPage` (campos `course_name`, `completion_date`, archivo CSV); `describeIssue(reason: "NO_ACCOUNT"|"DUPLICATE_IN_FILE"|"ALREADY_REQUESTED"|"INVALID_EMAIL"): string` con texto en español; al éxito navega a `/operator/batches/:id`.

- [ ] **Step 1: Tests.** `test_submit_sends_multipart_with_idempotency_key_header`; `test_double_click_sends_single_request`; `test_retry_after_network_error_reuses_same_key`; `test_new_attempt_after_success_uses_new_key`; `test_validation_error_lists_every_row_with_reason_text` (3 filas con 3 motivos distintos visibles, sin navegar); `test_required_fields_block_submit_without_request`; `test_idempotency_conflict_409_shows_clear_message`.
- [ ] **Step 2:** Run; esperado FAIL.
- [ ] **Step 3:** Implementar. Generar la clave con `crypto.randomUUID()` al montar el formulario y regenerarla solo tras éxito o al cambiar un campo.
- [ ] **Step 4:** Run; esperado PASS.
- [ ] **Step 5: Commit.**

---

### Task 4: Operador — avance del lote y listado

**Files:**
- Create: `src/features/operator/BatchDetailPage.tsx`, `BatchListPage.tsx`, `usePollBatch.ts`, tests

**Interfaces:**
- Produces: `usePollBatch(id: string, intervalMs = 2000): { data: BatchDetail | undefined; error: ApiError | null }` (para al llegar a `COMPLETED` o `COMPLETED_WITH_ERRORS`, y al desmontar).

- [ ] **Step 1: Tests (reloj falso).** `test_polls_every_2s_while_in_progress`; `test_stops_polling_on_completed`; `test_stops_polling_on_completed_with_errors`; `test_stops_polling_on_unmount`; `test_failed_item_shows_status_attempts_and_last_error`; `test_counts_bar_matches_counts_from_api`; `test_other_operators_batch_404_shows_not_found`; `test_list_shows_most_recent_first`.
- [ ] **Step 2:** Run; esperado FAIL.
- [ ] **Step 3:** Implementar con `setTimeout` recursivo (no `setInterval`) para no solapar peticiones lentas.
- [ ] **Step 4:** Run; esperado PASS.
- [ ] **Step 5: Commit.**

---

### Task 5: Alumno — «Mis certificados»

**Files:**
- Create: `src/features/student/MyCertificatesPage.tsx`, `downloadPdf.ts`, tests

**Interfaces:**
- Produces: `downloadPdf(certificateId: string, filename: string): Promise<void>` (fetch con token → `Blob` → descarga).

- [ ] **Step 1: Tests.** `test_lists_certificates_with_course_and_date`; `test_empty_state_message_when_none`; `test_download_calls_pdf_endpoint_with_bearer_and_triggers_save`; `test_download_404_shows_error_message_not_blank_page`.
- [ ] **Step 2–4:** Run → FAIL → implementar → PASS.
- [ ] **Step 5: Commit.**

---

### Task 6: Verificación pública

**Files:**
- Create: `src/features/verify/VerifyPage.tsx`, tests

**Interfaces:**
- Produces: ruta pública `/verify/:certId` (destino del QR) que muestra los datos registrados y permite subir el PDF; resultados `VALID`, `ALTERED`, `NOT_FOUND`, `UNAVAILABLE` con mensajes y estilos distintos.

- [ ] **Step 1: Tests.** `test_shows_registered_data_without_email`; `test_unknown_id_shows_not_registered`; `test_upload_valid_shows_match_message`; `test_upload_altered_shows_altered_message_and_asks_for_original_file`; `test_503_shows_could_not_verify_distinct_from_altered`; `test_no_token_sent_on_public_calls`; `test_non_pdf_file_rejected_client_side`.
- [ ] **Step 2–4:** Run → FAIL → implementar → PASS.
- [ ] **Step 5: Commit.**

---

### Task 7: Integración con el backend real

**Files:**
- Modify: `src/api/types.ts`, `vite.config.ts`
- Test: `frontend/e2e-checklist.md` (lista manual, sin framework E2E)

- [ ] **Step 1:** Contrastar `types.ts` con `frontend/openapi.json` (exportado por B); corregir diferencias y avisar a B de cualquier discrepancia de contrato en lugar de adaptarse en silencio.
- [ ] **Step 2:** Configurar `vite.config.ts` con proxy de `/api` al backend local para desarrollo.
- [ ] **Step 3:** Recorrer a mano con Compose levantado y registrar en `e2e-checklist.md` el resultado de: login operador → subir `lote-20.csv` → ver avance → login alumno → descargar PDF → escanear/abrir URL del QR → verificar original y alterado.
- [ ] **Step 4: Commit.** Integración 2 hecha cuando todos los ítems estén marcados.
