#!/bin/bash
# Same backup/migrate/start sequence used for the existing Mikrus deployment.
set -euo pipefail
umask 077
TAG=${1:?Usage: rollout.sh TAG [STACK_DIRECTORY]}
STACK=${2:-/root/citycatalyst}
SOURCE=$(cd -- "$(dirname -- "$0")" && pwd)
cd "$STACK"
export WEB_IMAGE="citycatalyst-web:$TAG" CA_IMAGE="citycatalyst-ca:$TAG"
docker image inspect "$WEB_IMAGE" "$CA_IMAGE" --format '{{.RepoTags}} {{.Id}}'
for file in .env.web .env.ca .env.db .env.cron; do test -f "$file"; done
backup="backups/$(date -u +%Y%m%dT%H%M%SZ)-$TAG"
mkdir -p "$backup" diagnostics
chmod 700 "$backup" diagnostics
cp docker-compose.yml .env.web .env.ca .env.db .env.cron "$backup/"
dc() { docker compose -p citycatalyst -f docker-compose.yml "$@"; }
# A stopped web container is intentionally left alone by the recovery watchdog.
dc stop cron web ca
trap 'echo "Rollout failed. Backup: $STACK/$backup. Review migrations before restarting; no automatic database rollback." >&2' ERR
docker exec citycatalyst-db-1 sh -c 'pg_dumpall -U "$POSTGRES_USER"' | gzip > "$backup/databases.sql.gz"
gzip -t "$backup/databases.sql.gz"
install -m 644 "$SOURCE/docker-compose.yml" docker-compose.yml
install -m 755 "$SOURCE/up.sh" up.sh
install -m 755 "$SOURCE/init-db.sh" init-db.sh
dc config --quiet
dc run --rm --no-deps -T ca sh -c 'python -m alembic -c alembic.ini upgrade head && python -m alembic -c cnb-alembic.ini upgrade head'
./up.sh "$TAG" "$STACK"
sh "$SOURCE/install-recovery.sh" "$STACK"
curl --fail --silent --show-error --max-time 15 http://127.0.0.1:3010/api/v1/check/liveness/
echo "Deployment complete: $TAG; database/config backup: $STACK/$backup"
