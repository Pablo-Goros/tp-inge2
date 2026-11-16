# Frente B: API, base de datos y publicación

## Problem Statement

El operador institucional necesita solicitar certificados de finalización para un grupo de alumnos sin cargar cada emisión manualmente y sin perder pedidos cuando RabbitMQ está caído. Necesita conocer el avance y los errores. Los alumnos necesitan consultar y descargar sus certificados; un verificador necesita distinguir un documento registrado, uno alterado y una imposibilidad temporal de verificar.

El frente B ya tiene implementados autenticación, aceptación de lotes, consultas, persistencia, inicialización y publicador. Falta completar la verificación pública, ajustar la validación y agregar la nota final opcional. La existencia del código y de pruebas no implica que su funcionamiento haya sido validado durante esta planificación.

## Solution

Conservar el backend actual y completar su comportamiento con contratos explícitos. El operador selecciona un curso y una fecha de finalización y sube un CSV de alumnos precargados, con nota final opcional. La API valida el lote completo y persiste solicitudes y outbox atómicamente. Un publicador independiente entrega las solicitudes a RabbitMQ cuando está disponible. El frente C emite los certificados y proporciona el registro y los casos de uso de verificación.

Las consultas y descargas respetan los roles. La verificación es pública, no expone datos de cuenta ni la nota y no confunde un registro indisponible con un certificado inexistente.

## User Stories

1. Como operador institucional, quiero iniciar sesión con una cuenta precargada para solicitar emisiones autorizadas.
2. Como alumno, quiero iniciar sesión con mi cuenta para acceder a mis certificados.
3. Como operador institucional, quiero indicar un curso y una fecha para emitir un lote de esa realización.
4. Como operador institucional, quiero seleccionar alumnos mediante sus emails para reutilizar sus datos existentes.
5. Como operador institucional, quiero informar una nota final opcional para incluirla en el certificado cuando corresponda.
6. Como operador institucional, quiero omitir la nota en cursos sin calificación para certificar su finalización igualmente.
7. Como operador institucional, quiero recibir los errores del CSV por fila para corregir la carga completa.
8. Como operador institucional, quiero que un lote inválido no cree solicitudes parciales para poder corregirlo sin reconciliar resultados.
9. Como operador institucional, quiero evitar solicitudes duplicadas aunque cambien mayúsculas o espacios del curso.
10. Como operador institucional, quiero repetir una petición HTTP sin duplicar el lote cuando no recibí su respuesta.
11. Como operador institucional, quiero detectar el uso de una misma clave idempotente para contenido diferente.
12. Como operador institucional, quiero que una carga válida quede aceptada aunque RabbitMQ esté temporalmente caído.
13. Como operador institucional, quiero consultar mis últimos lotes y el avance por alumno para seguir la emisión.
14. Como operador institucional, quiero consultar intentos y errores de emisión para identificar fallos.
15. Como operador institucional, quiero ver la nota informada en el detalle del lote para comprobar la carga.
16. Como alumno, quiero listar solamente mis certificados emitidos para descargar documentos disponibles.
17. Como alumno, quiero descargar mi PDF con su nota cuando fue informada para presentar la constancia.
18. Como operador institucional, quiero descargar certificados de mi institución para asistir a sus alumnos.
19. Como alumno, quiero que otros alumnos no accedan a mis documentos mediante la API autenticada.
20. Como verificador, quiero consultar un identificador sin iniciar sesión para conocer los datos públicos registrados.
21. Como verificador, quiero comparar el archivo recibido con el registro para detectar alteraciones, incluida una modificación de la nota.
22. Como verificador, quiero distinguir la ausencia de un registro de una caída del servicio para interpretar correctamente el resultado.
23. Como integrante del equipo, quiero ejecutar una inicialización repetible con datos ficticios para integrar los frentes.
24. Como integrante del equipo, quiero demostrar recuperación del publicador y tolerancia a mensajes repetidos para explicar el papel de RabbitMQ.

## Acceptance Criteria

