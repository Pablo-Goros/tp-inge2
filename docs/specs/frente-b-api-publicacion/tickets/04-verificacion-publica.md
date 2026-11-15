# 04: Consultar la verificación pública por identificador

**Spec:** [Frente B: API, base de datos y publicación](../spec.md)
**Status:** ready-for-agent

## What to build

Reemplazar la ruta pública declarada como stub por un adaptador HTTP que delega en el caso de uso y la interfaz de registro del frente C. El verificador consulta un identificador sin login y distingue datos registrados, ausencia y servicio indisponible. Reutilizar la dependencia de sesión y el manejo global de errores; introducir solo la sustitución de dependencia necesaria para aislar C en pruebas.

Este ticket puede avanzar sin el worker real: comprobar el contrato HTTP con una dependencia falsa exclusivamente en pruebas. En ejecución normal se usa C o se responde 503, nunca una autenticidad inventada. La integración real se cierra en el ticket 07.

## Acceptance criteria

- [ ] GET /api/verify/{cert_id} es público y devuelve 200 con exactamente status REGISTERED, certificate_id, student_name, institution, course_name y completion_date cuando el caso de uso confirma registro.
- [ ] No devuelve email, nota, datos de cuenta ni campos internos.
- [ ] Ausencia de registro devuelve 404 con error.code NOT_FOUND en el sobre común, sin un campo status alternativo.
- [ ] UUID mal formado devuelve 400 VALIDATION_ERROR. Registro indisponible o integración de C aún no disponible devuelve 503 UNAVAILABLE, sin tratarlo como ausencia.
- [ ] La API delega la decisión de registro a C; no verifica autenticidad únicamente por existencia de una fila local de certificados ni crea un registro paralelo.
- [ ] La dependencia puede sustituirse en pruebas HTTP para presencia, ausencia e indisponibilidad sin exigir detalles de consultas internas. No se usa el falso en ejecución normal.
- [ ] Contrato, ejemplos y OpenAPI eliminan contradicciones de formato/error y sustituyen el 501 de esta ruta por el comportamiento entregado.

## Blocked by

None
