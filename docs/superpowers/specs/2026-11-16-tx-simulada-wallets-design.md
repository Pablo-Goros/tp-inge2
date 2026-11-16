# Transacción simulada con wallets: diseño

Fecha: 2026-11-16. Estado: pendiente de aprobación.

## Intención
Cada emisión simula una transferencia on-chain **de la institución al alumno**. El PDF lleva un QR a `https://etherscan.io/tx/<tx_hash>`. Dado un certificado, la app dice de quién a quién fue. Todo es simulado: el hash no existe en Ethereum y Etherscan responderá "Transaction not found".

## Objetivos
- Cada emisión genera y guarda un `tx_hash` único.
- El alta de alumno pide una wallet.
- Un endpoint recibe un PDF y devuelve emisor, receptor, curso, `tx_hash` y link.

## No objetivos
- Blockchain real, contratos o gas.
- Validar checksum EIP-55 o propiedad de la wallet (no se firma nada).
- Cambiar login por email/clave o por Google.

## Anti-objetivos
- Presentar el link de Etherscan como una prueba real. La demo y los docs lo rotulan "transacción simulada".
- Romper certificados ya emitidos o cuentas sembradas.

## Restricciones
- Los docs (`contracts.md` §7) exigen decir "registro simulado". Actualizar `contracts.md` con los campos nuevos.
- La interfaz `Registry.register/lookup` se mantiene sustituible.
- El hash va dentro del PDF, así que se genera **antes** de renderizarlo; no hay dependencia circular.

## Enfoques considerados
1. **Ampliar `registry` con `tx_hash`, `from_address`, `to_address`** (elegido). Cambio mínimo, y la tx queda como foto inmutable aunque el alumno cambie de wallet.
2. Tabla `transfers` aparte. Más limpia en teoría; suma tabla y join sin beneficio para la demo.

## Diseño
**Datos**
- `users.wallet_address` (Text, nullable, único cuando no es null), con formato `^0x[0-9a-fA-F]{40}$`.
- `registry` suma `tx_hash` (único), `from_address`, `to_address`. Migración `0004`; las filas viejas quedan en null.
- Config `ISSUER_WALLET` (valor de demo en `.env.example`).
- `seed` asigna wallets falsas fijas a operador y alumnos (derivadas del email, deterministas).

**Alta y login**
- `POST /auth/google/signup`: `wallet_address` obligatorio, validado, normalizado a minúsculas. Duplicada → 400. Si el usuario ya existe, es un login y no se toca su wallet.
- Si un alumno sin wallet pide certificado, la emisión falla con error permanente claro. Se agrega `PUT /me/wallet` para completarla.
- `LoginResponse` incluye `wallet_address` para mostrarla en la UI. Frontend: `GoogleWelcome` suma el campo con validación; el mock lo replica.

**Emisión**
- El worker genera `tx_hash = "0x" + secrets.token_hex(32)` **una vez por certificado** y lo persiste antes de renderizar, para que un reintento reuse el mismo.
- `render_certificate` recibe la URL de Etherscan; el QR y el link del PDF la usan. El texto del PDF muestra el `tx_hash` y "Transacción simulada".
- `Registry.register(cert_id, sha256, tx_hash, from_address, to_address)` es idempotente. Si hay conflicto de huella o de `tx_hash`, mantiene el error actual de `RegistryConflict`.

**Consulta por archivo**
- `POST /verify/by-file` (público, multipart): SHA-256 del PDF, búsqueda en `registry.sha256`, respuesta con alumno, curso, fecha, `tx_hash`, `from`, `to` y `etherscan_url`. Sin coincidencia → `NOT_FOUND` (también si el archivo fue alterado). Índice en `registry.sha256`.
- `/verify/<cert_id>` sigue funcionando para certificados viejos, cuyo QR apunta ahí.

## Decisiones del autor (no confirmadas por el equipo)
- `ISSUER_WALLET` por variable de entorno y wallets de seed derivadas del email.
- Filas viejas de `registry` quedan sin tx; `by-file` las encuentra pero devuelve `tx_hash`, `from` y `to` en null.
- `PUT /me/wallet` para alumnos sin wallet.

## Queda para quien construye
Nombres exactos de rutas y esquemas, mensajes de error, tests (alta con wallet válida/ inválida/duplicada, idempotencia del `tx_hash` en reintentos, `by-file` válido/no encontrado), y la UI de `by-file`.
