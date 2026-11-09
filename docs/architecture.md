# Arquitectura propuesta

Diseño para la PoC, todavía no implementado. El equipo pidió separación clara de frontend y backend: se adopta React como propuesta de frontend separado y se mantiene Python/FastAPI para el backend. Ver el [diagrama de arquitectura y sus módulos](architecture-diagram.md). RabbitMQ y blockchain local están confirmados por el equipo. Se propone un monolito modular con procesos separados para HTTP, publicación y procesamiento; comparten código y PostgreSQL. No se necesitan microservicios independientes por cada entidad.

## Stack y responsabilidades

| Componente | Tecnología propuesta | Motivo |
| --- | --- | --- |
| API HTTP | Python + FastAPI + Pydantic | Reglas de negocio, permisos y validación; interfaz HTTP consumida por React |
| Frontend separado | React + TypeScript + Vite | Vistas de operador, alumno y verificación pública; consulta periódica del avance vía API |
| Entrada web | Nginx | Servir archivos del frontend y reenviar `/api` a FastAPI bajo una URL de entrada |
| Documentos | ReportLab + qrcode | Generar un PDF sencillo con QR desde Python, sin otro servicio de renderizado |
| Persistencia | PostgreSQL + SQLAlchemy + Alembic | Transacciones, unicidad y estado compartido entre procesos; migraciones reproducibles |
| Mensajería | RabbitMQ + Pika | Cola de trabajos, confirmaciones y recuperación; tecnología investigada para la materia |
| Procesamiento | Worker Python del mismo proyecto | Construye el certificado, registra su huella y guarda el resultado |
| Publicación confiable | Proceso Python que lee outbox | Recupera solicitudes aceptadas aunque el broker estuviera caído |
| Registro | Solidity mínimo + Anvil + web3.py | Cadena EVM de desarrollo, transacciones reales locales y lectura del contrato desde Python |
| Ejecución | Docker Compose | Una composición para local y VM cloud, con inicialización automática |
| Verificación técnica | pytest e integración con los servicios reales | Probar recuperaciones y duplicados donde las simulaciones no alcanzan |

No fijar versiones por memoria: elegir versiones soportadas y compatibles al iniciar, fijar imágenes/dependencias y comprobarlas con un arranque limpio. No usar etiquetas `latest` como base de reproducibilidad.

