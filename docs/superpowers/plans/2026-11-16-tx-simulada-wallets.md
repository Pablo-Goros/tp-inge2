# Transacción simulada con wallets: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada emisión registra una transferencia simulada institución→alumno con `tx_hash` único; el QR del PDF apunta a `etherscan.io/tx/<tx_hash>`; un endpoint dice de quién a quién fue un PDF dado; el alta de alumno pide wallet.

**Architecture:** Se amplía `registry` (y `certificates`, para que un reintento reuse el mismo hash) con `tx_hash`/`from_address`/`to_address`. El worker genera el `tx_hash` antes de renderizar el PDF. `users.wallet_address` es opcional en base y obligatorio en el alta de Google. Un endpoint público `POST /api/verify/by-file` busca por SHA-256.

**Tech Stack:** Python 3 / FastAPI / SQLAlchemy / Alembic / pytest (backend); React / TypeScript / vitest (frontend).

**Spec:** `docs/superpowers/specs/2026-11-16-tx-simulada-wallets-design.md`

## Global Constraints

- Wallet: regex `^0x[0-9a-fA-F]{40}$`; se guarda en **minúsculas**; única entre usuarios (los null no cuentan).
- `tx_hash`: `"0x" + secrets.token_hex(32)`; único en `registry`.
- URL del QR: `https://etherscan.io/tx/<tx_hash>`. Los certificados sin tx siguen usando `<PUBLIC_BASE_URL>/verify/<cert_id>`.
- El PDF rotula la transacción como **"Transacción simulada"**; docs y UI nunca la llaman blockchain real (`contracts.md` §7).
- Variable `ISSUER_WALLET`, valor por defecto `"0x" + "5eed" * 10`.
- Errores con el sobre existente (`ApiError`, códigos de `schemas.ErrorBody`); validación = 400 `VALIDATION_ERROR`.
- Migraciones y filas viejas: todas las columnas nuevas son `nullable`.
- Tests de backend requieren la infra: `docker compose -f backend/tests/docker-compose.test.yml up -d --wait`; se corren desde `backend/` con `pytest`. Frontend: `npx vitest run <archivo>` y `npm run typecheck` desde `frontend/`.
- Commits convencionales, terminados con `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Rama de trabajo nueva a partir de la actual.

## Review Focus

1. Wallet con mayúsculas, espacios alrededor, sin `0x` o de 39/41 dígitos: las inválidas dan 400; las válidas se guardan normalizadas en minúsculas. (Task 5)
2. Dos alumnos con la misma wallet, también en carrera: el segundo recibe 400, nunca 500. (Task 5)
3. Reintento del worker tras fallo del registro: mismo `tx_hash`, PDF no regenerado, sin segundo `registry`. (Task 4)
4. Alumno sin wallet: la solicitud queda `FAILED` con mensaje claro; no se crea PDF ni fila de registro. (Task 4)
5. `by-file` con archivo de 5 242 881 bytes → 400; PDF alterado o desconocido → 404; PDF de certificado viejo sin tx → 200 con `tx_hash`, `from` y `to` en `null`. (Task 6)

---

### Task 1: Utilidades de wallet y tx

**Files:**
- Create: `backend/app/domain/wallet.py`
- Test: `backend/tests/test_wallet.py`

**Interfaces:**
- Produces:
  - `normalize_wallet(value: str) -> str`: `strip()`, valida con la regex, devuelve en minúsculas; `ValueError` si es inválida.
  - `new_tx_hash() -> str`
  - `etherscan_tx_url(tx_hash: str) -> str`
  - `demo_wallet(email: str) -> str`: `"0x" + sha256(email.encode()).hexdigest()[:40]` (determinista).
  - `DEFAULT_ISSUER_WALLET: str`

- [ ] **Step 1: Tests** `test_normalize_wallet_lowercases_and_strips`, `test_normalize_wallet_rejects` (parametrizado: sin `0x`, 39 dígitos, 41 dígitos, caracteres no hex, vacío), `test_new_tx_hash_shape_and_uniqueness` (`^0x[0-9a-f]{64}$`, dos llamadas distintas), `test_etherscan_tx_url` (`https://etherscan.io/tx/0xab…`), `test_demo_wallet_is_deterministic_and_valid`.
- [ ] **Step 2:** `pytest tests/test_wallet.py -v` → FAIL (módulo inexistente).
- [ ] **Step 3:** Implementar `backend/app/domain/wallet.py` con las firmas de arriba.
- [ ] **Step 4:** `pytest tests/test_wallet.py -v` → PASS.
- [ ] **Step 5:** Commit `feat: utilidades de wallet y tx simulada`.

