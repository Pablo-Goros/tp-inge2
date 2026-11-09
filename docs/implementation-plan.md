# Plan de trabajo hasta la entrega

El objetivo es terminar un recorrido verificable con RabbitMQ, blockchain local, ejecución en Compose y cloud. No se planifica completar la visión comercial en el plazo académico. Alcance base confirmado por el usuario el 09/11/2026. Este documento ordena capacidades y dependencias; no crea tickets ni reemplaza las futuras especificaciones.

## Capacidad y criterio de recorte

Son cuatro integrantes con pocas horas. La estimación preliminar de 32–48 horas-persona se hizo antes de acordar PDF/QR y portal de alumnos; **no usarla como compromiso para el alcance actual**. También se decidió separar frontend React y backend Python. Falta contrastar disponibilidad y estimar estos frentes con el equipo. El plan de fechas fija puntos de control y recorte, no garantiza capacidad. Si las tecnologías son nuevas para todos, incluir aprendizaje e integración; comprobar el primer recorrido el 11/11 antes de ampliar funcionalidades.

Orden de construcción: primero un recorrido técnico completo; después completar recuperación, permisos y vistas mínimas de operador/alumno/verificación, manteniendo reproducción local y cloud. Documentación y ensayo son parte de la entrega, no ampliaciones. Investigación y white paper se alimentan desde el primer día, sin esperar a terminar el código.

## Secuencia y puntos de control

| Fecha de 2026 | Resultado esperado | Dependencias y recorte |
| --- | --- | --- |
| 08–09/11 | Acordar recorte, repartir frentes, habilitar cuenta cloud y comprobar una VM | Resolver elegibilidad cloud temprano; no empezar por diseño visual |
| 09–10/11 | Compose arranca infra, aplicación e inicialización; una emisión manual registra una huella | Nodo/contrato y persistencia listos; fijar versiones y formato de archivo. En paralelo, preparar acceso y vistas básicas de operador/alumno |
| 10–11/11 | Recorrido por API: aceptar lote → RabbitMQ → worker → contrato → consulta/descarga → verificación | Primera integración de todos los frentes; sin esta evidencia no ampliar alcance |
| 12–13/11 | Recuperación: outbox, confirmaciones, deduplicación y reentrega tras caída | Probar los puntos entre escritura y ACK; desplegar el recorrido en la VM e integrar “Mis certificados” |
| 14–15/11 | Fallos transitorios/permanentes, visibilidad y pruebas de documentos alterados | Completar carga, avance y verificación web; comprobar permisos de alumno y obtener medidas/capturas reales |
| 16–17/11 | Cerrar white paper, README, datos y guion; prueba de otra persona desde cero | Corregir reproducibilidad, configuración y credenciales cloud |
| 18/11 | Ensayo integral y versión candidata | Congelar alcance; no sumar mejoras visuales, wallet ni integraciones |
| 19/11 | Entregar white paper, repositorio/PoC y acceso cloud | Confirmar ubicación y horario de entrega en el aula; el PDF no especifica horario |
| 20–25/11 | Ensayar exposición/demo y preparar preguntas | Corregir defectos de demo conservando una versión de entrega identificable |
| 26/11 | Defensa | 10 minutos exposición/setup, 10 demo, 10 preguntas |

## Reparto orientativo para cuatro personas

| Frente | Responsabilidad principal | Resultado que integra |
| --- | --- | --- |
| A — Frontend | React separado: sesión, operador, alumno, verificación pública e integración HTTP | Pantallas conectadas a la API; sin lógica de emisión en el navegador |
| B — Backend y publicación | FastAPI, permisos, lotes/certificados, persistencia, outbox y publicación RabbitMQ | API y aceptación/publicación recuperable de solicitudes |
| C — Emisión y blockchain | Worker, PDF/QR, contrato, cliente Python, hash y verificación/reconciliación | Emisión idempotente y verificación del archivo, coordinada con B |
| D — Ejecución y evidencia | Compose, inicialización, cloud, escenarios y coordinación del white paper | Reproducción local/cloud y evidencia técnica |

Cada frente tiene un responsable; no son cuatro silos. A y B acuerdan contrato HTTP, sesión y estados; B y C acuerdan identificador estable y cuándo una emisión termina; C y D acuerdan despliegue y persistencia del contrato. Integrar un recorrido pequeño antes de avanzar por separado. Todos deben poder explicar el papel de RabbitMQ en la defensa.

