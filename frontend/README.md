# Frontend: certificados verificables (PoC académica)

React 18 + TypeScript + Vite. UI en español rioplatense. Demo académica: no emite títulos oficiales.

## Cómo correr

```
npm i
npm run dev        # http://localhost:5173 (API simulada en memoria por defecto)
npm test           # vitest
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + vite build
```

`VITE_API=http npm run dev` usa el backend real en `/api` en lugar del mock. Perfiles, directorio y detalle de certificado aún no existen en el backend: con `VITE_API=http` esas pantallas muestran error (ver `docs/frontend-api.md`).

## Mock

Cuentas (contraseña `demo1234`): `operador@demo.test`, `alumno01@demo.test` … `alumno25@demo.test`.

Escenarios con `?mock=` en la URL (combinables con coma, p. ej. `?mock=offline,slow`; `?mock=` los limpia): `slow`, `offline`, `down`, `expired`, `empty`, `frozen`, `csv-reject`, `pdf-fail`, `verify-valid`, `verify-altered`, `verify-notfound`, `verify-unavailable`, `strict-contract`, y los de perfiles `profile-fail`, `slug-taken`, `avatar-fail` (ver más abajo). Detalle en [docs/frontend-api.md](../docs/frontend-api.md), que también lista los endpoints esperados y los `TODO(equipo)`.

## Rutas

| Ruta | Acceso | Qué es |
|---|---|---|
| `/login` | público | Ingreso |
| `/verify`, `/verify/:certId` | público | Verificación de un certificado (no muestra email ni datos de cuenta) |
| `/p/:slug` | público | Perfil público de una persona (alumno o tutor) |
| `/directory` | público | Directorio con búsqueda, filtros (rol, habilidad), orden y paginación; el estado vive en la URL |
| `/home` | con sesión | Inicio: completitud, certificados recientes, tu perfil público, personas para conocer |
| `/profile` | con sesión | Mi perfil (vista propia, con atajos para editar) |
| `/profile/edit` | con sesión | Editor del perfil con vista previa y barra de guardado |
| `/profile/settings` | con sesión | Ajustes: secciones visibles, enlace, contacto público, email de cuenta (solo lectura) |
| `/student/certificates`, `/student/certificates/:id` | alumno | Mis certificados y detalle con QR |
| `/operator/batches`, `/operator/batches/new`, `/operator/batches/:id` | operador (tutor) | Lotes de certificados |

"Tutor" en la UI es el rol `operator`. Los perfiles son siempre públicos y la foto es obligatoria.

## Cuentas de demo (mock)

Contraseña `demo1234` para todas: `operador@demo.test` (Marcos Quiroga, tutor) y `alumno01@demo.test` … `alumno25@demo.test` (alumno01 = Camila Ferreyra, perfil muy completo; alumno01..07 tienen perfil completo, el resto uno base). Los 6 tutores restantes del directorio no tienen cuenta.

## Perfiles de ejemplo (mock)

- Escenarios: `profile-fail` (503 al leer/guardar perfiles y directorio), `slug-taken` (todo slug figura ocupado), `avatar-fail` (503 al subir foto). `empty` deja el directorio vacío; `slow` y `offline` muestran los estados de carga y error de Inicio.
- Los cambios del editor persisten en `localStorage['mock:profiles']`. Para volver a los perfiles de ejemplo: en la consola `mockApi.resetProfiles()`, o borrar esa clave (`localStorage.removeItem('mock:profiles')`) y recargar. Los borradores del editor están en claves `pe-draft:*`.
- La sesión vive en `sessionStorage['cv.session']`.

## Calidad y accesibilidad

Tokens de color en `src/styles/tokens.css` (único lugar con hex; ver `docs/identidad-visual.md`). Textos con contraste AA, foco visible global, `prefers-reduced-motion` respetado, targets táctiles de 44 px en móvil. Los `TODO(equipo)` de perfiles y los endpoints que necesita el backend están en [docs/frontend-api.md](../docs/frontend-api.md).