### Task 2: Esquema, modelos, config y seed

**Files:**
- Create: `backend/migrations/versions/0004_wallets_and_tx.py`
- Modify: `backend/app/infrastructure/models.py`, `backend/app/config.py`, `backend/app/application/seed.py`, `backend/tests/conftest.py` (fixtures `users` y `issuance_db.make`), `.env.example`
- Test: `backend/tests/test_models.py`, `backend/tests/test_seed.py`, `backend/tests/test_config.py`

**Interfaces:**
- Consumes: Task 1 `normalize_wallet`, `demo_wallet`, `DEFAULT_ISSUER_WALLET`.
- Produces:
  - `User.wallet_address: Mapped[str | None]` (único cuando no es null, índice `uq_users_wallet_address`).
  - `Certificate.tx_hash`, `Certificate.from_address`, `Certificate.to_address`: `Mapped[str | None]`.
  - `RegistryEntry.tx_hash` (único, `uq_registry_tx_hash`), `.from_address`, `.to_address`: `Mapped[str | None]`; índice `ix_registry_sha256` sobre `sha256`.
  - `Settings.issuer_wallet: str` (default `DEFAULT_ISSUER_WALLET`, validado y normalizado con `normalize_wallet`).

- [ ] **Step 1: Tests**
  - `test_user_wallet_is_unique_but_nullable`: dos usuarios con `wallet_address=None` conviven; dos con la misma wallet → `IntegrityError`.
  - `test_registry_tx_hash_is_unique`.
  - `test_seed_assigns_demo_wallets`: tras `seed`, los 26 usuarios tienen `demo_wallet(email)`; al re-ejecutar no cambia nada y un usuario existente con wallet `None` la recibe (backfill), pero uno con wallet propia no la pierde.
  - `test_issuer_wallet_default_and_validation` en `test_config.py`: valor por defecto válido; `ISSUER_WALLET=basura` → `ValidationError`.
- [ ] **Step 2:** Correr esos tests → FAIL.
- [ ] **Step 3:** Migración `0004` (`down_revision = "0003"`) con `upgrade`/`downgrade` simétricos; modelos y `Settings` según Interfaces; `seed` pasa `wallet_address=demo_wallet(email)` en las filas nuevas y hace `UPDATE users SET wallet_address=… WHERE wallet_address IS NULL` por email para las existentes. En `conftest.py`, `users` e `issuance_db.make` crean los alumnos con `wallet_address=demo_wallet(email)` para no romper los tests de emisión existentes. Agregar `ISSUER_WALLET` a `.env.example`.
- [ ] **Step 4:** `pytest tests/ -v -x --ignore=tests/test_worker_crash.py --ignore=tests/test_worker_recovery.py` → PASS (esos dos usan procesos externos; correrlos al final de Task 4).
- [ ] **Step 5:** Commit `feat: columnas de wallet y tx, issuer_wallet y seed`.

### Task 3: Registry con transferencia

**Files:**
- Modify: `backend/app/domain/registry.py`, `backend/app/infrastructure/registry_simulated.py`
- Test: `backend/tests/test_registry.py`

**Interfaces:**
- Consumes: Task 2 modelos.
- Produces:
  - `@dataclass(frozen=True) class Transfer: tx_hash: str; from_address: str; to_address: str`
  - `@dataclass(frozen=True) class RegistryRecord: cert_id: UUID; sha256: str; transfer: Transfer | None`
  - `Registry.register(self, cert_id: UUID, sha256: str, transfer: Transfer | None = None) -> None`
  - `Registry.lookup(cert_id) -> str | None` (sin cambios)
  - `Registry.find_by_sha256(self, sha256: str) -> RegistryRecord | None`

- [ ] **Step 1: Tests** (en `test_registry.py`, mismo estilo de limpieza que el test existente)
  - `test_register_with_transfer_is_idempotent`: dos llamadas iguales → una fila, `find_by_sha256` devuelve `RegistryRecord` con el `Transfer`.
  - `test_register_conflicts_when_transfer_differs`: mismo `cert_id` y `sha256`, otro `tx_hash` → `RegistryConflict`; la fila original no cambia.
  - `test_duplicate_tx_hash_on_other_cert_conflicts`: otro `cert_id` con el mismo `tx_hash` → `RegistryConflict`.
  - `test_register_without_transfer_keeps_legacy_behavior`: sin `transfer`, `find_by_sha256` devuelve `transfer=None`; un re-registro con transfer sobre una fila legacy **no** la modifica ni falla.
  - `test_find_by_sha256_unknown_returns_none`.
  - Actualizar `test_registry_connection_failure_is_unavailable` para cubrir `find_by_sha256` → `RegistryUnavailable`.
