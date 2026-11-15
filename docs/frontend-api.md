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
| `/verify` sin `cert_id` | — | El contrato verifica por `cert_id`; el enlace «Verificar un certificado» del login lleva a `/verify`. `TODO(equipo)`: definir qué se muestra sin id. Provisorio (etapa 3): campo «Identificador del certificado» que navega a `/verify/:id` |

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

## TODO(equipo) pendientes (`grep -rn "TODO(equipo)" frontend/src`)

- `frontend/src/api/types.ts`: `created_at` (detalle de lote), `institution` (mis certificados) e `issued_at` (verificación pública) no están en contracts §5; el frontend los muestra solo si vienen.
- `frontend/src/config/pending.ts`: CSV `nombre`+`email` (diseño) vs solo `email` (contrato); formato exacto, ejemplo y texto de ayuda; enlace/archivo de ejemplo definitivo (hoy se genera en el navegador).
- `frontend/src/app/routes.tsx` y `features/verify/VerifyLookup.tsx`: qué mostrar en `/verify` sin `cert_id`.

## Guards y pantallas globales

Sin sesión o con rol incorrecto en una ruta protegida: 403 en el lugar (sin redirigir). Ruta inexistente: 404. `/` redirige a la home del rol (o a `/login`). `/verify/:certId` es público. Errores inesperados: `errorElement` del router y `ErrorBoundary` global (pantalla genérica; el detalle solo va a `console.error`). El escenario `csv-reject` del mock devuelve siempre las mismas 4 filas, por eso el conteo ("4 de N filas") no depende del archivo subido.

## Perfiles (alumnos y tutores)

> TODO(equipo): el backend **aún no tiene** estos endpoints. El frontend los consume desde el mock (por defecto) o desde `/api` con `VITE_API=http`. "Tutor" en la UI = rol `operator` del sistema (no hay rol nuevo). El perfil es **siempre público**; no hay toggle público/privado.

| Endpoint | Auth | Notas |
|---|---|---|
| `GET /api/me/profile` | sí | Perfil completo propio. |
| `PUT /api/me/profile` | sí | Parche parcial o perfil completo. 400 `VALIDATION_ERROR` con `details: [{field, reason}]`; slug repetido: 409 `VALIDATION_ERROR` con `reason: SLUG_TAKEN`. El rol no se edita. |
| `POST /api/me/profile/avatar` | sí | multipart, campo `file`. jpg/png/webp, máx. 2 MB. Responde `{avatarUrl}` y lo guarda como foto del perfil. |
| `GET /api/profiles/{slug}` | **no** | Perfil público; 404 si no existe. Ya viene sin las secciones ocultas. |
| `GET /api/profiles?q=&role=&skill=&page=` | **no** | `ProfileSummary[]` (12 por página). `role`: `student` \| `operator`. |
| `GET /api/profiles/slug-available?slug=` | sí | `{available: boolean}`; el slug propio cuenta como disponible. |
| `GET /api/certificates/{id}` | sí | `CertificateDetail` (alumno: solo los propios). `sha256` es opcional: TODO(equipo). |

**Forma de `Profile`** (ver `src/api/types.ts`): identidad (`slug` kebab único, `displayName`, `headline`, `pronouns?`, `location`, `avatarUrl` siempre presente, `coverStyle` entre 8 portadas generadas, `role`, `about`, `openTo?`, `availability?`, `contactEmail?`, `links[]`); secciones CV (`experience`, `education`, `skills` con `level` 1-5, `languages`, `projects`, `achievements`, `publications`, `volunteering`, `interests`, `certificatesFeatured` = ids de `/me/certificates`); extras de alumno (`studyGoals?`, `lookingFor?`) y de tutor (`specialties`, `subjectsTaught`, `teachingYears`, `modality`, `officeHours`, `teachingApproach`); `institution`; `hiddenSections: SectionKey[]`. La completitud **no se guarda**: `profileCompleteness(profile)` en `src/api/profileUtils.ts`.

**Privacidad.** El email de cuenta nunca forma parte del perfil ni de ninguna respuesta pública. `contactEmail` es un campo opcional que la persona escribe a propósito; si está vacío, el backend debe omitirlo (no enviar `""`). Las secciones en `hiddenSections` se vacían en la respuesta pública y siguen visibles para su dueño. `/verify` sigue sin mostrar email ni datos de cuenta.

**Mock.** ~32 perfiles ficticios (14 muy completos: alumno01..07, Marcos Quiroga = operador y 6 tutores sin cuenta; alumno08..25 con perfil base). Avatares SVG generados. Las ediciones persisten en `localStorage['mock:profiles']`; `mockApi.resetProfiles()` en la consola las borra. Escenarios nuevos: `profile-fail` (503 al leer/guardar perfiles y directorio), `slug-taken` (todo slug figura ocupado), `avatar-fail` (503 al subir foto). `empty` deja el directorio vacío. `strict-contract` omite `institution`, `sha256` y `student_name` en el detalle de certificado.

**Editor y ajustes (etapa C).** `PUT /api/me/profile` recibe el parche del editor (sin `role` ni `hiddenSections`; Ajustes envía `hiddenSections` o `slug` o `contactEmail` solos). `contactEmail: ""` en el PUT significa **no publicar ningún email** (el servidor borra el campo). Las fotos se suben aparte (`uploadAvatar`); "Quitar foto" hace `PUT {avatarUrl}` con un avatar SVG generado en el cliente, porque el perfil nunca queda sin foto. El editor guarda un borrador en `localStorage['pe-draft:<rol>:<nombre>']` (sin la foto). TODO(equipo): Ajustes muestra el email de la cuenta de solo lectura, pero `SessionUser` no lo trae; hoy solo se obtiene del token del mock. Hace falta que `/login` o un endpoint de cuenta lo devuelva.

**Rutas.** Públicas: `/p/:slug`, `/directory`. Con sesión (cualquier rol): `/home`, `/profile`, `/profile/edit`, `/profile/settings`. Alumno: `/student/certificates/:id`. Destinos post-login sin cambios.
