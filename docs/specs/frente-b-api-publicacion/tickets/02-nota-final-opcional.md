# 02: Aceptar y consultar la nota final opcional

**Spec:** [Frente B: API, base de datos y publicación](../spec.md)
**Status:** ready-for-agent

## What to build

El operador puede cargar una nota final opcional por alumno y verla en el detalle del lote. Recorrer CSV, validación, aceptación transaccional, persistencia y respuesta HTTP; reutilizar el flujo existente en lugar de crear uno separado para notas.

Agregar una migración nueva y compatible que permita nota nula. Actualizar el [contrato compartido](../../../contracts.md) y OpenAPI para que A consuma el detalle y C lea la nota de la solicitud. La actualización de pantalla se coordina con A; este ticket entrega el comportamiento HTTP verificable de B.

## Acceptance criteria

- [ ] CSV con email solamente sigue funcionando. Se admite únicamente `email` más `final_grade` opcional; ambas columnas son únicas tras normalización. Una celda de nota vacía o columna ausente produce null.
- [ ] Nota válida de 0 a 10 inclusive, con punto y hasta dos decimales, queda asociada al alumno correcto. Se rechazan texto, coma decimal, notación exponencial, NaN, infinito, rango inválido y precisión excesiva sin redondear.
- [ ] Una nota inválida produce 400 VALIDATION_ERROR con motivo INVALID_GRADE y fila; se informan también los demás errores de filas detectables y no se persiste parte del lote.
- [ ] La nueva migración usa decimal exacto nullable con restricción de rango y preserva registros anteriores sin nota; no modifica la migración inicial ni los PDFs previos.
- [ ] El detalle autorizado del lote incluye `final_grade` como número o null. No se agrega a listados de lotes, Mis certificados ni datos públicos de verificación.
- [ ] Misma clave y mismos bytes con nota reproduce el lote; cambiar la nota con esa clave devuelve 409. Otra clave no evade la unicidad por alumno/curso/fecha. La nota no habilita corrección ni reemisión.
- [ ] Los mensajes AMQP conservan solo request_id y correlation_id; el UUID del certificado continúa estable.
- [ ] Pruebas HTTP con PostgreSQL real cubren valores frontera, carga antigua sin nota, rollback y conflictos; una prueba de migración comprueba datos previos conservados.
- [ ] Contrato/OpenAPI reflejan nota opcional y esquema ampliado. Queda documentada la adaptación que necesitan A y C, sin enviar mensajes externos automáticamente.

## Blocked by

- [01: Aceptar CSV estricto y fechas válidas](01-validar-lotes-csv.md)
