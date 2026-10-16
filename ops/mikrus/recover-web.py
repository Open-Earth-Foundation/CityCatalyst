#!/usr/bin/env python3
"""Recover only an opted-in, running, unhealthy web container; preserve evidence."""

import fcntl
import json
import os
from pathlib import Path
import shutil
import subprocess
import time


CONTAINER = os.environ.get("CC_RECOVERY_CONTAINER", "citycatalyst-web-1")
STATE = Path(os.environ.get("CC_RECOVERY_STATE", "/var/lib/citycatalyst-recovery"))
COOLDOWN = 300
LABEL = "io.citycatalyst.auto-recover"


def docker(*args, timeout=10):
    return subprocess.run(
        ["docker", *args], text=True, capture_output=True, timeout=timeout, check=True
    ).stdout


def inspect():
    return json.loads(docker("inspect", CONTAINER))[0]


def eligible(info):
    state = info["State"]
    return (
        info["Config"].get("Labels", {}).get(LABEL) == "true"
        and state["Status"] == "running"
        and not state.get("Paused", False)
        and state.get("Health", {}).get("Status") == "unhealthy"
    )


def capture(path, *args):
    try:
        result = subprocess.run(
            ["docker", *args], text=True, capture_output=True, timeout=10, check=True
        )
        path.write_text(result.stdout + result.stderr)
    except (subprocess.SubprocessError, OSError) as error:
        # Avoid echoing credentials or request data from command output.
        path.write_text(f"Diagnostic unavailable: {type(error).__name__}\n")


def recover():
    info = inspect()
    if not eligible(info):
        return False
    now = time.time()
    marker = STATE / "last-attempt"
    if marker.exists() and now - marker.stat().st_mtime < COOLDOWN:
        print(f"{CONTAINER}: unhealthy; restart cooldown active", flush=True)
        return False

    incident = STATE / (time.strftime("incident-%Y%m%dT%H%M%SZ", time.gmtime(now)))
    incident.mkdir(mode=0o700)
    # Deliberately exclude Config.Env and full inspect output from evidence.
    (incident / "state.json").write_text(json.dumps({
        "id": info["Id"], "image": info["Config"]["Image"],
        "state": info["State"], "restartCount": info["RestartCount"],
    }, indent=2))
    capture(incident / "processes.txt", "top", CONTAINER)
    capture(incident / "resources.txt", "stats", "--no-stream", "--format", "{{json .}}", CONTAINER)
    capture(incident / "logs.txt", "logs", "--timestamps", "--tail", "100", CONTAINER)

    # A concurrent rollout/manual stop must not be undone by this watchdog.
    current = inspect()
    if (current["Id"], current["State"]["StartedAt"]) != (
        info["Id"], info["State"]["StartedAt"]
    ) or not eligible(current):
        return False

    # The init process forwards SIGUSR2 to node. Never signal an image that
    # has not explicitly enabled Node diagnostic reports.
    if "--report-on-signal" in current["Config"].get("Cmd", []):
        # Inspector runs on its own thread and can interrupt a tight JS loop,
        # unlike the report signal which may need a responsive event loop.
        capture(incident / "inspector-start.txt", "kill", "--signal=SIGUSR1", current["Id"])
        try:
            stack = subprocess.run(
                ["docker", "exec", "-i", current["Id"], "node", "--input-type=module"],
                input=Path(__file__).resolve().with_name("capture-stack.mjs").read_text(),
                text=True, capture_output=True, timeout=10, check=True,
            )
            (incident / "javascript-stack.json").write_text(stack.stdout)
        except (subprocess.SubprocessError, OSError):
            (incident / "javascript-stack-unavailable.txt").write_text("Inspector capture unavailable\n")
        capture(incident / "signal.txt", "kill", "--signal=SIGUSR2", current["Id"])
        time.sleep(3)
        # Best effort: a deeply stuck runtime may not process the signal.
        try:
            docker("cp", f"{current['Id']}:/diagnostics/web-hang.json", str(incident / "node-report.json"))
            report_path = incident / "node-report.json"
            report = json.loads(report_path.read_text())
            if int(report["header"]["dumpEventTimeStamp"]) < now * 1000:
                report_path.unlink()  # Never attribute an older report to this incident.
        except (subprocess.SubprocessError, OSError, ValueError, KeyError):
            (incident / "node-report.json").unlink(missing_ok=True)

    current = inspect()
    if (current["Id"], current["State"]["StartedAt"]) != (
        info["Id"], info["State"]["StartedAt"]
    ) or not eligible(current):
        return False

    marker.touch()
    print(f"{CONTAINER}: restarting unhealthy container; evidence: {incident}", flush=True)
    docker("restart", "--timeout", "10", current["Id"], timeout=40)
    for old in sorted(STATE.glob("incident-*"))[:-10]:
        if old.is_dir():
            shutil.rmtree(old)
    return True


def main():
    os.umask(0o077)
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (STATE / "lock").open("w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        recover()


if __name__ == "__main__":
    main()
