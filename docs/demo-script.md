# Guion de la demo — defensa del 26/11

Formato de la defensa (enunciado, p. 7): **10 min** de exposición (producto, justificación, funcionalidades, arquitectura, stack, recursos), **10 min de demo**, **10 min** de preguntas. Este documento cubre la demo y las preguntas.

**Idea central que tiene que quedar:** el lote se emite completo aunque se caigan el worker o el broker, sin perder ni duplicar certificados, y cualquiera puede verificar si un PDF es el original.

## Preparación

**El día anterior**
- Correr `scripts/run-all.sh` en local y en la VM: los 10 escenarios tienen que dar PASS.
- Ensayar la demo completa con cronómetro, al menos una vez de punta a punta.
- Sacar las capturas del plan B (ver más abajo) y guardarlas en `evidence/capturas/`.

**30 minutos antes**
- En la notebook de la demo: `docker compose down -v && docker compose up -d --build`. Arranca limpio y no depende del wifi del aula.
- Terminal con letra grande (Ctrl + varias veces). Pestañas abiertas en el navegador:
  1. La app en la nube: `http://<IP-de-la-VM>:8080`
  2. La consola de RabbitMQ local: `http://localhost:15672` (usuario `certs`, contraseña `certs`)
  3. La carpeta `~/demo-certificados` (ahí aparecen los PDF)
- Tener abierto `evidence/RESUMEN.txt` por si hay que ir al plan B.

## Guion (10 minutos)

La demo se maneja con `scripts/demo.sh`: hace un paso, muestra el resultado y espera Enter. Para el paso extra de falla permanente: `DEMO_FALLA=1 scripts/demo.sh`.

| Tiempo | Qué se muestra | Qué decir |
| --- | --- | --- |
| 0:00–0:45 | La app en la nube (pestaña 1) | "Esto corre en una VM de Azure con el mismo `docker compose up` que en local. Para mostrar caídas vamos a trabajar sobre la copia local." |
| 0:45–1:30 | **Paso 1**: se detiene el worker | "El worker es el proceso que arma cada PDF y lo registra. Simulamos que se cayó." |
| 1:30–2:45 | **Paso 2**: se sube el lote de 20 con el worker caído. Mostrar la consola de RabbitMQ: `cert.issue` con 20 mensajes | "La API responde en milisegundos y no espera la emisión. Los 20 trabajos quedan guardados en la cola: son mensajes persistentes en una cola durable." |
| 2:45–3:45 | **Paso 3**: vuelve el worker y el lote avanza hasta 20/20 | "El worker retoma solo desde la cola. Confirma cada mensaje (ACK) recién después de guardar el certificado." |
| 3:45–4:30 | **Paso 4**: 20 emitidos, 20 huellas distintas, 20 registros, cola vacía | "RabbitMQ garantiza entrega *al menos una vez*: puede repetir un mensaje. Por eso el worker es idempotente y nunca hay un certificado duplicado." |
| 4:30–6:00 | **Paso 5**: el alumno descarga su PDF; se abre el diploma con el QR. Pedir el PDF de otro alumno da 404 | "Cada alumno ve y descarga solo lo suyo. El QR apunta a la verificación pública de este certificado." |
| 6:00–7:30 | **Paso 6**: consulta pública (sin email ni nota). PDF original → **VALID**; con 1 byte cambiado → **ALTERED** | "Se compara la huella SHA-256 del archivo con la que registró la institución. Cualquier cambio lo detecta. Es un registro simulado, reemplazable por blockchain sin tocar la API." |
| 7:30–8:45 | **Extra** (si va bien de tiempo): falla permanente en alumno03 → 19 emitidos, 1 FAILED con su error, 1 mensaje en la DLQ | "Un error de un alumno queda aislado en la cola de fallidos con el motivo, y no frena al resto del lote." |
| 8:45–10:00 | `evidence/RESUMEN.txt` y `evidence/vm/RESUMEN.txt` | "Además de esto, tenemos 10 escenarios automáticos: worker muerto a mitad de lote, broker caído, mensajes repetidos, reintentos. Todos pasan, en local y en la nube." |

**Si el frontend de A está listo:** reemplazar el paso 2 por la carga del CSV desde la pantalla del operador (con la barra de avance), el paso 5 por «Mis certificados» y el paso 6 por la página de verificación. Ahí sí conviene **escanear el QR con un celular** contra la VM. Las caídas del worker siguen haciéndose con `demo.sh` o con `docker compose stop worker`.

**Sin frontend:** no escanear el QR en vivo, porque abre la página de relleno.

## Plan B

Si algo falla en vivo, no debuggear delante de la mesa:
1. Volver a correr el paso (Enter de nuevo o `scripts/demo.sh` desde el principio: tarda menos de un minuto).
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
