# Certificados académicos con RabbitMQ — TP Integrador, Ingeniería de Software II

Prueba de concepto: una institución **emite certificados de cursos por lote**, los alumnos descargan su PDF con QR y cualquiera puede **verificar** que un certificado coincide con el registrado. El caso no trivial: **el lote termina aunque se caigan el worker o el broker, sin perder ni duplicar certificados.** La tecnología investigada es **RabbitMQ**.

Entrega: **19/11/2026** · Defensa: **26/11/2026** · [Enunciado](docs/references/enunciado.md) · [White paper (borrador)](docs/white-paper.md)

## Estado actual

| Pieza | Estado |
| --- | --- |
| API: login, lotes, idempotencia, permisos, descarga | ✅ Funciona |
| Publicador (outbox → RabbitMQ con confirmaciones) | ✅ Funciona |
| Inicialización automática (migraciones, usuarios demo, colas) | ✅ Funciona |
| Worker (PDF + QR + registro) | ⏳ Pendiente (frente C). En Compose hay un placeholder |
| Verificación pública `/api/verify/...` | ⏳ Pendiente; hoy responde `501` |
| Frontend | ⏳ Pendiente (frente A). En Compose hay un placeholder que ya reenvía `/api` |
| Despliegue en la nube | ⏳ Pendiente |

## Cómo funciona

```text
Operador ──CSV──► API ──(1 transacción: lote + solicitudes + outbox)──► PostgreSQL
                                                                           │
                         Publicador ◄──── lee el outbox ───────────────────┘
                             │ publica con confirmación del broker
                             ▼
                         RabbitMQ  (cert.issue · cert.issue.wait · cert.issue.dlq)
                             │ entrega 1 mensaje por certificado
                             ▼
                          Worker ──► PDF + QR + huella SHA-256 ──► PostgreSQL + registro simulado
                                                                     │
Alumno ──► descarga su PDF        Verificador ──► QR o subir PDF ──► compara la huella
```

1. El operador sube curso, fecha y un CSV de emails. Si alguna fila es inválida, se rechaza **todo** el archivo indicando qué corregir.
2. La API guarda el lote y responde enseguida, sin esperar la emisión.
3. El publicador manda un mensaje por alumno a RabbitMQ. Si el broker está caído, los mensajes esperan en la base y salen cuando vuelve.
4. El worker emite cada certificado y recién entonces confirma el mensaje (ACK). Si se cae, RabbitMQ lo reentrega y el worker no duplica lo ya hecho.
5. Las fallas transitorias se reintentan con espera (máximo 3 intentos); las permanentes van a una cola de fallidos y el resto del lote sigue.

El registro de huellas es un **registro simulado** (tabla de solo inserción), reemplazable por blockchain sin cambiar la API. Detalle en [arquitectura](docs/architecture.md) y [contratos](docs/contracts.md).

## Requisitos

- **Docker** con **Docker Compose 2.23 o superior** (`docker compose version`). No hace falta instalar Python ni Node.
- Solo para los scripts de escenarios: `bash`, `curl` y `jq`.

## Levantar el proyecto

```bash
git clone <url-del-repo> && cd tp-inge2
docker compose up -d --build
```

La primera vez tarda unos minutos porque construye la imagen. Al terminar, `docker compose ps` muestra todos los servicios `healthy` o `running`, e `init` como `Exited (0)` (es una tarea de una sola vez).

No hace falta crear un `.env`: todos los valores tienen un default de demo. Para cambiarlos, copiar [.env.example](.env.example) a `.env`.

| Qué | Dónde |
| --- | --- |
| Aplicación y API | http://localhost:8080 (API bajo `/api`) |
| Consola de RabbitMQ | http://localhost:15672 · usuario `certs` / `certs` (solo desde la propia máquina) |

Para apagar: `docker compose down`. Para apagar **y borrar todos los datos**: `docker compose down -v`.

### Usuarios de demo

Contraseña de todos: `demo1234`.

| Rol | Email |
| --- | --- |
| Operador | `operador@demo.test` |
| Alumnos | `alumno01@demo.test` … `alumno25@demo.test` |

### Datos de prueba