- [ ] **Step 2:** `pytest tests/test_registry.py -v` → FAIL.
- [ ] **Step 3:** Implementar. `IntegrityError` por `uq_registry_tx_hash` se traduce a `RegistryConflict`; `OperationalError`/`InterfaceError` siguen siendo `RegistryUnavailable`.
- [ ] **Step 4:** `pytest tests/test_registry.py -v` → PASS.
- [ ] **Step 5:** Commit `feat: el registro guarda la transferencia simulada`.

### Task 4: Emisión con tx, PDF y QR a Etherscan

**Files:**
- Modify: `backend/app/application/issue_certificate.py`, `backend/app/infrastructure/pdf.py`, `backend/app/entrypoints/worker.py`
- Test: `backend/tests/test_issue_certificate.py`, `backend/tests/test_pdf.py`, `backend/tests/test_worker_integration.py`

**Interfaces:**
- Consumes: Task 1 (`new_tx_hash`, `etherscan_tx_url`, `DEFAULT_ISSUER_WALLET`), Task 2 modelos, Task 3 `Transfer` y `register`.
- Produces:
  - `CertificateData.tx_hash: str | None = None` (campo nuevo al final). Cuando es no nulo, `verify_url` ya contiene la URL de Etherscan; el QR y el link siguen usando `verify_url` (no cambia `render_certificate`).
  - `process_request(..., public_base_url: str, issuer_wallet: str = DEFAULT_ISSUER_WALLET) -> Outcome`; el worker pasa `deps.settings.issuer_wallet`.

- [ ] **Step 1: Tests**
  - PDF (`test_pdf.py`): con `tx_hash` el texto extraído con `pypdf` contiene el `tx_hash` y "Transacción simulada", y el QR/link codifican `data.verify_url`; sin `tx_hash` el PDF no contiene "Transacción simulada" (certificados viejos).
  - `test_issue_registers_transfer_and_qr_points_to_etherscan`: tras emitir, `registry.find_by_sha256` devuelve `Transfer(tx_hash, issuer_wallet, wallet_del_alumno)`; el `Certificate` guarda los mismos tres valores; el PDF contiene el `tx_hash`.
  - `test_retry_reuses_same_tx_hash_without_rerendering`: un registry que falla una vez con `RegistryUnavailable` y luego funciona; el segundo intento no regenera el PDF y registra el mismo `tx_hash` (`Certificate.tx_hash` inmutable entre intentos).
  - `test_student_without_wallet_fails_permanently`: solicitud `FAILED`, `last_error == "El alumno no tiene wallet registrada"`, sin fila en `certificates` ni en `registry`.
- [ ] **Step 2:** Correr → FAIL.
- [ ] **Step 3:** `_prepare` suma `User.wallet_address` al select y devuelve además el `Transfer` a registrar (`None` si no corresponde). Si el `Certificate` ya existe, el transfer sale de sus columnas (si son null, queda `None`); si no existe, exige wallet (`PermanentError`), genera `new_tx_hash()` y construye `CertificateData` con `tx_hash` y `verify_url=etherscan_tx_url(tx_hash)`. Al persistir el `Certificate` se guardan `tx_hash`, `from_address=issuer_wallet`, `to_address=wallet`. `registry.register(request_id, digest, transfer)`. El PDF agrega una línea corta con el `tx_hash` y "Transacción simulada" sin desplazar el resto del diploma.
- [ ] **Step 4:** `pytest tests/ -v` completo (incluye los de worker) → PASS.
- [ ] **Step 5:** Commit `feat: emisión con tx simulada y QR a Etherscan`.

### Task 5: Alta con wallet y actualización de wallet

**Files:**
- Create: `backend/app/api/me.py`
- Modify: `backend/app/api/auth.py`, `backend/app/api/main.py` (incluir el router), `backend/app/api/schemas.py`
- Test: `backend/tests/test_google_auth.py`, `backend/tests/test_auth.py`, create `backend/tests/test_me_wallet.py`