1. La demo contiene una institución, un operador y 25 alumnos precargados con nombre y email. No se crean alumnos desde el CSV. La institución proviene de las cuentas, el curso y la fecha del formulario, y el identificador de B.
2. Login con email y contraseña devuelve JWT HS256 de 8 horas y rol operador o alumno. Rutas protegidas comprueban el rol en el backend. No se agregan registro, recuperación ni renovación de sesión.
3. Un lote representa un único curso y fecha. El curso tiene entre 1 y 200 caracteres y no puede quedar vacío al quitar espacios. La fecha usa YYYY-MM-DD y no puede ser futura.
4. El CSV acepta UTF-8 con o sin BOM y saltos LF/CRLF; exige cabecera con una columna `email` y admite únicamente una columna adicional opcional `final_grade`. Ambas aparecen como máximo una vez; columnas desconocidas y filas con un número de campos incompatible con su cabecera se rechazan. Se conserva la tolerancia existente a espacios y mayúsculas de cabeceras, sin permitir duplicados tras normalizarlas.
5. El CSV contiene entre 1 y 100 filas de datos y como máximo 1 MiB (1.048.576 bytes). Las líneas vacías finales se ignoran; las intermedias se rechazan. Los errores señalan la posición desde la primera fila después de la cabecera, empezando en 1; errores de archivo o cabecera usan fila 0.
6. `final_grade` puede omitirse como columna o quedar vacía. Si se informa, admite un decimal entre 0 y 10 inclusive, con hasta dos decimales y punto como separador. No admite texto, notación exponencial, NaN ni infinito. No se redondea silenciosamente ni se aplica un umbral de aprobación.
7. Emails se normalizan con espacios exteriores quitados y minúsculas. El curso se compara con espacios exteriores quitados, espacios internos colapsados y casefold, conservando el nombre de presentación.
8. Email inválido, alumno inexistente o ajeno a la institución, repetición en el archivo, solicitud previa o nota inválida rechazan todo el lote. Se informan todos los errores detectables por fila sin crear lote, solicitudes ni outbox parciales. Se agrega `INVALID_GRADE` a los motivos existentes; los errores estructurales distinguen el motivo correspondiente.
9. La unicidad corresponde a alumno, institución, curso normalizado y fecha. Como el alumno pertenece a una institución, la restricción existente por alumno/curso/fecha sigue siendo suficiente para este alcance. Incluye solicitudes fallidas: no hay reemisión ni edición. Una nota diferente no crea una identidad distinta.
10. `Idempotency-Key` es obligatoria, no vacía y de hasta 255 caracteres tras quitar espacios exteriores. Misma clave por operador y mismo fingerprint devuelve 200 con el lote original y su estado actual; otra huella devuelve 409. La huella combina curso normalizado, fecha y bytes exactos del CSV, incluida la nota. Una carga nueva aceptada devuelve 201 sin esperar la emisión.
11. Aceptar un lote crea atómicamente el lote, sus solicitudes PENDING y un outbox por solicitud, con UUID de certificado estable y correlation_id por solicitud. Cargas simultáneas no dejan duplicados ni filas parciales.
12. Con PostgreSQL disponible y RabbitMQ caído, se acepta el lote y queda pendiente en outbox. El publicador envía mensajes persistentes con solo request_id y correlation_id, confirma su recepción por el broker y después marca la publicación. Una caída entre esos pasos puede repetir el mensaje con el mismo identificador.
13. El operador lista sus últimos 100 lotes y consulta solo sus propios detalles. Se conservan estados de solicitud PENDING, PROCESSING, ISSUED y FAILED y estados de lote derivados IN_PROGRESS, COMPLETED y COMPLETED_WITH_ERRORS. El detalle incluye conteos, alumno, intentos, error y `final_grade` opcional. El frontend consulta cada 2 segundos mientras haya trabajo pendiente.
14. El alumno lista solo sus certificados ISSUED. Descarga únicamente los propios; un operador descarga certificados de su institución. Recurso inexistente, ajeno o no emitido devuelve 404. PDF con Content-Disposition de descarga. No se añade nota a los listados.
15. La nota informada se incluye en el PDF mediante la integración con C; sin nota se omite su representación. Los PDFs previos no se regeneran ni se modifica su huella.
16. GET público por identificador devuelve REGISTERED, identificador, nombre del alumno, institución, curso y fecha cuando existe registro. No incluye email, nota ni datos de cuenta. Ausencia de registro devuelve 404 con el sobre de error común y code NOT_FOUND, sin un status alternativo.
17. POST público de archivo por identificador acepta hasta 5 MiB (5.242.880 bytes), compara su SHA-256 con el registro de C y devuelve VALID, ALTERED o NOT_FOUND. No extrae el identificador del PDF ni guarda el archivo. No depende del MIME declarado para establecer autenticidad.
18. Verificación sin registro disponible devuelve 503 UNAVAILABLE, nunca ALTERED ni NOT_FOUND por esa causa. Durante la integración, una dependencia aún no disponible también produce 503; el registro falso se usa solo en pruebas.
19. Los errores HTTP usan `{error:{code,message,details}}`. Entradas inválidas, UUID mal formado y archivos que exceden límites devuelven 400 VALIDATION_ERROR; autenticación 401, rol incorrecto 403, recurso inaccesible 404, conflicto idempotente 409 y dependencia indisponible 503. Se conserva el tratamiento común de otros errores HTTP y errores internos.
20. El arranque de prueba migra y siembra de forma repetible. Se entrega evidencia de aceptación de lote, persistencia y publicación, permisos, verificación y recuperación ante caída del broker; la integración con C comprueba PDF con nota y ausencia de doble emisión.

