# Frente D — Infraestructura, evidencia y documentos: Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `docker compose up` levante todo, que el mismo flujo corra en una VM en la nube sin gasto, que los escenarios de falla queden demostrados con evidencia, y que README, white paper y guion de demo estén listos el 19/11.

**Architecture:** Un único `compose.yaml` para local y VM, con healthchecks y una tarea `init`. Los escenarios son scripts bash repetibles que llaman a la API real, rompen servicios con `docker compose` y verifican el resultado, guardando logs como evidencia.

**Tech Stack:** Docker Compose, bash, curl, jq, VM Linux gratuita (Azure for Students, Google Cloud trial u Oracle Always Free).

**Spec:** `docs/contracts.md` (v1.1, §1, §4, §8), `docs/division-del-trabajo.md`, `docs/references/enunciado.md`.

**Dependencias con otros planes:**
- Task 1 (cloud) no depende de nadie: **empezar ya**.
- Task 2 necesita las imágenes de A (`web`) y B/C (`backend`) a medida que existan; arrancar con placeholders.
- Los escenarios (Tasks 5 y 6) necesitan la Integración 1 (B + C).

## Global Constraints

- Presupuesto cero: no activar facturación paga ni dejar recursos fuera de la oferta gratuita.
- `docker compose up` debe inicializar todo sin pasos manuales ni instalar nada en el host salvo Docker.
- Versiones de imágenes fijas (nunca `latest`); elegir las vigentes y compatibles al iniciar y anotarlas en el propio `compose.yaml`.
- Solo `web` (8080) expuesto al público; PostgreSQL, AMQP y `api` en red interna; consola de RabbitMQ solo en `127.0.0.1:15672`.
- `depends_on` con `service_healthy` y `service_completed_successfully`; el segundo `up` no duplica datos.
- Credenciales reales por canal privado; nunca en el repositorio ni en `.env.example`.
- Los escenarios son deterministas y repetibles; fallos inyectados con `FAULT_INJECTION`, no aleatorios.
- El white paper tiene máximo 5 páginas de cuerpo; informa limitaciones, no solo éxitos. Se dice «registro simulado».
- Entregas: 19/11 (white paper, repositorio/PoC, acceso cloud); defensa 26/11 (10 min exposición, 10 demo, 10 Q&A).

## Review Focus

1. VM con menos RAM de la prevista: Compose completo se queda sin memoria; medir antes de congelar (Task 4).
2. Segundo `docker compose up` sobre volúmenes existentes: no duplica seed ni redeclara de forma destructiva (Task 2).
3. Reinicio de la VM: los servicios vuelven solos (`restart: unless-stopped`) y los datos persisten (Task 4).
4. Escenario que «pasa» por no ejecutarse de verdad: cada script debe fallar si el servicio que debía romper no se detuvo (Task 5).
5. README seguido por alguien que no escribió el código: falla en pasos implícitos (Task 7).

## File Structure

| Archivo | Responsabilidad |
| --- | --- |
| `compose.yaml`, `.env.example` | Servicios, healthchecks, volúmenes, variables |
| `docs/cloud-setup.md` | Cómo se creó la VM (sin secretos) |
| `sample-data/lote-20.csv`, `con-error.csv` | CSV de demo |
| `scripts/lib.sh` | Funciones comunes de los escenarios |
| `scripts/scenarios/NN-*.sh` | Un escenario por archivo |
| `evidence/` | Logs y capturas de ejecuciones reales |
| `README.md`, `docs/white-paper.md`, `docs/demo-script.md` | Entregables |

---

### Task 1: Cuenta cloud y VM (urgente, hoy)

**Files:**
- Create: `docs/cloud-setup.md`

- [ ] **Step 1:** Comprobar elegibilidad en este orden: Azure for Students (USD 100, sin tarjeta); Google Cloud Free Trial (USD 300 / 90 días, pide verificación); Oracle Cloud Always Free como respaldo. Registrar cuál queda disponible y quién es el titular.
- [ ] **Step 2:** Crear VM Linux con **al menos 2 vCPU y 4 GB de RAM**, abrir solo SSH y el puerto 8080 (o 80/443). Esperado: acceso `ssh` con clave.
- [ ] **Step 3:** Instalar Docker y el plugin Compose. Verificar: `ssh <vm> "docker run --rm hello-world && docker compose version"` imprime el mensaje de éxito y la versión.
- [ ] **Step 4:** Documentar en `docs/cloud-setup.md` proveedor, tamaño, reglas de red y comandos; sin contraseñas ni claves.
- [ ] **Step 5: Regla de salida.** Si a la noche del 14/11 no hay VM, avisar a la cátedra de inmediato y pasar a la alternativa gratuita que sí funcione; una demo solo local no equivale al entregable.
- [ ] **Step 6: Commit** de `docs/cloud-setup.md`.

