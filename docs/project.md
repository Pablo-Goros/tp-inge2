# Proyecto: certificados académicos verificables

Plan iniciado el 08/11/2026; decisiones de producto actualizadas el 09/11/2026. El equipo confirmó emisión por lote con RabbitMQ, cuatro integrantes con poca disponibilidad, blockchain local y presupuesto monetario cero. El usuario confirmó el alcance base al finalizar la entrevista. Las decisiones funcionales señaladas como confirmadas son el acuerdo de producto; el stack y la estructura interna son la propuesta técnica elaborada por pedido del equipo. Todavía no hay software implementado.

## Propósito y usuarios

Permitir que una institución emita certificados de finalización de cursos y que un tercero compruebe si un documento corresponde al registrado por el emisor. La emisión por lote debe seguir avanzando pese a interrupciones del procesamiento, sin crear certificados duplicados.

Usuarios: un operador institucional que emite y consulta lotes; un alumno que ingresa a “Mis certificados”, ve sus certificados y descarga sus PDFs; un verificador que consulta el QR o presenta el PDF para comprobarlo. El operador pertenece a la institución emisora. Operador y alumnos tienen acceso autenticado con permisos distintos; el verificador usa una página pública sin cuenta. Para la PoC se confirmaron alumnos con cuentas precargadas y vinculación por email desde el CSV; registro de cuentas, invitaciones y recuperación de contraseña quedan fuera del compromiso inicial.

La visión de negocio incluye instituciones múltiples, billetera móvil y comercialización B2B. El equipo confirmó una institución y un operador precargados. Se incluyen cuentas de alumnos y su portal de certificados; la verificación es pública y sin cuenta. Se confirmó un formulario de emisión con nombre del curso, fecha de finalización y CSV, sin sección separada para administrar cursos. La PoC usa datos sintéticos y certificados de curso; no pretende emitir títulos oficiales. Ver [justificación original](references/justificacion-proyecto.txt) y [canvas original](references/definicion-estrategia-canvas.txt).

## Qué exige la cátedra

Fuente normativa del trabajo: [enunciado original](references/enunciado-tp.pdf), páginas indicadas abajo. El enunciado no incluye una rúbrica con puntajes; estas son sus exigencias explícitas.

| Exigencia | Fuente | Evidencia prevista |
| --- | --- | --- |
| Investigar e implementar una tecnología mediante una PoC | p. 3 | RabbitMQ integrado al flujo real de emisión |
| Elegir Airflow/Prefect, Kafka/RabbitMQ, N8N/Flink u otra tecnología con validación previa | p. 4 | RabbitMQ, dentro de la lista; blockchain es complementaria |
| Explicación técnica que evidencie investigación y caso de uso no trivial | p. 4 | Persistencia, confirmaciones, fallos, reentregas e idempotencia; demo con evidencia |
| Explicación funcional, ejemplos, alternativas y pros/contras ligados al negocio | p. 5 | Comparativa de arquitectura y relación entre decisiones y atributos de calidad |
| White paper funcional y técnico, máximo 5 páginas sin portada, índice ni anexos | p. 6 | Documento final con problema, propuesta, alternativas, arquitectura y resultados |
| Proyecto funcional con todos los servicios mediante `docker compose up` | p. 6 | Arranque en una máquina limpia, inicialización automática y datos de ejemplo |
| README con flujo, ejecución, endpoints/eventos, datos y resultados esperados | p. 6 | Instrucciones reproducidas por otra persona |
| Proyecto desplegado en la nube, con credenciales | p. 6 | Mismo flujo accesible en una VM, acceso privado entregado a la cátedra |
| Entrega el 19/11 y defensa el 26/11 | pp. 2, 6–7 | Repositorio, documentos y despliegue preparados antes del cierre |
| Defensa: 10 min setup/exposición, 10 demo, 10 preguntas | p. 7 | Guion ensayado que integre ambos ejes |

La exposición debe incluir producto, justificación, funcionalidades principales, diagramas y narración de arquitectura, stack, tiempo y recursos humanos/técnicos. El despliegue cloud figura como entregable adicional: se planifican **ambas** ejecuciones, local y cloud.

La interfaz se organiza en un frontend React separado del backend Python/FastAPI, según la preferencia expresada por el equipo. Ver el [diagrama de arquitectura](architecture-diagram.md).

## Alcance de la PoC

Historia central: como operador, quiero solicitar certificados para los alumnos de un curso, consultar el avance y obtener los documentos emitidos, aunque se interrumpa el procesamiento, para evitar rehacer el lote o emitir duplicados.

| Capacidad | Prioridad | Recorte propuesto |
| --- | --- | --- |
| Carga de lote | Confirmada por el equipo | CSV de aprobados; se rechaza completo indicando qué corregir si alguna fila tiene datos inválidos (confirmado). Formato y límite propuesto de 100 filas pendientes de especificación |
| Procesamiento asincrónico | Obligatoria | Solicitud persistida, respuesta sin esperar toda la emisión, un trabajo por certificado |
| Recuperación y duplicados | Obligatoria | Recuperar trabajos tras caída; reintentos limitados; misma solicitud no crea otra emisión |
| Registro blockchain | Obligatoria para este recorte | Contrato mínimo en red EVM local, con emisor autorizado y huellas de certificados |
| Consulta y descarga | Confirmada por el equipo | Operador consulta lotes; alumno accede a “Mis certificados” y descarga sus PDFs con QR |
| Verificación | Confirmada por el equipo | Consulta pública por QR de los datos registrados y subida del PDF para comparar su huella con el contrato |
| Visibilidad de errores | Obligatoria | Fallos identificables, cola de fallidos y logs correlacionados |
| Cuentas y portal del alumno | Confirmada por el equipo | Cuentas precargadas, CSV vinculado por email, listado y descarga de certificados propios |
| Interfaz web mínima | Necesaria para el alcance solicitado | Acceso de operador y alumno, carga, avance, “Mis certificados” y verificación pública; integrar primero por API |
| PDF y QR | Confirmada por el equipo | PDF sencillo con enlace QR a la verificación web |
| Revocación y reemisión corregida | Opcional posterior, por decisión del equipo | No integra el compromiso inicial; reevaluar si queda tiempo tras estabilizar el flujo central |

