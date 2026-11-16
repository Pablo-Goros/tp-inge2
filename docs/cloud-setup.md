# Despliegue en la nube

Cómo se creó y se opera la VM de la PoC. **Sin secretos:** la URL, el usuario de demo y su contraseña se entregan a la cátedra por un canal privado. La contraseña quedó solo en la VM, en `~/tp-inge2/.env`.

## Proveedor y máquina

| Qué | Valor |
| --- | --- |
| Proveedor | Microsoft Azure, suscripción **Azure for Students** (USD 100 de crédito, sin tarjeta). Titular: un integrante del grupo |
| Región | **Chile Central**. East US no permitía ningún tamaño B para la suscripción de estudiante (`NotAvailableForSubscription`) |
| Tamaño | **Standard_B2als_v2**: 2 vCPU, 4 GiB de RAM, unos USD 38 por mes |
| Imagen | Ubuntu Server 24.04 LTS, x64, Gen2, inicio seguro |
| Disco | 30 GB, Premium SSD |
| Acceso | Clave SSH (sin contraseña), usuario `azureuser` |
| IP pública | Estática |
| Apagado automático | Desactivado |
| Creada | 16/11/2026 |

## Red

| Regla de entrada | Puerto | Para qué |
| --- | --- | --- |
| `SSH` | 22/TCP | Administración (solo con clave) |
| `web-8080` | 8080/TCP | Aplicación y API (`/api`): único puerto de la app abierto a Internet |

PostgreSQL, AMQP y la API no se publican (red interna de Compose). La consola de RabbitMQ escucha solo en `127.0.0.1:15672` de la VM; para verla se usa un túnel SSH:

```bash
ssh -i ~/.ssh/tp-inge2 -L 15672:127.0.0.1:15672 azureuser@<IP>
# y abrir http://localhost:15672 en la máquina local
```

**Transporte: solo HTTP.** No hay dominio, así que no se configuró TLS. Es una limitación declarada de la PoC; las credenciales de demo son sintéticas.

## Desplegar o actualizar

Desde una máquina con el repositorio y la clave:

```bash
scripts/deploy.sh azureuser@<IP> ~/.ssh/tp-inge2
```

El script instala Docker si falta, copia el proyecto (sin `.git`, `.env` ni `evidence/`), crea `.env` con secretos aleatorios **solo la primera vez** (con `PUBLIC_BASE_URL=http://<IP>:8080`), corre `docker compose up -d --build --wait` y comprueba desde afuera que la API responda `401`. Volver a correrlo actualiza el código sin tocar el `.env` ni los datos.

Para correr los escenarios en la VM (requieren `jq`, que se instaló con `sudo apt-get install -y jq`):

```bash
ssh -i ~/.ssh/tp-inge2 azureuser@<IP>
cd ~/tp-inge2 && scripts/run-all.sh
```

## Resultados observados (16/11/2026)

Código desplegado: rama `frente-c` @ `9f9f692` (B + C + D integrados; frontend todavía como placeholder).

- **Escenarios en la VM:** 10 de 10 PASS.
- **Memoria:** el pico del host fue 1108 MB de 3856 MB (29 %) durante la corrida completa. RabbitMQ fue el contenedor más pesado, con 151 MiB.
- **Reinicio de la VM:** volvió en unos 25 s y los servicios arrancaron solos. Antes y después había 8 lotes y 123 certificados.

Detalle en [evidence/vm/](../evidence/vm/).

## Costos y baja

- Con la VM prendida todo el tiempo: unos USD 38 por mes de cómputo más el disco y la IP. Hasta la defensa (26/11) son unos USD 15 de los 100 de crédito.
- La suscripción no tiene tarjeta: si se agota el crédito, Azure apaga los recursos y no cobra.
- **Después de la defensa:** borrar el grupo de recursos `tp-inge2` (Portal → Grupos de recursos → `tp-inge2` → Eliminar). Así se borran juntos la VM, el disco, la IP y la red.
