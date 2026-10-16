#!/bin/sh
# Starts/updates the stack for a given image tag: DB first, then CC migrations,
# seed data and the admin user, then everything else.
set -eu
TAG=${1:?Usage: up.sh TAG [STACK_DIRECTORY]}
cd "${2:-/root/citycatalyst}"
export WEB_IMAGE=citycatalyst-web:$TAG CA_IMAGE=citycatalyst-ca:$TAG
dc() { docker compose -p citycatalyst -f docker-compose.yml "$@"; }
dc up -d --wait db
echo "== migrate"
dc run --rm --no-deps -T web sequelize-cli db:migrate
if [ ! -f .seeded ]; then
  echo "== seed"
  dc run --rm --no-deps -T -e NODE_OPTIONS=--max-old-space-size=1200 web sequelize-cli db:seed:all
  touch .seeded
fi
echo "== create admin"
dc run --rm --no-deps -T web tsx scripts/create-admin.ts
echo "== up"
dc up -d --wait --wait-timeout 180
dc ps
