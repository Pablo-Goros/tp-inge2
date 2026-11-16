#!/usr/bin/env bash
# 10 · Volver a correr `docker compose up -d` sobre datos existentes no duplica nada:
# init se ejecuta de nuevo y es idempotente (migraciones, seed y colas).
source "$(dirname "$0")/../lib.sh"
scenario_begin 10-segundo-up
require_stack

counts() {
  sql "SELECT 'users=' || (SELECT count(*) FROM users)
           || ' institutions=' || (SELECT count(*) FROM institutions)
           || ' batches=' || (SELECT count(*) FROM batches)
           || ' cert_requests=' || (SELECT count(*) FROM cert_requests)
           || ' certificates=' || (SELECT count(*) FROM certificates)
           || ' registry=' || (SELECT count(*) FROM registry)"
}
queues() { docker compose exec -T rabbitmq rabbitmqctl list_queues name -q | grep -v '^name$' | sort | tr '\n' ' '; }

before=$(counts)
echo "   antes: $before"
assert_eq "users=26 institutions=1" "$(echo "$before" | grep -o 'users=[0-9]* institutions=[0-9]*')" "seed (1 operador + 25 alumnos, 1 institución)"

for i in 1 2; do
  step "docker compose up -d (vez $i)"
  started_before=$(docker inspect -f '{{.State.StartedAt}}' "$(container_id init)")
  docker compose up -d --wait
  started_after=$(docker inspect -f '{{.State.StartedAt}}' "$(container_id init)")
  [[ "$started_before" != "$started_after" ]] || fail "init no volvió a ejecutarse; el escenario no probaría nada"
  echo "   ok    init volvió a ejecutarse"
  assert_eq 0 "$(docker inspect -f '{{.State.ExitCode}}' "$(container_id init)")" "código de salida de init"
done

assert_eq "$before" "$(counts)" "conteos tras dos up"
assert_eq "cert.issue cert.issue.dlq cert.issue.wait " "$(queues)" "colas de RabbitMQ"
