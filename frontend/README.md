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

`VITE_API=http npm run dev` usa el backend real en `/api` en lugar del mock.

## Mock

Cuentas (contraseña `demo1234`): `operador@demo.test`, `alumno01@demo.test` … `alumno25@demo.test`.

Escenarios con `?mock=` en la URL (combinables con coma, p. ej. `?mock=offline,slow`; `?mock=` los limpia): `slow`, `offline`, `down`, `expired`, `empty`, `frozen`, `csv-reject`, `pdf-fail`, `verify-valid`, `verify-altered`, `verify-notfound`, `verify-unavailable`, `strict-contract`. Detalle en [docs/frontend-api.md](../docs/frontend-api.md), que también lista los endpoints esperados y los `TODO(equipo)`.