**Interfaces:**
- Consumes: Task 1 `normalize_wallet`, Task 2 `User.wallet_address`.
- Produces:
  - `GoogleSignupRequest.wallet_address: str` (obligatorio; validador con `normalize_wallet`, `ValueError` → 400 `VALIDATION_ERROR` por el handler existente).
  - `LoginResponse.wallet_address: str | None = None`, llenado en `/auth/login`, `/auth/google` y `/auth/google/signup`.
  - `PUT /api/me/wallet` (solo `student`), body `{wallet_address: str}` → `200 {"wallet_address": "<normalizada>"}`; 401/403 como el resto.

- [ ] **Step 1: Tests**
  - signup: con wallet válida crea alumno con wallet en minúsculas y la devuelve; sin wallet → 400; inválida (parametrizar los casos del Review Focus 1) → 400; wallet ya usada por otro → 400 `VALIDATION_ERROR` (nunca 500); usuario existente (signup = login) conserva su wallet aunque se envíe otra.
  - `test_wallet_unique_race_returns_400`: forzar `IntegrityError` en el commit con la wallet duplicada y email distinto → 400.
  - login con email/clave y con Google devuelven `wallet_address` (`None` si no tiene).
  - `PUT /me/wallet`: alumno actualiza; duplicada → 400; inválida → 400; operador → 403; sin token → 401.
- [ ] **Step 2:** Correr → FAIL.
- [ ] **Step 3:** En `signup_google`: precheck de wallet duplicada antes de insertar; en el `except IntegrityError`, si el usuario por email sigue sin existir, lanzar `ApiError(400, "VALIDATION_ERROR", "La wallet ya está registrada")` en vez de `raise`. `me.py` con el router de `PUT /me/wallet`.
- [ ] **Step 4:** `pytest tests/test_google_auth.py tests/test_auth.py tests/test_me_wallet.py -v` → PASS.
- [ ] **Step 5:** Commit `feat: wallet obligatoria en el alta de alumno y PUT /me/wallet`.

### Task 6: Consulta de transferencia por archivo y docs

**Files:**
- Modify: `backend/app/application/verification.py`, `backend/app/api/verification.py`, `backend/app/api/stubs.py`, `backend/app/api/schemas.py`, `docs/contracts.md` (§1 variable, §2 signup/login, §5 endpoints, §7 registro, límites y rótulo "simulado"), `frontend/openapi.json` (regenerar si el proyecto lo mantiene a mano; seguir cómo se generó)
- Test: `backend/tests/test_verification.py`, `backend/tests/test_verification_api.py`

**Interfaces:**
- Consumes: Task 3 `Registry.find_by_sha256`, `Transfer`.
- Produces:
  - `application.verification.find_by_file(session, registry, data: bytes) -> TransferLookup | None`
  - `TransferLookup` (dataclass): `certificate_id: UUID, student_name: str, institution: str, course_name: str, completion_date: date, tx_hash: str | None, from_address: str | None, to_address: str | None`
  - `Verification.find_by_file(self, content: bytes) -> TransferLookup | None`; `UnavailableVerification` lo implementa lanzando `VerificationUnavailable`.
  - `POST /api/verify/by-file` (público, multipart `file`), `200 ByFileResponse`: los campos de `TransferLookup` más `status: "REGISTERED"` y `etherscan_url: str | None` (`None` si no hay `tx_hash`); 404 `NOT_FOUND`, 400 por tamaño, 503 `UNAVAILABLE`.
  - Respuestas documentadas en OpenAPI: `{200, 400, 404, 503}` sin `security`.

- [ ] **Step 1: Tests**
  - `find_by_file`: archivo registrado → datos + transfer; desconocido o alterado un byte → `None`; certificado viejo sin tx → campos de tx en `None`.
  - API: 200 con `etherscan_url == "https://etherscan.io/tx/<tx_hash>"`; 404; archivo de 5 242 881 bytes → 400 y 5 242 880 → procesado; sin autenticación; 503 si el servicio no está disponible; certificado viejo → 200 con `tx_hash`, `from_address`, `to_address` y `etherscan_url` en `null`.
  - OpenAPI: operación `/api/verify/by-file` con respuestas `{200, 400, 404, 503}`.
- [ ] **Step 2:** Correr → FAIL.
- [ ] **Step 3:** Implementar reutilizando el límite de lectura de `verify_file` (extraerlo a una constante compartida en `stubs.py` en lugar de duplicar el número). `etherscan_url` se arma con `etherscan_tx_url`. Actualizar `contracts.md` con los campos y rótulos.
- [ ] **Step 4:** `pytest tests/ -v` completo → PASS.
- [ ] **Step 5:** Commit `feat: consulta de transferencia por archivo y contratos`.