## Experimentos y verificaciones necesarios

Ejecutarlos contra servicios reales en Compose. Guardar resultado observado, IDs y logs pertinentes; el white paper informa limitaciones además de éxitos.

| Escenario | Qué demostrar |
| --- | --- |
| Lote de 20 alumnos | Recuento final correcto, artefactos descargables y registro verificable |
| Worker detenido antes del ACK | Reentrega al volver, sin pérdida ni duplicado |
| Worker cae después de registrar en cadena | Reconciliación del registro existente, sin segunda emisión |
| Mismo mensaje y mismo envío HTTP repetidos | Idempotencia del efecto y de la aceptación del lote |
| Broker apagado tras aceptar el lote | Outbox pendiente y publicación posterior al recuperarse |
| Error transitorio controlado | Reintentos acotados y finalización posterior |
| Error permanente controlado | Error persistido, mensaje aislado y resto del lote completado |
| Archivo original, alterado y desconocido | Verificación distingue los resultados |
| Nodo blockchain no disponible | Resultado temporal de indisponibilidad; no declarar válido o inválido sin comprobar |
| Arranque limpio y segundo arranque | `docker compose up` inicializa y después reutiliza el estado sin duplicarlo |
| Acceso de alumno | Solo lista/descarga sus certificados; no accede a certificados ajenos ni acciones de operador |
| CSV inválido o duplicado | Se informan filas a corregir sin iniciar ninguna emisión |
| Consulta pública | Muestra los datos académicos acordados y no expone email ni información de cuenta |
| Recorrido en cloud | Misma funcionalidad y acceso privado de la cátedra comprobado |

La inyección de fallos debe ser explícita y repetible en el modo demo, no aleatoria ni dependiente de que internet falle. No hace falta una suite extensa de UI: priorizar los puntos donde aparecen efectos duplicados, pérdidas o verificaciones incorrectas.

## Recortes si el plazo se complica

1. Eliminar email y presentación visual elaborada; mantener el PDF y QR sencillos que el equipo confirmó. Un recorte adicional de esa funcionalidad necesita conversarse.
2. Usar OpenAPI y scripts durante la integración. La vista “Mis certificados” fue solicitada por el equipo: si la UI no llega, acordar explícitamente ese recorte en vez de darla por opcional.
3. Mantener un solo worker y el formulario de curso acordado; no agregar administración de cursos ni demostrar escalado horizontal.
4. Si al 11/11 no hay recorrido completo, reducir lote y formatos de entrada, concentrar al equipo en integración y revisar la estimación.
5. Si al 13/11 falta integración blockchain, comunicar el riesgo y acordar el cambio de alcance. Un registro simulado puede ayudar a desarrollar, pero no presentarlo como blockchain implementada.

No recortar silenciosamente el white paper, Docker Compose, el despliegue cloud, el caso no trivial o la explicación de alternativas: son exigencias del enunciado. El presupuesto cero hace que el acceso cloud sea una dependencia temprana, no un extra final.

## White paper y defensa

Esquema sugerido para las cinco páginas del cuerpo del white paper:

1. Problema, actores, valor y alcance real de la PoC.
2. Alternativas y decisión técnica, vinculadas a necesidades del negocio.
3. Arquitectura, recorrido y responsabilidades de RabbitMQ y blockchain.
4. Investigación aplicada: confirmaciones, idempotencia, outbox, fallos y atributos de calidad.
5. Resultados observados, limitaciones, recursos/tiempo y evolución posible.

Anexos: instrucciones completas, casos de prueba, referencias y capturas. No trasladar toda la explicación central a anexos para eludir el límite. Estos documentos de planificación no son todavía el white paper.

Demo de diez minutos: cargar un lote pequeño, observar progreso, interrumpir y recuperar el worker, comprobar ausencia de duplicados, entrar como alumno para descargar su PDF y verificar original frente a archivo alterado. Preparar el escenario de error permanente con datos listos si el ensayo muestra que entra en tiempo; conservar logs de los escenarios restantes como evidencia. Tener ejecución local preparada, además de cloud; no sustituye el entregable desplegado.

La exposición debe explicar también por qué una solución centralizada podría ser suficiente, qué agrega la mensajería, qué limita la cadena local y qué no se midió del beneficio comercial.
