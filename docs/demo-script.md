# Guion de la demo — defensa del 26/11

Formato de la defensa (enunciado, p. 7): **10 min** de exposición (producto, justificación, funcionalidades, arquitectura, stack, recursos), **10 min de demo**, **10 min** de preguntas. Este documento cubre la demo y las preguntas.

**Idea central que tiene que quedar:** el lote se emite completo aunque se caigan el worker o el broker, sin perder ni duplicar certificados, y cualquiera puede verificar si un PDF es el original.

## Preparación

**El día anterior**
- Correr `scripts/run-all.sh` en local y en la VM: los 10 escenarios tienen que dar PASS.
- **Certificado de la nube para el QR:** en `http://<IP-de-la-VM>:8080`, entrar como operador, cargar `sample-data/lote-con-notas.csv` (curso y fecha cualesquiera), entrar como `alumno01@demo.test` y descargar su PDF. Guardarlo en la notebook como `~/demo-certificados/nube.pdf`. Su QR apunta a la VM, así que se puede escanear con un celular; el QR de un PDF emitido en local apunta a `localhost` y desde el celular no abre. La contraseña de la VM es `DEMO_PASSWORD` del `.env` de la VM (`~/tp-inge2/.env`), no `demo1234`.
- Ensayar la demo completa con cronómetro, al menos una vez de punta a punta.
- Sacar las capturas del plan B (ver más abajo) y guardarlas en `evidence/capturas/`.

**30 minutos antes**
- En la notebook de la demo: `docker compose down -v && docker compose up -d --build`. Arranca limpio y no depende del wifi del aula.
- Terminal con letra grande (Ctrl + varias veces), parada en la carpeta del proyecto. Pestañas abiertas en el navegador:
  1. La app en la nube: `http://<IP-de-la-VM>:8080`
  2. La app local, con sesión de operador (`operador@demo.test` / `demo1234`): `http://localhost:8080/operator/batches/new`
  3. La consola de RabbitMQ local: `http://localhost:15672` (usuario `certs`, contraseña `certs`), en la pestaña *Queues*
  4. Una ventana de incógnito en `http://localhost:8080/login` para entrar como alumno
- Tener abiertos `~/demo-certificados/nube.pdf` (para el QR) y `evidence/RESUMEN.txt` (plan B).

## Guion (10 minutos)

La demo se hace en el navegador, sobre la copia local. La terminal solo se usa para tirar y levantar el worker, y para alterar un PDF.

| Tiempo | Qué se muestra | Qué decir |
| --- | --- | --- |
| 0:00–0:45 | Pestaña 1: la app en la nube | "Esto corre en una VM de Azure con el mismo `docker compose up` que en local. Para mostrar caídas vamos a trabajar sobre la copia local." |
| 0:45–1:30 | Terminal: `docker compose stop worker` | "El worker es el proceso que arma cada PDF y lo registra. Simulamos que se cayó." |
| 1:30–2:45 | Pestaña 2 (operador): curso «Introducción a RabbitMQ», fecha 30/10/2026, archivo `sample-data/lote-20.csv` → **Emitir**. El detalle del lote queda con 20 pendientes. Pestaña 3: `cert.issue` con 20 mensajes | "La API guarda el lote y responde enseguida: no espera la emisión. Los 20 trabajos quedan guardados en la cola: son mensajes persistentes en una cola durable." |
| 2:45–3:45 | Terminal: `docker compose start worker`. Volver al detalle del lote: avanza solo hasta **Completado** | "El worker retoma solo desde la cola. Confirma cada mensaje (ACK) recién después de guardar el certificado." |
| 3:45–4:30 | Detalle del lote: 20 emitidos, 0 fallidos. Pestaña 3: `cert.issue` vacía | "RabbitMQ garantiza entrega *al menos una vez*: puede repetir un mensaje. Por eso el worker es idempotente y nunca hay un certificado duplicado (lo prueba el escenario 04)." |
| 4:30–6:00 | Ventana de incógnito: `alumno01@demo.test` / `demo1234` → «Mis certificados» → **Descargar PDF** → abrir el diploma | "Cada alumno ve y descarga solo lo suyo (el escenario 09 prueba que no puede bajar el de otro). El QR apunta a la verificación pública de este certificado." |
| 6:00–7:30 | Clic en el QR del diploma: abre `/verify/{id}` con los datos registrados (sin email ni nota). Subir el PDF descargado → **Válido**. En la terminal: `cp ~/Descargas/certificado-introduccion-a-rabbitmq.pdf /tmp/alterado.pdf && printf ' ' >> /tmp/alterado.pdf` (ajustar la carpeta de descargas) y subir `/tmp/alterado.pdf` → **Alterado** | "Se compara la huella SHA-256 del archivo con la que registró la institución. Le agregamos un espacio al final: el PDF se ve igual, pero la huella cambia. Es un registro simulado, reemplazable por blockchain sin tocar la API." |
| 7:30–8:00 | Celular: escanear el QR de `nube.pdf` | "Y esto es lo que ve un empleador: escanea el QR y verifica contra la nube, sin cuenta." |
| 8:00–8:45 | **Extra** (si va bien de tiempo): terminal `FAULT_INJECTION=permanent:alumno03@demo.test docker compose up -d --no-deps worker`; cargar otro lote con `lote-20.csv` y **otro nombre de curso** → 19 emitidos, 1 fallido con su error en la tabla; `cert.issue.dlq` con 1 mensaje. Después: `FAULT_INJECTION= docker compose up -d --no-deps worker` | "Un error de un alumno queda aislado en la cola de fallidos con el motivo, y no frena al resto del lote." |
| 8:45–10:00 | `evidence/RESUMEN.txt` y `evidence/vm/RESUMEN.txt` | "Además de esto, tenemos 10 escenarios automáticos: worker muerto a mitad de lote, broker caído, mensajes repetidos, reintentos. Todos pasan, en local y en la nube." |

