# CityCatalyst on Mikrus: deployment and recovery

This directory preserves the build, backup, migration, deployment, SSH and
automatic recovery tooling used for our existing Mikrus instance.

| Setting | Value |
| --- | --- |
| CityCatalyst site | [happy-turkey7765.byst.re](https://happy-turkey7765.byst.re) |
| Mikrus VPS / hostname | `natan296` / `natan296.mikrus.xyz` |
| SSH | `root@natan296.mikrus.xyz`, port **10296** |
| Deployment directory | `/root/citycatalyst` |
| HTTPS proxy destination | VPS port **3010**, forwarded to web port 3000 |
| Direct HTTP diagnostic address | `http://natan296.mikrus.xyz:20296` (use the HTTPS site to log in) |

## Credentials: one local file

The repository-root **`.env.mikrus`** contains both server access and the
CityCatalyst administrator login:

- `MIKRUS_HOST`, `MIKRUS_PORT`, `MIKRUS_USER`, `MIKRUS_PASSWORD`,
  `MIKRUS_HOST_KEY`, `MIKRUS_DEPLOY_DIR` for SSH and deployment.
- `CC_URL`, `CC_LOGIN_EMAIL`, `CC_LOGIN_PASSWORD` for the CityCatalyst UI.

The real `.env.mikrus` is ignored by Git and should have mode `0600`. The branch
contains only [`.env.mikrus.example`](../../.env.mikrus.example), with placeholder
passwords. On another machine, copy that template and populate the credentials
through a private channel. The SSH password is not the Mikrus customer-panel
password. The existing database/API/SMTP secrets remain in service `.env` files
on the VPS; deployments preserve them.

```sh
cp .env.mikrus.example .env.mikrus  # only on a new machine; do not overwrite yours
chmod 600 .env.mikrus
python3 ops/mikrus/remote.py 'hostname; docker ps'
```

`remote.py` verifies the pinned Ed25519 host fingerprint before authenticating.
It reads `.env.mikrus` directly, so sourcing the file is unnecessary. For uploads:

```sh
python3 ops/mikrus/remote.py put LOCAL_FILE /root/citycatalyst/REMOTE_FILE
```

## Deploy to the existing instance

Prerequisites: Python 3.12+, OpenSSH client tools, Node.js 22/npm, enough local
memory to build Next.js, and the build-time application configuration normally
used in `app/.env` / `app/.env.local`. The server already needs Docker Compose,
the service env files, and its initialized database. This is a redeployment
workflow, not provisioning a fresh VPS.

Commit the code you intend to deploy, then run from the repository root:

```sh
# Read-only: display server, revision and deployment steps.
python3 ops/mikrus/deploy.py --dry-run

# Build and deploy the current committed revision.
python3 ops/mikrus/deploy.py
```

The deploy command builds an archive of the committed source in a temporary
local directory (`npm ci`, production Next.js build, OpenAPI generation). It
copies local app env files there for build configuration but excludes env files,
node_modules and build caches from the uploaded release. Next.js public/build-time
environment settings are still compiled into the build as usual. The `.env.mikrus`
file is never part of the source archive or the upload.

The release is uploaded to `/root/citycatalyst/releases/<commit>/`. `build.sh`
builds the web runtime image from the prebuilt `.next` and the Climate Advisor
image on Mikrus. `rollout.sh` then stops web/CA/cron, saves a database dump and
configuration backup, applies migrations, runs `up.sh`, installs recovery, and
checks liveness. There is a brief outage during rollout. Database migration
failures require review; the script does not automatically undo database changes.
It operates on the `citycatalyst` Compose project only.

For an already-uploaded release, the corresponding server commands are:

```sh
cd /root/citycatalyst/releases/COMMIT
sh ops/mikrus/build.sh COMMIT
bash ops/mikrus/rollout.sh COMMIT /root/citycatalyst
```

`Dockerfile.mikrus`, `build.sh`, `up.sh`, and `init-db.sh` preserve the approach
used for the deployed `40ee45a70` revision. `rollout.sh` generalizes its previous
hardcoded revision and backup directory. `deploy.py` packages that workflow into
one command. The original private `.codex/mikrus-deploy` files are no longer
needed for the documented commands.

## Incident: 2026-10-13

The last successful liveness request before the outage was at 04:36:31 UTC
(06:36:31 Warsaw time). The Next.js process remained running and consumed CPU,
but public requests, host-local requests, internal cron calls, and container
health checks all timed out. Docker reported 339 consecutive health failures
when inspected. The database remained healthy, memory and disk had room, and
the web container was not marked OOM-killed.

Restarting only the web container restored the login page and liveness endpoint.
The confirmed deployment defects were:

1. `restart: unless-stopped` handles process exits, not a live process marked
   unhealthy. Nothing acted on the failing health checks.
2. Shell-wrapped probes had no request timeout, and npm was PID 1 without an
   init process. Failed checks accumulated live orphaned wget processes and
   zombies (364 total container processes/threads at inspection).

The exact code path that originally blocked Next.js was not present in the
completion-only request logs. An application-level root cause has **not** been
proven or patched. The changes here fix the prolonged outage and process cleanup
defects and capture the JavaScript stack if a similar hang occurs again.

## Recovery behavior

- The web container uses an init process and starts Node directly. Health probes
  execute wget directly with a five-second timeout and fail after three attempts.
- A host systemd timer checks every 30 seconds. It only restarts the explicitly
  labelled `citycatalyst-web-1` container when it is running and unhealthy.
- Healthy, starting, paused, deliberately stopped, and unlabelled containers are
  left alone. Container ID/start time are rechecked before restarting to avoid
  interfering with deployments. Attempts have a five-minute cooldown.
- A typical hang should recover in roughly two to three minutes, including the
  health-check threshold, timer interval, diagnostics, and startup. A repeat
  within the cooldown takes longer. This is recovery, not zero-downtime failover.
- Before restart, the watchdog saves state, resource usage, recent logs and a
  JavaScript stack. It briefly activates Node Inspector via SIGUSR1, connects
  from inside the container, pauses the stuck process, records code locations,
  and resumes it. Inspector uses container loopback only; port 9229 is not
  published. It disappears on restart. No local variables are captured.
- A Node diagnostic report is also attempted, with environment variables and
  network inspection excluded. Report signals alone do not capture tight loops
  reliably; the Inspector path is tested for that case. Diagnostic failure does
  not prevent a restart.
- Evidence is root-only under `/var/lib/citycatalyst-recovery/incident-*` (last
  ten restarted incidents). The latest report is at
  `/root/citycatalyst/diagnostics/web-hang.json`. Web Docker logs rotate at 10 MB,
  retaining three files. Existing outage logs are archived under
  `/root/citycatalyst/backups/incident-20261013`.

Docker's [restart policy documentation](https://docs.docker.com/engine/containers/start-containers-automatically/),
Node's [Inspector documentation](https://nodejs.org/learn/getting-started/debugging),
and [diagnostic report documentation](https://nodejs.org/api/report.html)
describe the mechanisms used here.

## Install or update recovery only

Copy the contents of this directory to `/root/citycatalyst/recovery` on the host,
then run:

```sh
sh /root/citycatalyst/recovery/install-recovery.sh
```

This preserves the existing web/Climate Advisor image tags and service env files,
backs up the compose file, recreates only web, waits for health, and enables the
timer across reboots. If the new web configuration does not become healthy, the
installer restores the previous compose configuration. The existing `up.sh`
continues to use `/root/citycatalyst/docker-compose.yml`, so later deployments
retain recovery settings. The versioned compose file in this directory is the
source for both deployment and recovery installation.

## Check and operate

```sh
systemctl status citycatalyst-recovery.timer
journalctl -u citycatalyst-recovery.service --since today
docker inspect --format '{{json .State.Health}}' citycatalyst-web-1
curl --fail --max-time 10 https://happy-turkey7765.byst.re/api/v1/check/liveness/

# Manual recovery; does not change images or database volumes:
docker restart --timeout 10 citycatalyst-web-1

# Disable automatic recovery for maintenance:
systemctl disable --now citycatalyst-recovery.timer
# Re-enable:
systemctl enable --now citycatalyst-recovery.timer
```

To roll back the container configuration, disable the timer, restore the relevant
`backups/docker-compose.before-recovery.*.yml`, export `WEB_IMAGE` and `CA_IMAGE`
from the running containers' `.Config.Image`, and run `docker compose -p
citycatalyst -f /root/citycatalyst/docker-compose.yml up -d --no-deps web`.

## Validation

```sh
# Local decision/guard tests:
python3 -m unittest discover -s ops/mikrus -p 'test_*.py' -v

# On Mikrus: real Docker fault injection, no public ports or database access:
python3 /root/citycatalyst/recovery/smoke-recovery.py
```

The smoke test uses the deployed Node image for a disposable HTTP server on an
isolated network, injects an infinite loop, verifies that diagnostics identify
`simulatedInfiniteLoop`, and verifies restart, healthy recovery, cooldown, and
respect for an intentional stop. It removes its container and evidence afterwards.
