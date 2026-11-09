# Mapa de decisiones

## Destino

Definir producto, alcance y arquitectura realizables por cuatro integrantes con pocas horas hasta el 19/11/2026, preservando una PoC defendible y todos los entregables académicos.

## Decisiones abiertas

| Pregunta | Dependencia | Cómo resolverla |
| --- | --- | --- |
| ¿Qué cuenta permite provisionar una VM sin desembolso? | Elegibilidad y cupo del proveedor | Validar Azure for Students; alternativa Google Cloud Free Trial. Resolver el 09/11; ver arquitectura |
| ¿La VM disponible alcanza para la composición completa? | Cuenta habilitada | Medir memoria con todos los servicios y correr un lote antes del 12/11 |
| ¿Quién toma cada frente y qué disponibilidad efectiva hay? | Organización del equipo | Asignar cuatro responsables y estimar con el alcance de portal/PDF ya acordado; no asumir capacidad confirmada |

## Decisiones tomadas y propuestas

El usuario confirmó el alcance base al finalizar la entrevista del 09/11/2026. No quedan decisiones funcionales bloqueantes para comenzar la especificación; las dependencias cloud y de disponibilidad siguen abiertas.

- **Confirmado por el equipo:** emisión por lote con RabbitMQ como tecnología de la cátedra. [Alcance](project.md#alcance-de-la-poc).
- **Confirmado por el equipo:** blockchain local, cuatro integrantes, pocas horas y sin inversión en hosting. [Restricciones](project.md).
- **Confirmado por el equipo:** separación clara de frontend y backend. La propuesta actual reemplaza Jinja2 por React; ver el [diagrama](architecture-diagram.md).
- **Recomendación técnica por pedido del equipo:** Python/FastAPI, PostgreSQL, Pika, SQLAlchemy, web3.py, Solidity/Anvil y Docker Compose; frontend React + TypeScript + Vite separado, servido por Nginx. [Arquitectura](architecture.md).
- **Confirmado por el equipo:** certificados de finalización de cursos, CSV de personas ya aprobadas y PDF sencillo con QR y verificación web. [Alcance](project.md#alcance-de-la-poc).
- **Confirmado por el equipo:** una institución con un operador precargado; consulta pública por QR y subida del PDF para verificar integridad. [Producto](project.md).
- **Confirmado por el equipo:** diferir revocación, conservándola como ampliación opcional si hay tiempo. [Alcance](project.md#alcance-de-la-poc).
- **Confirmado por el equipo:** cuentas de alumnos precargadas con “Mis certificados” y descarga personal; asociación por email desde el CSV. Reemplaza el recorte inicial sin cuentas de alumnos.
- **Confirmado por el equipo:** rechazar el CSV completo ante datos inválidos, indicando qué corregir antes de aceptar. Las fallas técnicas posteriores se tratan por certificado.
- **Confirmado por el equipo:** formulario único con nombre del curso, fecha de finalización y CSV, sin administración separada de cursos.
- **Confirmado por el equipo:** detectar duplicados de alumno/curso/fecha antes de aceptar el lote y pedir corregir el CSV; cursos o fechas diferentes permiten nuevas certificaciones. [Reglas](project.md#reglas-de-producto-acordadas).
- **Confirmado por el equipo:** consulta pública con nombre, institución, curso, fecha e identificador, sin email ni datos de cuenta. [Reglas](project.md#reglas-de-producto-acordadas).
- **Diseño propuesto:** una base de código con API, publicador y worker; persistencia de solicitudes y outbox; procesamiento idempotente. [Flujo](architecture.md#flujo-y-consistencia).
- **Plan propuesto:** completar primero el recorrido por API; integrar después las vistas mínimas acordadas y dejar las mejoras visuales para el final. [Secuencia](implementation-plan.md).

No se crean ADRs por rutina: estas elecciones iniciales se explican en la arquitectura. Si aparece una decisión costosa de revertir que requiera contexto adicional, registrar un ADR y enlazarlo aquí.

## Todavía sin especificar

Contratos exactos de API/mensajes, esquema CSV definitivo, normalización de nombre de curso/email para reconocer duplicados, respuestas de error, configuración de reintentos y comandos de demo. Son trabajo de especificación/implementación posterior; sus objetivos ya están establecidos. Tampoco se redactaron todavía el white paper final ni las diapositivas: necesitan resultados reales.

El diseño visual del PDF todavía no se especificó. Registro de cuentas, invitaciones y recuperación de contraseña no integran el compromiso inicial. Revocación es una ampliación opcional, sin reglas detalladas todavía. Múltiples instituciones quedan fuera de alcance por decisión del equipo. [Exclusiones](project.md#fuera-de-alcance).

## Fuera de alcance

Ver [exclusiones del proyecto](project.md#fuera-de-alcance). Este mapa no crea tickets ni autoriza implementación o aprovisionamiento cloud.
