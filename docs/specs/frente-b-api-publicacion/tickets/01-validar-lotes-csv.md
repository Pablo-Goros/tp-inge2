# 01: Aceptar CSV estricto y fechas válidas

**Spec:** [Frente B: API, base de datos y publicación](../spec.md)
**Status:** in-progress

## What to build

El operador puede cargar un lote de alumnos precargados para un curso ya finalizado y recibe errores precisos sin crear datos parciales. Ajustar el flujo HTTP y la validación existentes, conservando autenticación, aceptación transaccional e idempotencia. Esta primera entrega conserva CSV de solo email; la columna de nota se habilita en el ticket 02.

Sincronizar el [contrato](../../../contracts.md) con los límites y reglas implementados y corregir su atribución de aprobación: las decisiones de esta spec fueron revisadas por el responsable B, sin presumir aprobación del resto del equipo. No rehacer el backend ya existente.

## Acceptance criteria

- [ ] POST autenticado acepta entre 1 y 100 alumnos conocidos, un curso no vacío de hasta 200 caracteres y fecha YYYY-MM-DD no futura, usando el día de Buenos Aires.
- [ ] CSV de hasta 1.048.576 bytes acepta UTF-8/BOM, LF/CRLF, normalización de email y líneas vacías finales; rechaza cabeceras ausentes, desconocidas o repetidas tras normalización, filas con campos de más/de menos y líneas vacías intermedias.
- [ ] Filas inválidas identifican su posición desde la primera fila de datos; errores de archivo/cabecera usan fila 0. No se renumeran silenciosamente filas intermedias eliminándolas.
- [ ] Email inválido, alumno inexistente o ajeno, repetido en archivo o previamente solicitado devuelve 400 VALIDATION_ERROR con detalles y sin lote, solicitudes ni outbox nuevos. Solicitudes FAILED siguen bloqueando duplicados.
- [ ] Fecha futura, archivo excesivo, formulario inválido y clave idempotente ausente/vacía o mayor a 255 caracteres producen el sobre de error común con 400.
- [ ] Se mantienen la huella sobre bytes exactos, 201 para alta, 200 para repetición y 409 para conflicto, con protección ante cargas concurrentes y rollback completo.
- [ ] Pruebas HTTP con PostgreSQL real cubren bordes de tamaño/filas, fecha controlada, errores acumulados y ausencia de efectos parciales; se amplían pruebas puras existentes solo donde ayuden a diagnosticar formatos.
- [ ] Contrato y OpenAPI describen las reglas entregadas; la ampliación con nota queda vinculada al ticket 02.

## Blocked by

None

