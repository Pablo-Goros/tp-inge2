# 03: Emitir y descargar el certificado con nota mediante C

**Spec:** [Frente B: API, base de datos y publicación](../spec.md)
**Status:** done — integración real validada el 16/11 en `frente-c`; ver [entrega C](../../frente-c-emision/entrega.md) y `evidence/frente-c-tests.txt` (234 pruebas).

## What to build

Integrar la solicitud con nota de B con la emisión del frente C: un lote aceptado recorre outbox, RabbitMQ y worker hasta producir un PDF descargable con los datos correctos. C adapta lectura y generación; B comprueba el contrato y la descarga HTTP. Coordinar cambios en módulos de C con su responsable.

El certificado sigue siendo de finalización: una nota baja no dispara rechazo por una regla de aprobación inexistente. La nota se muestra únicamente cuando fue informada.

## Acceptance criteria

- [x] Una solicitud aceptada con nota llega al worker con el mismo identificador y C obtiene la nota decimal persistida sin cambiar el mensaje AMQP.
- [x] El recorrido real hasta ISSUED permite al alumno dueño y al operador de su institución descargar el PDF con institución, alumno, curso, fecha, identificador, QR y nota correcta.
- [x] Una solicitud sin nota produce un PDF sin un valor inventado o una etiqueta vacía de nota.
- [x] La huella y el registro corresponden a los bytes definitivos del PDF que contiene la nota; no se modifica el documento después de calcular la huella.
- [x] Reentregar un identificador ya emitido reutiliza el certificado guardado, sin generar otro ni cambiar bytes, nota o huella.
- [x] Los certificados anteriores no se regeneran al incorporar esta función y continúan descargándose según permisos.
- [x] Se obtiene evidencia de integración con PostgreSQL, RabbitMQ y el worker real de C; un stub de emisión no satisface este cierre. No depende de que las rutas públicas de los tickets 04/05 estén listas.

## Blocked by

- [02: Aceptar y consultar la nota final opcional](02-nota-final-opcional.md)
- Dependencia externa: worker, generación de PDF y registro simulado de C disponibles y adaptación de nota acordada con su responsable. Hasta entonces no declarar completado este ticket.

