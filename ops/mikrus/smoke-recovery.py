#!/usr/bin/env python3
"""On the Docker host, exercise recovery with an isolated disposable Node server."""

import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import uuid


def run(*args, **kwargs):
    return subprocess.run(args, check=True, text=True, capture_output=True, timeout=60, **kwargs).stdout.strip()


def wait_for(predicate, description):
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(1)
    raise AssertionError(f"Timed out: {description}")


name = "cc-recovery-test-" + uuid.uuid4().hex[:8]
image = run("docker", "inspect", "--format", "{{.Config.Image}}", "citycatalyst-web-1")
script = Path(__file__).with_name("recover-web.py")
fixture = """
require('node:http').createServer((req, res) => {
  res.end('ok');
  if (req.url === '/hang') setImmediate(function simulatedInfiniteLoop() {
    while (true) {}
  });
}).listen(3000, '127.0.0.1');
"""

with tempfile.TemporaryDirectory(prefix="cc-recovery-test-") as temp:
    root = Path(temp)
    reports = root / "reports"
    reports.mkdir(mode=0o700)
    env = dict(os.environ, CC_RECOVERY_CONTAINER=name, CC_RECOVERY_STATE=str(root / "state"))

    def inspect():
        return json.loads(run("docker", "inspect", name))[0]

    def recover():
        print(run("python3", str(script), env=env), flush=True)

    try:
        run("docker", "run", "-d", "--name", name, "--network", "none", "--init",
            "--memory", "160m", "--cpus", "0.25",
            "--label", "io.citycatalyst.auto-recover=true",
            "--mount", f"type=bind,source={reports},target=/diagnostics",
            "--health-cmd", "exec wget -q -T 1 -O /dev/null http://127.0.0.1:3000/",
            "--health-interval", "1s", "--health-timeout", "2s", "--health-retries", "2",
            "--entrypoint", "node", image,
            "--report-on-signal", "--report-exclude-env", "--report-exclude-network",
            "--report-directory=/diagnostics", "--report-filename=web-hang.json", "-e", fixture)
        wait_for(lambda: inspect()["State"]["Health"]["Status"] == "healthy", "initial health")
        before = inspect()["State"]["StartedAt"]
        recover()
        assert inspect()["State"]["StartedAt"] == before, "Healthy container was restarted"
        print("PASS: healthy container untouched", flush=True)

        # This blocks the event loop without exiting, matching the incident symptom.
        run("docker", "exec", name, "wget", "-q", "-T", "2", "-O", "/dev/null", "http://127.0.0.1:3000/hang")
        wait_for(lambda: inspect()["State"]["Health"]["Status"] == "unhealthy", "hang detection")
        recover()
        wait_for(lambda: inspect()["State"]["Health"]["Status"] == "healthy", "automatic recovery")
        assert inspect()["State"]["StartedAt"] != before
        assert list((root / "state").glob("incident-*/state.json")), "Missing incident evidence"
        print("PASS: infinite-loop hang detected, evidence saved, restarted and healthy", flush=True)
        stacks = list((root / "state").glob("incident-*/javascript-stack.json"))
        assert stacks, "Missing JavaScript stack for tight loop"
        frames = json.loads(stacks[0].read_text())["frames"]
        assert any(f["functionName"] == "simulatedInfiniteLoop" for f in frames), frames
        print("PASS: diagnostic captured exact simulatedInfiniteLoop code location", flush=True)
        report_files = list((root / "state").glob("incident-*/node-report.json"))
        if report_files:
            report = json.loads(report_files[0].read_text())
            assert "environmentVariables" not in report, "Report exposed environment"
            print("PASS: Node diagnostic report captured without environment variables", flush=True)
        else:
            print("NOTE: blocked runtime did not produce a signal report; process/log evidence captured", flush=True)

        # A second hang should be held by the cooldown instead of restarting rapidly.
        run("docker", "exec", name, "wget", "-q", "-T", "2", "-O", "/dev/null", "http://127.0.0.1:3000/hang")
        wait_for(lambda: inspect()["State"]["Health"]["Status"] == "unhealthy", "second hang")
        before = inspect()["State"]["StartedAt"]
        recover()
        assert inspect()["State"]["StartedAt"] == before
        print("PASS: repeated hang respects restart cooldown", flush=True)

        run("docker", "stop", "--timeout", "2", name)
        recover()
        assert inspect()["State"]["Status"] == "exited"
        print("PASS: intentionally stopped container stays stopped", flush=True)
    finally:
        run("docker", "rm", "-f", name)
