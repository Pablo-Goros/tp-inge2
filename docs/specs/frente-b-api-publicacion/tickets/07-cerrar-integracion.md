# 07: Cerrar integración, permisos y contratos del frente B

**Spec:** [Frente B: API, base de datos y publicación](../spec.md)
**Status:** blocked — dependencia externa C no disponible; ver [entrega](../entrega.md)

## What to build

Ejecutar el recorrido completo de B con C y dejar el contrato y la evidencia utilizables por A y D. Desde un entorno de prueba limpio, inicializar cuentas, cargar un lote con y sin nota, publicar, emitir, consultar, descargar y verificar. Este cierre une comportamientos ya entregados; no es una oportunidad para ampliar el alcance.

La adaptación visual de A y los servicios/scripts/documentos generales de D se coordinan con sus responsables. No publicar tickets en trackers ni enviar mensajes externos por este trabajo.

## Acceptance criteria

- [ ] Migración y seed ejecutados dos veces conservan una institución, un operador y 25 alumnos sin duplicados; datos previos sin nota siguen siendo utilizables y secretos/contraseñas no se incorporan a la evidencia.
- [ ] Login y permisos reales distinguen 401 y 403. Operador ve solo sus lotes, alumno solo sus certificados ISSUED; descarga ajena o pendiente devuelve 404 y operador descarga solo de su institución.
- [ ] La consulta del lote refleja estados y conteos derivados, intentos, errores y nota; los listados conservan el alcance acordado y no exponen nota.
- [ ] Lote con/sin nota recorre outbox, RabbitMQ y worker real hasta PDF, con registro simulado real de C conectado a ambas rutas públicas, sin falsos de prueba en ejecución normal.
- [ ] PDF emitido verifica como VALID; modificar sus bytes, incluida la nota, produce ALTERED; un id sin registro produce NOT_FOUND y caída del registro produce 503.
- [ ] Un mensaje repetido no emite un segundo certificado y una caída del broker no pierde una solicitud aceptada. Reutilizar evidencia de 03 y 06 y repetir solo lo necesario para resolver cambios o fallos de integración.
- [ ] Contrato y OpenAPI coinciden con esta spec: columna/nota, límites en bytes, fecha no futura, respuesta pública sin nota/email y errores uniformes. No se atribuye aprobación de estos cambios a quienes no la confirmaron.
- [ ] Se documenta la adaptación requerida a A (detalle con nota) y C (esquema/PDF/verificación), el reparto por módulos compartidos y los comandos/resultados de B para D. Se señalan a D las referencias obsoletas a blockchain o ausencia de aplicación.
- [ ] La documentación de entrega declara registro simulado, entrega al menos una vez y dependencias integradas. El plan anterior queda referenciado como antecedente, sin marcar pruebas o tareas como realizadas sin evidencia.
- [ ] Suites pertinentes pasan en entorno aislado; cualquier validación no ejecutable se informa con su bloqueo concreto y no se presenta este ticket como terminado.

## Blocked by

- [01: Aceptar CSV estricto y fechas válidas](01-validar-lotes-csv.md)
- [02: Aceptar y consultar la nota final opcional](02-nota-final-opcional.md)
- [03: Emitir y descargar el certificado con nota mediante C](03-certificado-con-nota.md)
- [04: Consultar la verificación pública por identificador](04-verificacion-publica.md)
- [05: Comparar el archivo recibido con el registro](05-verificar-archivo.md)
- [06: Demostrar publicación tras una caída del broker](06-recuperar-publicacion.md)
- Dependencia externa: casos de uso de verificación y registro simulado de C disponibles para integración real.

