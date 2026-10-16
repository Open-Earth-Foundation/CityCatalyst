#!/bin/sh
# Run on the Mikrus host. Reuses the deployed images and existing env files.
set -eu
SOURCE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
STACK=${1:-/root/citycatalyst}
test "$(id -u)" = 0
WEB_IMAGE=$(docker inspect --format '{{.Config.Image}}' citycatalyst-web-1)
CA_IMAGE=$(docker inspect --format '{{.Config.Image}}' citycatalyst-ca-1)
export WEB_IMAGE CA_IMAGE
install -d -m 700 "$STACK/diagnostics" "$STACK/backups"
backup="$STACK/backups/docker-compose.before-recovery.$(date -u +%Y%m%dT%H%M%SZ).yml"
cp "$STACK/docker-compose.yml" "$backup"
install -m 644 "$SOURCE/docker-compose.yml" "$STACK/docker-compose.yml"
if ! docker compose -p citycatalyst -f "$STACK/docker-compose.yml" config --quiet; then
  cp "$backup" "$STACK/docker-compose.yml"
  exit 1
fi
install -d -m 755 /usr/local/lib/citycatalyst-recovery
install -m 755 "$SOURCE/recover-web.py" /usr/local/lib/citycatalyst-recovery/recover-web.py
install -m 644 "$SOURCE/capture-stack.mjs" /usr/local/lib/citycatalyst-recovery/capture-stack.mjs
install -m 644 "$SOURCE/citycatalyst-recovery.service" /etc/systemd/system/
install -m 644 "$SOURCE/citycatalyst-recovery.timer" /etc/systemd/system/
systemctl daemon-reload
if ! docker compose -p citycatalyst -f "$STACK/docker-compose.yml" up -d --no-deps --wait --wait-timeout 120 web; then
  echo "Web did not become healthy; restoring previous compose configuration" >&2
  cp "$backup" "$STACK/docker-compose.yml"
  docker compose -p citycatalyst -f "$STACK/docker-compose.yml" up -d --no-deps web
  exit 1
fi
systemctl enable --now citycatalyst-recovery.timer
systemctl start citycatalyst-recovery.service
echo "Recovery installed. Previous compose file: $backup"