---

### Task 2: `compose.yaml` base con infraestructura y placeholders

**Files:**
- Create: `compose.yaml`, `.env.example`

**Interfaces:**
- Produces: servicios `postgres`, `rabbitmq`, `init`, `api`, `publisher`, `worker`, `web` con los puertos y variables de §1 de contracts; volúmenes `pgdata`, `rabbitmqdata`.

- [ ] **Step 1:** Definir `postgres` y `rabbitmq` con imágenes de versión fija, volúmenes y healthchecks (`pg_isready`, `rabbitmq-diagnostics -q ping`). Verificar: `docker compose up -d postgres rabbitmq && docker compose ps` muestra ambos `healthy`.
- [ ] **Step 2:** Definir `init`, `api`, `publisher`, `worker` desde la misma imagen `backend` con comandos distintos (`python -m app.entrypoints.init|api|publisher|worker`), `restart: unless-stopped` en los de larga vida, y `depends_on` según Global Constraints. Mientras no exista la imagen, apuntar a un contenedor placeholder que escuche un puerto.
- [ ] **Step 3:** Definir `web` (build de `frontend/`) publicando `8080:80`; `rabbitmq` publicando solo `127.0.0.1:15672`.
- [ ] **Step 4:** `.env.example` con todas las variables de §1 y valores de demo; `FAULT_INJECTION` vacía.
- [ ] **Step 5: Verificación de arranque limpio** cuando existan las imágenes reales: `docker compose down -v && docker compose up -d --build`; esperado: todo `healthy` o `exited (0)` (`init`). Luego `docker compose up -d` por segunda vez: esperado, sin cambios y `SELECT count(*) FROM users` igual al anterior.
- [ ] **Step 6: Commit.**

---

### Task 3: Datos de demo

**Files:**
- Create: `sample-data/lote-20.csv`, `sample-data/con-error.csv`

- [ ] **Step 1:** `lote-20.csv`: cabecera `email` y `alumno01@demo.test` … `alumno20@demo.test`.
- [ ] **Step 2:** `con-error.csv`: un email sin cuenta (`nadie@demo.test`), un duplicado dentro del archivo y una fila válida.
- [ ] **Step 3:** Verificar con la API real (cuando B tenga Task 5): `lote-20.csv` → `201`; `con-error.csv` → `400` con dos motivos distintos en `details`.
- [ ] **Step 4: Commit.**

---

### Task 4: Despliegue en la VM y medición

**Files:**
- Modify: `docs/cloud-setup.md`

- [ ] **Step 1:** Copiar el repositorio a la VM y crear allí el `.env` con secretos propios (JWT, contraseñas); `PUBLIC_BASE_URL` con la IP o dominio público **antes** de emitir cualquier certificado de demo.
- [ ] **Step 2:** `docker compose up -d --build`. Esperado: todos los servicios sanos.
- [ ] **Step 3:** Medir memoria con `docker stats --no-stream` durante un lote de 20; guardar la salida en `evidence/memoria-vm.txt`. Si supera el 80 % de la RAM, reducir (por ejemplo, límites de memoria en RabbitMQ) o pedir una VM mayor dentro de la oferta gratuita.
- [ ] **Step 4:** Reiniciar la VM y comprobar que todo vuelve solo y que el lote anterior sigue consultable.
- [ ] **Step 5:** Decidir transporte protegido: si hay dominio gratuito, agregar un proxy con TLS automático delante de `web`; si no, dejar HTTP y dejar constancia de la limitación en el white paper.
- [ ] **Step 6: Commit.** Entregar a la cátedra URL y usuario de demo por canal privado.

---

### Task 5: Biblioteca de escenarios y escenarios de recuperación

**Files:**
- Create: `scripts/lib.sh`, `scripts/scenarios/01-lote-20.sh`, `02-worker-caido.sh`, `03-broker-caido.sh`, `04-mensaje-repetido.sh`

**Interfaces:**
- Produces en `lib.sh`: `login <email> <password> -> token`; `post_batch <token> <course> <date> <csv> <key> -> batch_id`; `wait_batch <token> <batch_id> <timeout_s> -> status`; `count_certs <batch_id>`; `assert_eq <esperado> <obtenido> <mensaje>` (sale con código ≠ 0 si difieren); `log_evidence <archivo>`.