## Implementation Decisions

- Mantener FastAPI, SQLAlchemy, Alembic, PostgreSQL y Pika/RabbitMQ. Reutilizar las interfaces existentes de aceptación de lote, consultas, publicación y autenticación.
- Agregar mediante una nueva migración `final_grade` nullable en las solicitudes, con almacenamiento decimal exacto y restricción de rango 0–10. Los registros anteriores quedan en null. No reescribir la migración inicial.
- Propagar email y nota juntos desde el análisis del CSV hasta la solicitud y el detalle. La nota pertenece al resultado académico, no a la cuenta del alumno. En JSON del detalle se representa como número decimal o null; su almacenamiento y validación no usan aritmética binaria para decidir precisión/rango.
- No cambiar la identidad de las solicitudes ni el mensaje AMQP. El worker lee la nota desde PostgreSQL. La operación de aceptación conserva sus defensas transaccionales y restricciones de unicidad frente a concurrencia.
- Mantener publicador separado, publisher confirms, mandatory y bloqueo de filas con SKIP LOCKED. Garantía de entrega al menos una vez: C conserva idempotencia por identificador; no se promete entrega exactamente una vez.
- Mantener topología de trabajo, espera con TTL y DLQ del contrato existente. Su consumo, reintentos acotados y estados terminales pertenecen a C; esta spec no rediseña esos mecanismos.
- Implementar adaptadores HTTP de verificación que deleguen en los casos de uso y la interfaz Registry de C, con una dependencia sustituible en pruebas. El backend de entrega es el registro simulado; blockchain queda fuera del trabajo B.
- Mantener las rutas existentes con prefijo /api, incluida la comparación en POST /verify/{cert_id}/file. B no implementa su propio registro paralelo.
- Para el límite de fecha, referencia operativa de la demo: día calendario de Buenos Aires, independientemente de la zona del servidor. Es una precisión operativa propuesta al sintetizar esta spec, no una decisión entrevistada por separado.
- B es dueño de API, migraciones, inicialización, aceptación de lotes y publicador, incluidos sus módulos compartidos. C es dueño de generación de PDF, registro y lógica de verificación. A adapta presentación del detalle; D mantiene Compose y documentación general. Los cambios en contratos se entregan junto con cada implementación y se coordinan con los otros responsables.
- No se crea ADR: estas ampliaciones no reúnen simultáneamente irreversibilidad significativa, sorpresa sin contexto y una elección entre alternativas con costes relevantes.

## Testing Decisions