FastAPI ofrece documentación interactiva basada en OpenAPI; sirve como primera interfaz de demo ([documentación oficial](https://fastapi.tiangolo.com/)). La selección de Python responde al plazo y a la integración de CSV, HTTP y procesamiento. TypeScript/Fastify o Java/Spring también podrían resolverlo; el frontend separado usa TypeScript, mientras el backend permanece en Python. Solidity queda restringido al contrato mínimo.

## Componentes y límites

El [diagrama de componentes](architecture-diagram.md#vista-de-componentes-y-despliegue) muestra navegador, servidor web, API, procesos de emisión e infraestructura. Sus módulos internos se describen en las tablas de ese documento.


- **API:** acepta lotes, consulta avance, descarga documentos y verifica archivos. No espera a emitir todo el lote para responder. La verificación consulta directamente el registro, sin pasar por la cola de emisión.
- **Publicador:** publica solicitudes pendientes y marca la salida confirmada. Es otro comando del mismo paquete, no otro producto ni otro repositorio.
- **Worker:** procesa una emisión por vez inicialmente; confirma el mensaje al terminar de persistir el resultado. Un segundo worker es una extensión posterior, porque compartir una cuenta blockchain exige coordinar nonces y concurrencia.
- **PostgreSQL:** autoridad del estado operativo: institución y usuarios precargados, datos de cursos recibidos con los lotes, solicitudes, certificado exacto, intentos, errores y outbox. No crear un servicio CRUD por entidad.
- **RabbitMQ:** transporte de trabajos, no base de datos del negocio. Los mensajes llevan identificadores y correlación; el worker lee los datos académicos desde PostgreSQL.
- **Contrato:** autoridad para la asociación entre identificador opaco de certificado y huella registrada por el emisor configurado. La verificación debe usar dirección de contrato y red confiables de la aplicación, nunca las que indique arbitrariamente el archivo recibido.

## Accesos y portal del alumno

El equipo pidió cuentas de alumnos con una vista “Mis certificados” y descarga propia. La institución es la organización emisora; el operador es una persona autorizada de esa organización, no el administrador de todas las instituciones. La PoC tiene una sola institución y un operador precargados.

La API distingue acciones de operador (cargar y consultar lotes) y de alumno (listar y descargar sus certificados), aplicando permisos también al solicitar cada archivo. La verificación por QR y subida de PDF sigue siendo pública. El equipo confirmó cuentas de alumnos sintéticas precargadas y correspondencia por email con las filas del CSV. El formulario de operador recibe nombre del curso, fecha de finalización y CSV, sin una sección separada de administración de cursos. La consulta pública por identificador muestra nombre del alumno, institución, curso y fecha, sin email ni datos de cuenta. El portal se implementa en React, en un proyecto separado que consume la API. Los permisos se comprueban en FastAPI, incluido el acceso a cada archivo.

## Flujo y consistencia

1. El operador sube un CSV acotado. La API valida el archivo completo; el equipo confirmó que ante filas inválidas o duplicados debe informar cuáles y no aceptar el lote ni iniciar emisiones. Un alumno precargado se identifica por email; se detectan duplicados de alumno/curso/fecha dentro del CSV y contra solicitudes existentes. La validación académica de la aprobación es responsabilidad del emisor.
2. En una transacción guarda lote, solicitudes y entradas de outbox. Responde con un identificador para consultar el avance. Una clave de idempotencia evita duplicar el lote ante un reenvío HTTP; una clave reutilizada con contenido diferente debe rechazarse. La comprobación de duplicados de negocio debe respaldarse con una restricción única en base, para evitar carreras entre cargas simultáneas; definir la normalización en la especificación.
3. El publicador lee outbox, publica con confirmación del broker y comprueba que el mensaje tenga una ruta válida. Marca la entrada publicada después de la confirmación. Si cae antes de marcarla, puede volver a publicarla: el consumidor debe tolerarlo.
4. El worker busca la solicitud. Si ya terminó, confirma sin repetir efectos. Si no, guarda primero los bytes definitivos del certificado y su huella SHA-256 para reutilizarlos en cualquier reintento. No regenerar fechas o IDs en cada entrega.
5. Registra la huella con el identificador estable en el contrato. El contrato permite al emisor autorizado registrar una vez: la misma huella no cambia nada y una huella distinta para el mismo identificador se rechaza. Ante timeout o caída posterior a una transacción, consultar el registro antes de volver a enviar.
6. Una vez confirmado el registro, guarda el resultado en PostgreSQL y confirma el mensaje con ACK manual. PostgreSQL y blockchain no comparten transacción: su reconciliación por identificador estable es parte central de la PoC.
7. Ante una falla transitoria aplica pocos reintentos con espera y contador persistido; como punto de partida, tres intentos. Ante falla permanente, deja el error terminal en PostgreSQL y rechaza sin reencolar hacia una dead-letter queue configurada. Evitar `requeue` inmediato infinito. La base conserva el error aunque falle la transferencia a la cola de fallidos.
8. Para verificar se sube el archivo original. La API calcula su huella y consulta el registro. Diferenciar coincidencia, ausencia de registro, alteración y servicio temporalmente no disponible.

PostgreSQL permite agrupar cambios en una transacción mediante SQLAlchemy ([documentación](https://docs.sqlalchemy.org/en/20/orm/session_transaction.html)). El outbox propuesto aplica esa propiedad a la aceptación del lote; no convierte una escritura en base y una publicación AMQP en una sola transacción distribuida.

RabbitMQ distingue la confirmación de publicación de la confirmación del consumidor. Las colas durables y mensajes persistentes se complementan con publisher confirms; la reentrega exige consumidores idempotentes ([confirmaciones](https://www.rabbitmq.com/docs/confirms)). Se diseña para entrega **al menos una vez**, no para prometer ejecución exactamente una vez ([guía de confiabilidad](https://www.rabbitmq.com/docs/reliability)). El procesamiento en segundo plano y la distribución de trabajos son el caso de uso de las work queues ([tutorial oficial](https://www.rabbitmq.com/tutorials/tutorial-two-python)).

El flujo es una cola de comandos de emisión; no requiere un bus de eventos con muchos consumidores. Pub/sub con notificaciones es una extensión posible, pero no se agrega solo para mostrar otra función del broker.

## Registro y verificación

El contrato mínimo registra identificador y huella, limita la escritura al emisor configurado y permite consultas. Se evita publicar nombre, email o documento personal en cadena. Una huella no se trata como garantía universal de anonimato.

Anvil es un nodo Ethereum para desarrollo con manejo de estado ([documentación de Foundry](https://www.getfoundry.sh/anvil/index.html)); web3.py permite desplegar e invocar contratos ([transacciones](https://web3py.readthedocs.io/en/stable/transactions.html)). Toda la red de la demo queda en una sola máquina, también en cloud: allí «blockchain local» significa privada al entorno de la PoC, no necesariamente a la computadora del desarrollador.

Conservar el archivo exacto descargable en PostgreSQL evita almacenamiento de objetos para esta escala. La verificación compara el archivo subido con el contrato; no debe limitarse a comparar contra una copia en la base de datos. El PDF con QR está confirmado. Se propone generarlo una sola vez, incluyendo el QR con la URL estable del certificado antes de calcular la huella; conservar esos bytes y no modificar el archivo después del registro. El QR no debe incluir el hash del propio PDF, lo que introduciría una dependencia circular. Se proponen [ReportLab](https://pypi.org/project/reportlab/) para el PDF y [qrcode](https://pypi.org/project/qrcode/) para el QR. Definir la URL pública antes de emitir el lote de demo: cambiar el QR después alteraría el archivo registrado.

Persistir el estado del nodo junto con sus metadatos de despliegue y comprobarlo al arrancar. Si el nodo fue reiniciado sin su estado, no seguir mostrando certificados como verificables por el solo hecho de estar en PostgreSQL: detectar la discrepancia. Para una demo de datos descartables puede existir un reset explícito que reinicie **base y cadena juntas**. No prometer recuperación de caída abrupta del nodo hasta probarla; la recuperación obligatoria inicial cubre worker, publicador y broker, no una pérdida de disco.

La revocación no integra el compromiso inicial. Mantener identificadores estables y el acceso al registro detrás de un adaptador permite ampliarlo después sin repartir lógica blockchain por la aplicación. No implementar anticipadamente un framework de estados: agregar revocación exigirá cambios en el contrato y, en esta PoC local, un redespliegue y una estrategia explícita para los datos previos.

## Arranque con un único comando

**Requisito confirmado:** después de clonar el repositorio, `docker compose up` debe construir lo que falte, iniciar e inicializar toda la PoC. No requerir `pip install`, compilar Solidity en el host ni desplegar el contrato manualmente. Docker con Compose e internet para descargar las imágenes son los requisitos del host.

Servicios previstos:

- `web`, imagen separada que construye React con Vite y sirve sus archivos mediante Nginx; reenvía `/api` a `api`. Node solo se necesita en la fase de construcción dentro de Docker.

- `postgres`, `rabbitmq` y `anvil`, con volúmenes y comprobaciones de salud.
- `init`, tarea de una sola ejecución: migraciones, datos sintéticos y despliegue/validación del contrato. Compilar el contrato dentro de la imagen o incorporar artefactos reproducibles generados durante su construcción.
- `api`, `publisher` y `worker`, desde la misma imagen de aplicación, con comandos distintos. Arrancan cuando `init` finaliza correctamente y sus dependencias están saludables.

El arranque debe ser idempotente: no borrar datos, duplicar la institución ni desplegar otro contrato en cada `up`. Compartir la dirección del contrato mediante metadatos persistidos y comprobar que exista en la red esperada. Una red vacía se inicializa automáticamente; una inconsistencia persistida se informa.

`depends_on` sin healthchecks no garantiza que un servicio esté listo; usar `service_healthy` y `service_completed_successfully` para la tarea de inicialización ([Docker Compose](https://docs.docker.com/compose/how-tos/startup-order/)). Además, los clientes deben reconectarse ante interrupciones posteriores al arranque.

La configuración local debe tener valores de demo para que el comando funcione sin preparar archivos manuales. Para cloud se sustituyen secretos mediante configuración privada; no usar las credenciales de desarrollo como credenciales del despliegue público.

## Atributos de calidad y evidencia

| Necesidad de negocio | Decisión | Evidencia prevista / costo |
| --- | --- | --- |
| No repetir el trabajo de un lote interrumpido | Persistencia, ACK manual, outbox | Reiniciar worker/publicador y finalizar el lote; más estados y lógica de recuperación |
| No duplicar certificados | ID estable, unicidad e idempotencia en contrato | Reentregar después de registrar en cadena; requiere diseñar los efectos antes del ACK |
| Aceptar un lote sin esperar todo su procesamiento | Cola y worker | Separar tiempo de aceptación y finalización; consistencia eventual visible al usuario |
| Reconocer documentos modificados | Huella del archivo y registro del emisor | Original válido y versión alterada rechazada; depende de confiar en emisor/red |
| Diagnosticar un error por participante | Estado persistido, intentos y correlación | Identificar fallo sin revisar todo el lote; registrar datos técnicos mínimos |
| Ejecutar igual en el equipo y en cloud | Compose e inicialización automática | Arranque limpio siguiendo README; una sola VM sigue siendo punto único de falla |

## Alternativas relevantes

La comparación es un juicio de adecuación para **este alcance y plazo**, no un ranking general de herramientas.

| Alternativa | A favor | Costo / decisión para esta PoC |
| --- | --- | --- |
| HTTP sin cola | Menos servicios; apropiado para emisión individual simple | Un lote espera a dependencias y necesita su propio mecanismo de recuperación; referencia para justificar la cola, no tecnología de la cátedra |
| RabbitMQ | Cola de trabajos con confirmaciones y reentregas | Necesita idempotencia y operación del broker; recomendado para solicitudes independientes de emisión |
| Kafka | Registro de eventos retenidos y múltiples consumidores con relectura | Conveniente si auditoría/reprocesamiento de eventos fueran el centro; agrega decisiones de particiones y consumo que no exige esta PoC ([introducción](https://kafka.apache.org/intro/)) |
| Prefect | Flujos de Python con estados y reintentos | Alternativa sólida si se prioriza visualizar y operar el workflow; elegiríamos orquestación de un flujo en lugar de estudiar explícitamente entrega AMQP ([flows](https://www.prefect.io/docs/v3/concepts/flows)) |
| Airflow | Orquestación de pipelines por lotes con dependencias | Útil para importaciones académicas programadas; ese flujo no es el foco elegido ([documentación](https://airflow.apache.org/docs/apache-airflow/stable/index.html)) |
| n8n | Automatizaciones e integraciones con gestión de errores | Útil para conectar sistemas, email y avisos; esas integraciones están fuera del recorte ([errores](https://docs.n8n.io/flow-logic/error-handling/)) |
| Registro en DB o firma sin blockchain | Menor complejidad; puede resolver verificación bajo confianza centralizada | Alternativa válida de producto. Se mantiene blockchain local por la propuesta original y decisión del equipo, sin atribuirle descentralización |

## Despliegue sin inversión

Propuesta: una VM Linux con Docker Compose; punto de partida para comprobar, no requisito medido: 2 vCPU y 4 GB de RAM. Aloja todos los contenedores y volúmenes. No presupuestar servicios administrados separados ni un cluster.

1. Intentar **Azure for Students**, si un integrante cumple la elegibilidad: publica USD 100 de crédito por 12 meses sin tarjeta ([oferta oficial](https://azure.microsoft.com/en-gb/free/students/)). Es crédito limitado, no una VM gratuita ilimitada.
2. Alternativa: **Google Cloud Free Trial**, que publica USD 300 por 90 días para usuarios elegibles y requiere verificación; no habilitar una actualización a facturación paga para esta entrega ([condiciones](https://cloud.google.com/signup-faqs)).

Ofertas consultadas el 08/11/2026. Validar elegibilidad, recursos y estimación de consumo en la cuenta antes de elegir tamaño; no se abrió ninguna cuenta ni se aprovisionaron recursos durante esta planificación. Si ninguna opción está disponible, la exigencia cloud sigue pendiente y debe resolverse con la cátedra; una demo solo local no se considera equivalente.

Exponer únicamente la web/API con transporte protegido y acceso de operador. Mantener PostgreSQL, AMQP y RPC de Anvil en la red interna; acceso a la consola RabbitMQ por túnel o acceso privado. Las cuentas prefinanciadas de Anvil son de prueba y no deben custodiar valor. Dar a la cátedra usuario de demo y URL por canal privado, sin compartir la cuenta personal del proveedor cloud.

## Estructura de código sugerida

```text
frontend/
  src/
    features/          # sesión, operador, alumno, verificación pública
    api/               # cliente HTTP del backend
    components/        # componentes compartidos
  Dockerfile           # construcción Vite y servidor Nginx
  nginx.conf           # archivos React, rutas y proxy /api
backend/
  app/
    api/               # rutas HTTP de cuentas, lotes, certificados y verificación
    domain/            # términos, reglas e identificadores
    application/       # casos de uso de la API y el worker
    infrastructure/    # PostgreSQL, RabbitMQ, PDF/QR y cliente blockchain
    entrypoints/       # API, publicador, worker e inicialización
  migrations/
  tests/
  Dockerfile
contracts/             # contrato, pruebas y artefactos reproducibles
sample-data/           # CSV sintético y archivos para demo
scripts/               # escenarios reproducibles
docs/
compose.yaml
README.md
```

Es una propuesta de organización, no carpetas creadas ni especificaciones de endpoints. El dominio no importa FastAPI, Pika o web3.py; los adaptadores de infraestructura concentran esas dependencias.