- [ ] **Step 1: `01-lote-20.sh`.** Sube `lote-20.csv`; espera `COMPLETED`; afirma 20 certificados distintos, 20 entradas en `registry` y que el PDF de uno verifica `VALID`.
- [ ] **Step 2: `02-worker-caido.sh`.** Sube el lote, `docker compose stop worker` tras ver al menos un `ISSUED`, **afirma que el contenedor está detenido** antes de seguir, `docker compose start worker`, espera `COMPLETED`; afirma 20 certificados, ninguno duplicado, ningún `PROCESSING`.
- [ ] **Step 3: `03-broker-caido.sh`.** `docker compose stop rabbitmq`, sube el lote (esperado: `201`), afirma que `outbox` tiene filas pendientes, `docker compose start rabbitmq`, espera `COMPLETED`.
- [ ] **Step 4: `04-mensaje-repetido.sh`.** Repite el mismo `POST` con la misma clave (esperado: `200` y el mismo `batch_id`) y republica manualmente un `request_id` ya emitido a `cert.issue` (esperado: sigue habiendo un solo certificado y un solo registro).
- [ ] **Step 5:** Ejecutar cada uno dos veces seguidas contra servicios reales; esperado: `PASS` ambas. Guardar salida en `evidence/NN-*.log`.
- [ ] **Step 6: Commit.**

---

### Task 6: Escenarios de fallo, validación y verificación

**Files:**
- Create: `scripts/scenarios/05-transitorio.sh`, `06-permanente.sh`, `07-csv-invalido.sh`, `08-verificacion.sh`, `09-alumno-permisos.sh`, `10-segundo-up.sh`

- [ ] **Step 1: `05-transitorio.sh`.** Reiniciar `worker` con `FAULT_INJECTION=transient:2`; lote termina `COMPLETED`; algún ítem con `attempts >= 2`.
- [ ] **Step 2: `06-permanente.sh`.** `FAULT_INJECTION=permanent:alumno03@demo.test`; lote `COMPLETED_WITH_ERRORS`: 19 `ISSUED`, 1 `FAILED` con `last_error` no vacío; un mensaje en `cert.issue.dlq`; el resto avanzó.
- [ ] **Step 3: `07-csv-invalido.sh`.** `con-error.csv` → `400`, `details` con `NO_ACCOUNT` y `DUPLICATE_IN_FILE`, y conteo de `batches` sin cambios.
- [ ] **Step 4: `08-verificacion.sh`.** PDF original → `VALID`; el mismo con un byte cambiado → `ALTERED`; id inexistente → `NOT_FOUND`; con `docker compose stop postgres` → `503` y no «inválido». Reiniciar al final.
- [ ] **Step 5: `09-alumno-permisos.sh`.** Alumno ve y descarga solo lo propio; el PDF de otro → `404`; sus llamadas a `/batches` → `403`; `GET /verify/{id}` no contiene el email.
- [ ] **Step 6: `10-segundo-up.sh`.** `docker compose up -d` dos veces sobre el estado existente: sin duplicar usuarios ni instituciones y el contrato/registro intacto.
- [ ] **Step 7:** Ejecutar todos en local y en la VM; guardar logs en `evidence/`. Commit.

---

### Task 7: README, white paper y guion de demo

**Files:**
- Create/Modify: `README.md`, `docs/white-paper.md`, `docs/demo-script.md`

- [ ] **Step 1: README** (exigido por el enunciado): flujo en pocas líneas, requisitos, `docker compose up`, URL local y de la VM, usuarios de demo, cómo ejecutar cada escenario, endpoints a probar y resultado esperado de cada uno. Quitar el aviso «todavía no hay aplicación».
- [ ] **Step 2: White paper** en cinco secciones del plan de trabajo (problema y alcance real; alternativas y decisión; arquitectura y rol de RabbitMQ; investigación aplicada: confirmaciones, idempotencia, outbox, fallos; resultados, limitaciones y recursos). Redactar el borrador **desde ahora** con lo que ya está decidido; completar la sección 5 solo con resultados observados de `evidence/`.
- [ ] **Step 3: Guion de demo (10 min)**: cargar lote pequeño, ver progreso, matar y reiniciar el worker, comprobar ausencia de duplicados, entrar como alumno y descargar PDF, verificar original frente a archivo alterado; plan B con capturas de `evidence/` si algo falla en vivo.
- [ ] **Step 4: Prueba desde cero**: otra persona del equipo, en una máquina limpia, clona y sigue solo el README. Anotar cada tropiezo y corregir el README.
- [ ] **Step 5: Commit.** Congelar el 16/11; versión candidata el 18/11.