### Task 7: Frontend, alta con wallet

**Files:**
- Modify: `frontend/src/api/types.ts`, `frontend/src/api/ApiClient.ts`, `frontend/src/api/httpClient.ts`, `frontend/src/api/mock/MockApiClient.ts`, `frontend/src/features/session/AuthProvider.tsx`, `frontend/src/features/session/GoogleWelcome.tsx`, `frontend/src/features/session/LoginPage.tsx`
- Test: `frontend/src/api/mock/mock.test.ts`, `frontend/src/features/session/login-google.test.tsx`

**Interfaces:**
- Produces:
  - `SessionUser.wallet?: string | null`.
  - `ApiClient.signupWithGoogle(credential: string, name: string | undefined, wallet: string): Promise<LoginResponse>`; `AuthProvider` expone la misma firma.
  - `GoogleWelcome` prop `onConfirm(name: string, wallet: string): void`.
  - `httpClient` envía `wallet_address` en el signup y mapea `wallet_address` de las respuestas a `user.wallet`.

- [ ] **Step 1: Tests**
  - mock: `signupWithGoogle` con wallet válida crea el alumno y devuelve `user.wallet` en minúsculas; inválida → `ApiError` 400 `VALIDATION_ERROR`; wallet duplicada → 400; existente conserva la suya.
  - `login-google.test.tsx`: en `GoogleWelcome` hay un campo "Wallet"; con valor inválido no llama a `onConfirm` y muestra el error; con valor válido llama `onConfirm(name, wallet)`; el 400 del backend se muestra junto al campo.
- [ ] **Step 2:** `npx vitest run src/api/mock/mock.test.ts src/features/session/login-google.test.tsx` → FAIL.
- [ ] **Step 3:** Implementar. Validación en cliente con `/^0x[0-9a-fA-F]{40}$/`. El mock rechaza duplicadas; sus usuarios sembrados reciben wallets falsas. Mensajes en español como el resto de la pantalla.
- [ ] **Step 4:** Mismos tests y `npm run typecheck` → PASS.
- [ ] **Step 5:** Commit `feat: el alta de alumno pide wallet`.

### Task 8: Frontend, consulta por archivo

**Files:**
- Modify: `frontend/src/api/types.ts`, `frontend/src/api/ApiClient.ts`, `frontend/src/api/httpClient.ts`, `frontend/src/api/mock/MockApiClient.ts`, `frontend/src/features/verify/VerifyPage.tsx` (la ruta `/verify` sin id), `frontend/src/features/session/AuthProvider.tsx`
- Create: `frontend/src/features/verify/TransferResultCard.tsx`
- Test: `frontend/src/features/verify/verify.test.tsx`, `frontend/src/api/mock/mock.test.ts`

**Interfaces:**
- Consumes: Task 6 `POST /api/verify/by-file`.
- Produces:
  - `TransferLookup` (TS) espejo de `ByFileResponse`.
  - `ApiClient.lookupByFile(file: File): Promise<TransferLookup | 'NOT_FOUND' | 'UNAVAILABLE'>` (404 → `'NOT_FOUND'`, 503 → `'UNAVAILABLE'`, 400 de tamaño se lanza como `ApiError`, igual que `verifyFile`).

- [ ] **Step 1: Tests**
  - mock: `lookupByFile` devuelve el certificado emitido (con `tx_hash`, `from_address`, `to_address`, `etherscan_url`); nombre de archivo con "alterad" → `'NOT_FOUND'`; escenario `verify-unavailable` → `'UNAVAILABLE'`; archivo > 5 MB → `ApiError` 400.
  - UI: en `/verify` sin id, subir un archivo muestra "De: <institución> (wallet) → Para: <alumno> (wallet)", el `tx_hash` y un enlace a Etherscan rotulado "transacción simulada"; `NOT_FOUND` muestra "No encontramos este certificado"; con `tx_hash` nulo oculta el enlace.
- [ ] **Step 2:** `npx vitest run src/features/verify src/api/mock/mock.test.ts` → FAIL.
- [ ] **Step 3:** Implementar con los componentes de `components/ui` ya usados en `VerifyLookup` (`FileDropzone`, `Alert`, `Card`). El enlace abre en pestaña nueva con `rel="noopener noreferrer"`.
- [ ] **Step 4:** Mismos tests, `npm test` y `npm run typecheck` → PASS.
- [ ] **Step 5:** Commit `feat: consultar de quién a quién fue un certificado`.