- Frontera principal: API HTTP con PostgreSQL real para probar comportamiento observable, códigos, cuerpos, permisos y efectos persistidos. Reutilizar los clientes y fixtures existentes; no crear una segunda arquitectura de pruebas.
- Segunda frontera necesaria: publicador contra RabbitMQ y PostgreSQL reales para observar persistencia, mensajes, confirmaciones y recuperación. SQLite o un broker simulado no prueban esta garantía.
- Sustituir únicamente la dependencia de verificación de C en pruebas HTTP aisladas; probar presencia, ausencia e indisponibilidad sin acoplarse a consultas internas. Luego probar integración con el registro simulado real de C.
- Mantener pruebas puras existentes del parser y normalización para bordes de CSV/decimal difíciles de diagnosticar desde HTTP, sin convertir funciones privadas en un contrato de prueba.
- Ampliar las familias de pruebas ya existentes de validación CSV, aceptación de lotes, estado de lote, certificados, autenticación, inicialización y publicador. Agregar cobertura HTTP pública de verificación.
- Probar migración sobre datos previos sin nota, cargas viejas de solo email, límites exactos y excedidos, fechas deterministas, notas inválidas y rollback completo. Probar concurrencia e idempotencia con nota incluida en la huella.
- En la integración con C, comprobar PDF con/sin nota, huella sobre bytes definitivos, archivo alterado y reentrega del mismo identificador sin nuevo certificado. No exigir igualdad entre dos PDFs generados independientemente.
- El usuario confirmó estas fronteras y el desglose de siete tickets el 15/11/2026. No se ejecutaron suites durante esta sesión de planificación.

## Out of Scope

- Altas y administración de usuarios o instituciones, múltiples instituciones operativas, recuperación de contraseña y refresh tokens.
- DNI, legajo, carga horaria, umbral de aprobación, actas o calificaciones distintas de una nota final opcional.
- Edición, cancelación, corrección de nota, reemisión y reintento manual de solicitudes terminales.
- Rediseñar UI, generar PDF o implementar worker/registro dentro de B. Sus adaptaciones se coordinan con sus responsables.
- Blockchain real, extracción de identificador desde archivos, publicación de notas en verificación y persistencia de archivos subidos para comparar.
- Entrega exactamente una vez, ampliación de límites, paginación y optimización para volúmenes superiores a la demo.
- Publicación en un tracker externo o mensajes al equipo: los tickets son archivos locales.

## Further Notes

- Fuente: decisiones de la entrevista del 15/11/2026 con el responsable de B. La petición posterior de convertirlas en spec y tickets reemplaza la continuación de la entrevista.
- Vocabulario: [glosario](../../../GLOSSARY.md). Contexto: [división del trabajo](../../division-del-trabajo.md) y [contrato existente](../../contracts.md).
- El contrato actual no fue definido por este usuario, pese a su cabecera de aprobación. Esta spec registra la revisión de B; no implica acuerdo de los otros frentes. Antes de integrar, corregir esa atribución y sincronizar contrato y OpenAPI con nota opcional, CSV estricto, fecha no futura, límites y errores uniformes.
- El [plan previo de B](../../superpowers/plans/2026-11-13-frente-b-api-publicacion.md) describe trabajo en gran parte ya presente y mantiene casillas sin marcar. No repetir las tareas 1–8 sin contrastar código y pruebas. La tarea de verificación pública sigue pendiente en el árbol examinado.
- Tickets aprobados: [01](tickets/01-validar-lotes-csv.md), [02](tickets/02-nota-final-opcional.md), [03](tickets/03-certificado-con-nota.md), [04](tickets/04-verificacion-publica.md), [05](tickets/05-verificar-archivo.md), [06](tickets/06-recuperar-publicacion.md) y [07](tickets/07-cerrar-integracion.md). Pueden comenzar 01, 04 y 06; trabajar luego sobre los tickets cuyos bloqueos estén resueltos.
- Los documentos generales contienen referencias anteriores a blockchain y ausencia de aplicación. La coordinación final debe señalar esas discrepancias a D, sin presentar el registro simulado como blockchain ni adjudicar a B la implementación de otros frentes.