| Archivo | Contenido | Resultado esperado al subirlo |
| --- | --- | --- |
| [sample-data/lote-20.csv](sample-data/lote-20.csv) | 20 alumnos válidos | `201`, lote aceptado |
| [sample-data/con-error.csv](sample-data/con-error.csv) | Un email sin cuenta, uno repetido y uno válido | `400` con `NO_ACCOUNT` y `DUPLICATE_IN_FILE` |

## Probar la API a mano

```bash
API=http://localhost:8080/api

# Login como operador -> token
TOKEN=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"operador@demo.test","password":"demo1234"}' | jq -r .access_token)

# Subir un lote
KEY=$(uuidgen)
curl -s -X POST $API/batches -H "Authorization: Bearer $TOKEN" -H "Idempotency-Key: $KEY" \
  -F course_name="Intro a RabbitMQ" -F completion_date=2026-10-30 \
  -F file=@sample-data/lote-20.csv
```

| Prueba | Resultado esperado |
| --- | --- |
| `POST /api/auth/login` con credenciales correctas | `200` con `access_token`, `role` y `name` |
| Login con contraseña incorrecta | `401 UNAUTHENTICATED` |
| `POST /api/batches` con `lote-20.csv` | `201 {"batch_id": "...", "status": "IN_PROGRESS", "total": 20}` |
| El mismo `POST` repetido con la **misma** `Idempotency-Key` | `200` con el **mismo** `batch_id`; no se crea otro lote |
| Misma clave con otro contenido (por ejemplo, otro curso) | `409 IDEMPOTENCY_CONFLICT` |
| Mismo curso y fecha con **otra** clave | `400` con `ALREADY_REQUESTED` por cada alumno (detección de duplicados) |
| `POST /api/batches` con `con-error.csv` | `400 VALIDATION_ERROR` con las filas a corregir |
| `GET /api/batches/{batch_id}` | `200` con el estado del lote, conteos por estado y detalle por alumno |
| `GET /api/batches` | `200` con los lotes del operador |
| `GET /api/batches` con token de **alumno** | `403 FORBIDDEN` |
| `GET /api/me/certificates` con token de alumno | `200` con sus certificados emitidos (vacío hasta que exista el worker) |
| `GET /api/certificates/{id}/pdf` | `200 application/pdf` para el dueño o el operador; `404` para otro alumno ⏳ requiere worker |
| `GET /api/verify/{cert_id}` (público) | Datos académicos registrados, sin email ⏳ hoy `501` |
| `POST /api/verify/{cert_id}/file` (público) | `VALID`, `ALTERED` o `NOT_FOUND` ⏳ hoy `501` |

El contrato completo de la API está en [frontend/openapi.json](frontend/openapi.json) y en [docs/contracts.md §5](docs/contracts.md).

## Escenarios de falla

Cada escenario es un script repetible: rompe algo de verdad (por ejemplo, detiene RabbitMQ), comprueba el resultado en la API, la base y el broker, y guarda la salida en [evidence/](evidence/). Se corren con el proyecto levantado:

```bash
docker compose up -d
scripts/run-all.sh                      # todos, con resumen en evidence/RESUMEN.txt
scripts/scenarios/03-broker-caido.sh    # o uno solo
```

Cada uno termina con `PASS` (código 0), `FAIL` (otro código) o `PENDIENTE` (código 77: falta una pieza de otro frente). Si falla a mitad de camino, vuelve a prender lo que había detenido y saca la inyección de fallas del worker.