El nombre del PDF descargado sale del curso (`certificado-<curso>.pdf`). Si se usa otro nombre de curso, ajustar el `cp`.

## Plan B

Si algo falla en vivo, no debuggear delante de la mesa:
1. **Si falla el navegador:** la misma demo existe en versión terminal con `scripts/demo.sh`. Hace cada paso por API, muestra el resultado y espera Enter; deja el original y el alterado en `~/demo-certificados`. Para sumar la falla permanente: `DEMO_FALLA=1 scripts/demo.sh`. Tarda menos de un minuto de punta a punta.
2. Si sigue fallando, mostrar la evidencia ya generada: `evidence/0X-*.log` (local) y `evidence/vm/` (nube).
3. Último recurso: las capturas de `evidence/capturas/`.

**Capturas para sacar antes (pendiente):** cola `cert.issue` con 20 mensajes en la consola de RabbitMQ; el lote en 20/20; el diploma PDF abierto; VALID y ALTERED en la terminal; la DLQ con 1 mensaje; `RESUMEN.txt` con 10/10 PASS.

## Preguntas probables

| Pregunta | Respuesta corta |
| --- | --- |
| ¿Por qué RabbitMQ y no Kafka? | Son trabajos independientes ("emití el certificado X") que necesitan ACK por mensaje, reintento con espera y cola de fallidos: RabbitMQ los trae nativos. Kafka conviene para un log de eventos que varios sistemas releen, y no es nuestro caso. |
| ¿Qué pasa si el worker se cae en medio de un PDF? | No llegó a hacer ACK, así que RabbitMQ reentrega el mensaje. El PDF se genera una sola vez y se guarda; si ya existía, se reutiliza. El registro es idempotente. Lo prueban el escenario 02 y los tests de C, que matan procesos reales. |
| ¿Y si RabbitMQ entrega el mismo mensaje dos veces? | El worker mira el estado: si ya está ISSUED, confirma y no hace nada. Lo prueba el escenario 04. |
| ¿Para qué el outbox? | La base y el broker no comparten transacción. La API solo escribe en la base, y un proceso aparte publica con confirmación del broker. Así el lote se acepta aunque RabbitMQ esté caído (escenario 03). |
| ¿Por qué no `requeue` en los reintentos? | Reencolar de inmediato genera un bucle que satura el worker. Usamos una cola de espera con TTL (5 s) y un máximo de 3 intentos contados en la base. |
| ¿Es blockchain? | No. Es un **registro simulado** de solo inserción detrás de una interfaz `register/lookup`. Cambiarlo por un contrato no toca la API ni el frontend. |
| ¿Qué garantiza la verificación? | Que el archivo es idéntico al que registró la institución (autenticidad). No prueba que el alumno haya aprobado (veracidad). |
| ¿Escala? | Hoy hay un solo worker con `prefetch=1`. Agregar workers es posible, pero no lo medimos. |
| ¿Qué no hicieron? | Alta disponibilidad (todo corre en una VM), TLS (no hay dominio), múltiples instituciones, revocación. Están declarados en el white paper. |
| ¿Cuánto cuesta la nube? | Unos USD 38 por mes la VM, cubiertos por el crédito de Azure for Students. Gasto real: USD 0. |
