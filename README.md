# Certificados académicos verificables

Una aplicación web para emitir certificados de cursos por lote y verificar la integridad de los PDF emitidos. El operador carga la lista de alumnos por CSV y sigue el avance de cada emisión. Cada alumno puede descargar sus certificados, y cualquier persona puede consultar los datos de un certificado mediante su QR o comprobar si el PDF coincide con el original.

El proyecto es una prueba de concepto de Ingeniería de Software II. Usa RabbitMQ para procesar la emisión en segundo plano y recuperar el trabajo cuando el broker o el worker vuelven a estar disponibles.

## Puesta en marcha

Con Docker y Docker Compose v2, ejecutá desde la raíz del repositorio:

```sh
docker compose up -d --build
docker compose ps -a
```

Cuando `init` termine con código 0 y el servicio `web` esté en ejecución, abrí la [aplicación](http://localhost:8080). La inicialización aplica las migraciones, carga las cuentas de ejemplo y configura las colas de RabbitMQ.

| Cuenta de ejemplo | Email | Contraseña |
| --- | --- | --- |
| Operador | `operador@demo.test` | `demo1234` |
| Alumno | `alumno01@demo.test` | `demo1234` |

Hay 25 cuentas de alumno, desde `alumno01@demo.test` hasta `alumno25@demo.test`. También podés crear una cuenta de alumno desde la pantalla de ingreso.

La configuración local viene incluida. Para personalizarla, copiá [`.env.example`](.env.example) a `.env`. Si accedés desde otra máquina, configurá `PUBLIC_BASE_URL` con la URL pública antes de emitir certificados, ya que esa URL queda grabada en el QR del PDF. La [consola local de RabbitMQ](http://localhost:15672) usa `certs` como usuario y contraseña por defecto.

Para detener los servicios y conservar los datos, ejecutá `docker compose down`.

## Probar la emisión y la verificación

1. Iniciá sesión como operador y creá un lote con un nombre de curso, una fecha de finalización y [`lote-20.csv`](sample-data/lote-20.csv). La pantalla del lote muestra el estado de cada solicitud.
2. Cuando se emita el lote, iniciá sesión como `alumno01@demo.test` y descargá el PDF desde **Mis certificados**.
3. Abrí el enlace del QR en la misma máquina donde levantaste la aplicación para consultar los datos académicos registrados. Desde esa misma página, subí el PDF para verificar su integridad. La página muestra **Válido** para el original y **Alterado** si la huella SHA-256 del archivo difiere de la registrada.

El CSV admite hasta 100 alumnos con cuenta. La columna `email` es obligatoria y `final_grade` es opcional. Una fila inválida o duplicada hace que se rechace todo el lote con indicaciones para corregirlo. Podés probar las notas opcionales con [`lote-con-notas.csv`](sample-data/lote-con-notas.csv) y el rechazo con [`con-error.csv`](sample-data/con-error.csv). Si volvés a usar los mismos alumnos, cambiá el curso o la fecha para cargar un lote nuevo.

## Arquitectura

- **Nginx** sirve la interfaz hecha en React y reenvía las solicitudes de `/api` a FastAPI.
- **FastAPI y PostgreSQL** validan el CSV y guardan el lote, sus solicitudes y los mensajes pendientes de publicación en una única transacción. La API confirma la recepción y el operador puede consultar el avance mientras se emiten los certificados.
- **El publicador** lee los mensajes pendientes del *outbox* de PostgreSQL y los envía a RabbitMQ. Marca cada mensaje como publicado cuando recibe la confirmación del broker. Si RabbitMQ se cae, los mensajes pendientes permanecen en PostgreSQL.
- **El worker** genera un PDF con QR, guarda el archivo y registra su huella antes de confirmar el mensaje. RabbitMQ puede volver a entregar el mensaje si el worker se interrumpe. La emisión es idempotente y reutiliza el certificado ya guardado. Los errores transitorios se reintentan con espera, con tres intentos totales por defecto. Los fallos definitivos quedan visibles en el lote y sus mensajes van a la cola de fallidos.
- **La verificación pública** consulta un registro simulado de solo inserción en PostgreSQL. El QR permite consultar los datos académicos publicados y la subida del archivo compara su huella con la registrada. El email y la nota quedan fuera de la consulta pública.

## Pruebas de integración

Con la aplicación levantada, ejecutá estos comandos desde la raíz del repositorio en Bash, con `curl` y `jq` disponibles:

```sh
bash scripts/run-all.sh
# Para probar solo la recuperación tras una caída de RabbitMQ
bash scripts/scenarios/03-broker-caido.sh
```

Los escenarios detienen y reinician servicios del entorno donde se ejecutan. Cubren la recuperación ante caídas del broker y del worker, los mensajes repetidos, los permisos y la verificación de archivos, entre otros casos. El resumen se escribe en [`evidence/RESUMEN.txt`](evidence/RESUMEN.txt).

## Repositorio

| Ruta | Contenido |
| --- | --- |
| [`backend/`](backend/) | API, publicador, worker, migraciones y pruebas de Python |
| [`frontend/`](frontend/) | Interfaz React y TypeScript, con instrucciones para desarrollo local y uso de la API simulada |
| [`compose.yaml`](compose.yaml) | Configuración de servicios, red y volúmenes |
| [`sample-data/`](sample-data/) | CSV para probar la carga de lotes |
| [`scripts/`](scripts/) | Escenarios de integración y automatización de despliegue |

Consultá el [contrato OpenAPI](frontend/openapi.json) para integrar la API, el [diagrama de arquitectura](docs/architecture-diagram.md) para seguir el recorrido de una solicitud y el [white paper](white-paper.md) para conocer las decisiones técnicas. Las instrucciones para desplegar en una VM están en la [guía de despliegue](docs/cloud-setup.md).