El PDF descargado será el certificado de esta PoC: contendrá identificador, institución, curso, alumno y fecha de finalización; la fecha de emisión puede agregarse como dato adicional. El equipo confirmó certificados de cursos y carga por CSV de personas ya aprobadas. Se propone registrar la huella del archivo exacto; están confirmadas la consulta por QR y la subida del PDF para verificar integridad. Una modificación de contenido o formato cambia la huella; la interfaz debe indicar que se suba el archivo original. No afirmar compatibilidad con estándares de credenciales verificables.

## Reglas de producto acordadas

- Cada fila identifica por email a un alumno precargado. Para este recorte, un email sin cuenta correspondiente debe informarse como error de validación; no se crean cuentas automáticamente.
- Un alumno tiene como máximo un certificado por institución, nombre del curso y fecha de finalización. Antes de aceptar el lote se detectan repeticiones dentro del CSV y solicitudes ya existentes o en proceso; se informa qué retirar/corregir y no se inicia el lote. Cursos o fechas diferentes permiten otros certificados para el mismo alumno.
- Una carga repetida por un problema de conexión debe reconocer la misma solicitud (idempotencia HTTP), sin confundirla con una nueva carga deliberada de duplicados.
- La consulta pública por QR muestra nombre del alumno, institución, curso, fecha de finalización e identificador. No muestra email, credenciales ni otros datos de la cuenta, ni ofrece acceso general a los certificados de ese alumno.
- El QR consulta el registro; no prueba por sí solo que el PDF que lo contiene esté intacto. La subida del PDF comprueba la huella del archivo.

## Límites de la demostración

La verificación acredita coincidencia con lo registrado por el emisor configurado. No prueba que la persona aprobó realmente el curso ni reemplaza la acreditación de la institución. Conocer la identidad del emisor y confiar en su clave sigue siendo necesario.

La cadena local permite probar contrato, permisos y detección de cambios, pero el equipo controla esa infraestructura: no demuestra descentralización ni inmutabilidad frente al administrador de la máquina. Guardar una huella tampoco equivale a publicar el documento. Solo se almacenan identificadores opacos y huellas en cadena; los datos del alumno quedan fuera de ella. Las pruebas usan información ficticia.

La promesa de verificación «sin costo» se interpreta como sin intervención manual por consulta, no como infraestructura gratuita a escala. Las mejoras de costos y tiempos del caso de negocio original son hipótesis: la PoC solo mide su comportamiento técnico. El horizonte de cuatro meses del caso de negocio corresponde al producto futuro y no al plazo académico actual.

## Fuera de alcance

Aplicación móvil, billeteras de usuarios, NFTs/tokens, red pública, múltiples instituciones, marketplace, cobros, integración con sistemas académicos, reconocimiento legal de títulos, recuperación de claves de usuarios, alta disponibilidad, Kubernetes, estándares completos de credenciales y métricas comerciales con usuarios reales.

Se confirmaron datos del curso en el formulario de carga y alumnos precargados vinculados por email. También se confirmó detectar certificados duplicados entre lotes antes de aceptar el CSV y mostrar solo los datos académicos acordados en la consulta pública. Se confirmó rechazar todo el CSV ante datos inválidos; las fallas técnicas durante una emisión se tratan individualmente. La revocación queda como ampliación opcional: no se incluye en el compromiso inicial ni se descarta como evolución.

## Criterios de éxito propuestos

1. Una máquina con Docker Compose levanta y prepara todos los servicios sin instalar Python o herramientas blockchain en el host.
2. Un lote sintético de 20 alumnos termina con 20 certificados distintos; se conserva el detalle por alumno.
3. Detener el worker durante una emisión y reiniciarlo permite terminar el lote sin certificados perdidos ni duplicados.
4. Reenviar el mismo mensaje, incluso después del registro en cadena, no crea otra emisión ni otro registro lógico.
5. Una falla transitoria se recupera y una permanente termina visible tras un número acotado de intentos; el resto del lote sigue avanzando.
6. Un archivo emitido verifica; modificar un campo falla; un identificador inexistente no verifica. Si el nodo no responde, se informa «no se pudo verificar», sin confundirlo con documento inválido.
7. Un lote aceptado mientras RabbitMQ está temporalmente detenido se procesa después de su recuperación, usando las solicitudes persistidas.
8. El mismo flujo se reproduce en cloud y otra persona lo ejecuta siguiendo el README.
9. Cada alumno ve y descarga sus propios certificados; no puede descargar los de otro alumno ni ejecutar acciones de operador.
10. Un CSV con datos inválidos o certificados duplicados devuelve indicaciones de corrección y no inicia emisiones.
11. La consulta pública expone únicamente los datos académicos acordados, sin información de la cuenta.

Registrar tiempos observados de aceptación y finalización del lote, cantidad emitida, duplicados y recuperación; no inventar resultados ni extrapolarlos a escala productiva. La infraestructura y los atributos verificables se detallan en [arquitectura](architecture.md); la secuencia y los recortes en [plan de trabajo](implementation-plan.md).
