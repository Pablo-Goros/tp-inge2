# API que espera el frontend

Fuente: [contracts.md](contracts.md) §2 y §5. El cliente está definido en `frontend/src/api/ApiClient.ts` (mock en memoria por defecto; `VITE_API=http` usa `/api`).

## Endpoints

| Método y ruta | Rol | Método del cliente | Notas |
| --- | --- | --- | --- |
| `POST /api/auth/login` | público | `login` | 401 = credenciales inválidas |
| `POST /api/batches` (multipart + `Idempotency-Key`) | operator | `createBatch` | 400 con `details` de filas (`row`, `email`, `reason`); 409 si la clave se reusa con otro contenido |
| `GET /api/batches` | operator | `listBatches` | sin paginación; filtros y orden en el cliente |
| `GET /api/batches/{id}` | operator | `getBatch` | se consulta cada 2 s mientras `IN_PROGRESS` |
| `GET /api/me/certificates` | student | `listMyCertificates` | |
| `GET /api/certificates/{id}/pdf` | alumno dueño u operador | `downloadCertificatePdf` | blob `application/pdf` |
| `GET /api/verify/{cert_id}` | público | `getPublicCertificate` | 404 `NOT_FOUND`, 503 `UNAVAILABLE` |
| `POST /api/verify/{cert_id}/file` | público | `verifyFile` | `VALID`/`ALTERED`/`NOT_FOUND`; un 503 se devuelve como `UNAVAILABLE` |

Todos los errores usan el envelope `{ error: { code, message, details } }` y se convierten en `ApiError` (`status`, `code`, `details`; `code = 'NETWORK'` si no hubo respuesta). Un 401 en cualquier llamada autenticada cierra la sesión y lleva a `/login`.

## Campos que le pedimos al equipo (hoy el frontend los muestra solo si vienen)

| Dónde | Campo | Para qué |
| --- | --- | --- |
| `GET /me/certificates` | `institution` | Tarjeta de «Mis certificados» |
| `GET /verify/{cert_id}` | `issued_at` | Fecha de emisión en la verificación |
| `GET /batches/{id}` | `created_at` | «creado dd/mm/aaaa» en el detalle (ya viene en el listado) |
| `GET /batches` y `/batches/{id}` | código corto de lote | Se muestra `#7F3A…` (4 primeros hex del uuid, sin número correlativo); no hace falta campo nuevo salvo que prefieran otro formato |
| `POST /batches` (CSV) | columnas `nombre`+`email` o solo `email` | El contrato dice una sola columna `email`; el diseño muestra ambas. El mock acepta las dos. Formato exacto, ejemplo y ayuda: `frontend/src/config/pending.ts` (`TODO(equipo)`) |
| `/verify` sin `cert_id` | — | El contrato verifica por `cert_id`; el enlace «Verificar un certificado» del login lleva a `/verify`. `TODO(equipo)`: definir qué se muestra sin id |

## Cuentas y escenarios del mock

Cuentas (contraseña de demo `demo1234`): `operador@demo.test` (Marcos Quiroga), `alumno01@demo.test` (Camila Ferreyra, con 3 certificados) … `alumno25@demo.test`. Cualquier otra credencial da 401. Usable para el CSV: `alumno01..25@demo.test`.

Escenarios (combinables, separados por coma): `?mock=offline,slow`. Se guardan en `localStorage.mock`; `?mock=` (vacío) o `?mock=default` los limpia. También desde la consola: `mockApi.set('down')`, `mockApi.set()`, `mockApi.get()`. Cambian sin recargar.

| Escenario | Efecto |
| --- | --- |
| `slow` | Latencia 1,5 s (base: 350 ms) |
| `offline` | Todo falla con `NETWORK` |
| `down` | Todo (menos login) responde 503 `UNAVAILABLE` |
| `expired` | Toda llamada autenticada responde 401 |
| `empty` | Sin lotes ni certificados |
| `frozen` | El lote en curso (#7, 48 alumnos) deja de avanzar |
| `csv-reject` | `createBatch` rechaza con filas de los 4 motivos |
| `pdf-fail` | La descarga del PDF falla (503) |
| `verify-valid` / `verify-altered` / `verify-notfound` / `verify-unavailable` | Fuerzan el resultado de `verifyFile` (y 404/503 en `getPublicCertificate`) |
| `strict-contract` | Omite `institution`, `issued_at` y `created_at` |

Sin escenario, la validación del CSV es real: los 4 motivos (`INVALID_EMAIL`, `DUPLICATE_IN_FILE`, `NO_ACCOUNT`, `ALREADY_REQUESTED`) salen de los datos (p. ej. curso «Introducción a Criptografía Aplicada» con fecha 2026-10-30 ya tiene a `alumno01..48`). `verifyFile` da `VALID`, `ALTERED` si el nombre del archivo contiene «alterado»/«altered», y `NOT_FOUND` si el id no existe. La misma `Idempotency-Key` devuelve el mismo lote sin crear otro.