| Script | Qué demuestra | Estado hoy |
| --- | --- | --- |
| [01-lote-20.sh](scripts/scenarios/01-lote-20.sh) | Un lote de 20 termina con 20 certificados distintos, registrados y verificables; mide tiempos | PENDIENTE: worker y verificación |
| [02-worker-caido.sh](scripts/scenarios/02-worker-caido.sh) | Si el worker muere (`kill`) a mitad del lote, al volver termina sin pérdidas ni duplicados | PENDIENTE: worker |
| [03-broker-caido.sh](scripts/scenarios/03-broker-caido.sh) | Con RabbitMQ caído el lote se acepta, queda en el outbox y se publica al volver | ✅ hasta la publicación; la emisión final espera al worker |
| [04-mensaje-repetido.sh](scripts/scenarios/04-mensaje-repetido.sh) | El mismo envío HTTP o el mismo mensaje dos veces no duplica nada | ✅ parte HTTP; la reentrega espera al worker |
| [05-transitorio.sh](scripts/scenarios/05-transitorio.sh) | Con `FAULT_INJECTION=transient:2` hay reintentos y el lote termina completo | PENDIENTE: worker |
| [06-permanente.sh](scripts/scenarios/06-permanente.sh) | Con `FAULT_INJECTION=permanent:alumno03@demo.test`: 19 emitidos, 1 `FAILED` con su error y en la DLQ | PENDIENTE: worker |
| [07-csv-invalido.sh](scripts/scenarios/07-csv-invalido.sh) | Un CSV inválido se rechaza entero y no crea nada | ✅ PASS |
| [08-verificacion.sh](scripts/scenarios/08-verificacion.sh) | Original `VALID`, alterado `ALTERED`, inexistente `NOT_FOUND`, registro caído `503` | PENDIENTE: worker y verificación |
| [09-alumno-permisos.sh](scripts/scenarios/09-alumno-permisos.sh) | El alumno solo ve y descarga lo suyo, no hace acciones de operador, y la consulta pública no expone el email | ✅ permisos de operador; el resto espera al worker y la verificación |
| [10-segundo-up.sh](scripts/scenarios/10-segundo-up.sh) | Volver a correr `docker compose up` no duplica datos ni colas | ✅ PASS |

Los escenarios que esperan al worker se probaron contra un worker de prueba que sigue el contrato de [docs/contracts.md §4](docs/contracts.md); la evidencia en `evidence/` es solo de la aplicación real.

Para correr los escenarios contra otra máquina, por ejemplo la VM: ejecutarlos **en esa máquina**, ya que detienen sus servicios. `BASE_URL` cambia la URL de la API.

## Configuración

Todas las variables, con su explicación, están en [.env.example](.env.example) y en [docs/contracts.md §1](docs/contracts.md). Las más importantes:

| Variable | Para qué |
| --- | --- |
| `JWT_SECRET` | Firma de los tokens. Obligatoria, mínimo 32 caracteres. **Cambiar en la nube** |
| `DEMO_PASSWORD` | Contraseña de los usuarios de demo |
| `PUBLIC_BASE_URL` | URL que va dentro del QR. **Fijarla antes de emitir certificados**: si cambia, los PDF ya emitidos no verifican |
| `FAULT_INJECTION` | Fallas controladas para la demo: `transient:2`, `permanent:alumno03@demo.test` |

## Despliegue en la nube

⏳ Pendiente la VM. Se usa el mismo `compose.yaml` en una VM Linux (Ubuntu), con el puerto 8080 abierto. Desde una máquina con el repositorio:

```bash
scripts/deploy.sh <usuario@ip> [clave-ssh.pem]
```

El script instala Docker si falta, copia el proyecto, crea la primera vez un `.env` con contraseñas aleatorias y `PUBLIC_BASE_URL=http://<ip>:8080`, levanta todo y comprueba desde afuera que la API responda. Se puede volver a correr para actualizar, porque no toca el `.env` existente. La URL y las credenciales de acceso se entregan a la cátedra por un canal privado, nunca en este repositorio.

## Estructura del repositorio

```text
backend/        API, publicador, worker e init (Python, una sola imagen)
frontend/       Interfaz web (React) y contrato OpenAPI
compose.yaml    Todos los servicios
sample-data/    CSV de prueba
scripts/        lib.sh y escenarios de falla (scripts/scenarios/)
evidence/       Salidas de los escenarios
docs/           White paper, arquitectura, contratos, planes
```

## Documentación

- [White paper (borrador)](docs/white-paper.md)
- [Producto, alcance y requisitos](docs/project.md)
- [Arquitectura](docs/architecture.md) y [diagrama](docs/architecture-diagram.md)
- [Contratos entre frentes](docs/contracts.md)
- [División del trabajo](docs/division-del-trabajo.md), [plan de trabajo](docs/implementation-plan.md) y [decisiones](docs/decision-map.md)
- [Glosario](GLOSSARY.md)
- [Enunciado original (PDF)](docs/references/enunciado-tp.pdf) y [transcripción](docs/references/enunciado.md)
