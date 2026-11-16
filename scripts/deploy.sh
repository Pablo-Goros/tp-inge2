#!/usr/bin/env bash
# Despliega el proyecto en una VM Linux (Ubuntu/Debian) por SSH.
#
# Uso:  scripts/deploy.sh <usuario@ip> [clave-ssh.pem]
#   Ej: scripts/deploy.sh azureuser@20.1.2.3 ~/.ssh/tp-inge2-key.pem
#
# Qué hace (se puede correr las veces que haga falta):
#   1. Instala Docker en la VM si no está.
#   2. Copia el proyecto (sin .git, .env ni evidence/ locales).
#   3. La PRIMERA vez crea en la VM un .env con contraseñas aleatorias y
#      PUBLIC_BASE_URL=http://<ip>:8080. Las siguientes veces no lo toca.
#   4. docker compose up -d --build --wait
#   5. Comprueba desde tu máquina que la API responde por el puerto 8080.
#
# Variable opcional: PUBLIC_BASE_URL (si se usa un dominio en vez de la IP).
# OJO: PUBLIC_BASE_URL va dentro del QR. Fijarla bien ANTES de emitir certificados.
set -euo pipefail

TARGET="${1:?uso: scripts/deploy.sh <usuario@ip> [clave-ssh.pem]}"
KEY="${2:-}"
HOST="${TARGET#*@}"
REMOTE_DIR="tp-inge2"
PUBLIC_URL="${PUBLIC_BASE_URL:-http://$HOST:8080}"

SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=10)
[[ -n "$KEY" ]] && SSH_OPTS+=(-i "$KEY")
remote() { ssh "${SSH_OPTS[@]}" "$TARGET" "$@"; }

cd "$(dirname "$0")/.."

echo "== 1. Docker en la VM"
if ! remote 'docker compose version' >/dev/null 2>&1; then
  echo "   instalando Docker..."
  remote 'curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker "$USER"'
fi
remote 'docker compose version'   # nueva sesión SSH: ya toma el grupo docker

echo "== 2. Copiar el proyecto a ~/$REMOTE_DIR"
rsync -az --delete -e "ssh ${SSH_OPTS[*]}" \
  --exclude .git/ --exclude .env --exclude evidence/ \
  --exclude .venv/ --exclude __pycache__/ --exclude node_modules/ --exclude .superpowers/ \
  ./ "$TARGET:$REMOTE_DIR/"

echo "== 3. .env con secretos propios"
if remote "test -f $REMOTE_DIR/.env"; then
  echo "   ya existe; no se modifica (PUBLIC_BASE_URL actual: $(remote "grep '^PUBLIC_BASE_URL=' $REMOTE_DIR/.env | cut -d= -f2-"))"
else
  demo_pw=$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | cut -c1-14)
  remote "umask 077 && cat > $REMOTE_DIR/.env" <<EOF
# Generado por scripts/deploy.sh el $(date -u +%Y-%m-%d). No commitear.
POSTGRES_PASSWORD=$(openssl rand -hex 16)
RABBITMQ_PASSWORD=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
DEMO_PASSWORD=$demo_pw
PUBLIC_BASE_URL=$PUBLIC_URL
EOF
  echo "   .env creado con PUBLIC_BASE_URL=$PUBLIC_URL"
  echo "   Contraseña de los usuarios de demo: $demo_pw"
  echo "   (pasarla a la cátedra por un canal privado; queda guardada en la VM en ~/$REMOTE_DIR/.env)"
fi

echo "== 4. Levantar (la primera vez construye la imagen: tarda unos minutos)"
remote "cd $REMOTE_DIR && docker compose up -d --build --wait"
remote "cd $REMOTE_DIR && docker compose ps --format 'table {{.Service}}\t{{.Status}}'"

echo "== 5. Prueba desde afuera"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$PUBLIC_URL/api/batches" || true)
if [[ "$code" == 401 ]]; then
  echo "   ok: la API responde en $PUBLIC_URL/api"
else
  echo "   FAIL: $PUBLIC_URL/api/batches devolvió HTTP '$code' (esperado 401)."
  echo "   ¿Está abierto el puerto 8080 en las reglas de red de la VM?"
  exit 1
fi
