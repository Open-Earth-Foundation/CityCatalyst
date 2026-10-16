#!/usr/bin/env python3
"""SSH/SCP to Mikrus using the ignored, repository-root .env.mikrus."""

import argparse
import os
from pathlib import Path
import re
import shlex
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]


def load_env(path=ROOT / ".env.mikrus"):
    values = {}
    for line in path.read_text().splitlines():
        match = re.match(r"^\s*(?:export\s+)?([A-Za-z_]\w*)\s*=(.*)$", line)
        if match:
            tokens = shlex.split(match[2], comments=True)
            values[match[1]] = tokens[0] if tokens else ""
    return values


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", help="Remote shell command, or 'put' to upload a file")
    parser.add_argument("paths", nargs="*", help="For put: LOCAL_FILE REMOTE_PATH")
    args = parser.parse_args()
    if (args.command == "put" and len(args.paths) != 2) or (args.command != "put" and args.paths):
        parser.error("Use remote.py 'COMMAND' or remote.py put LOCAL_FILE REMOTE_PATH")
    try:
        values = load_env()
        host, port, user, password, fingerprint = (
            values[key] for key in ("MIKRUS_HOST", "MIKRUS_PORT", "MIKRUS_USER",
                                    "MIKRUS_PASSWORD", "MIKRUS_HOST_KEY")
        )
    except (FileNotFoundError, KeyError) as error:
        parser.error(f"Configure .env.mikrus from .env.mikrus.example first: {error}")
    pin = re.search(r"SHA256:[A-Za-z0-9+/=]+", fingerprint)
    if not pin:
        parser.error("MIKRUS_HOST_KEY must contain the verified SHA256 host fingerprint")

    with tempfile.TemporaryDirectory(prefix="mikrus-cc-") as temp:
        known = Path(temp) / "known_hosts"
        scan = subprocess.run(
            ["ssh-keyscan", "-T", "10", "-p", port, "-t", "ed25519", host],
            capture_output=True, text=True, timeout=20, check=True,
        )
        known.write_text(scan.stdout)
        fingerprints = subprocess.run(
            ["ssh-keygen", "-lf", str(known), "-E", "sha256"],
            capture_output=True, text=True, check=True,
        ).stdout.split()
        if pin.group(0) not in fingerprints:
            raise SystemExit("Mikrus SSH host key does not match MIKRUS_HOST_KEY")
        askpass = Path(temp) / "askpass"
        askpass.write_text('#!/usr/bin/env python3\nimport os\nprint(os.environ["MIKRUS_SSH_PASSWORD"])\n')
        askpass.chmod(0o700)
        env = dict(os.environ, MIKRUS_SSH_PASSWORD=password, SSH_ASKPASS=str(askpass),
                   SSH_ASKPASS_REQUIRE="force", DISPLAY=":0")
        options = ["-o", "StrictHostKeyChecking=yes", "-o", f"UserKnownHostsFile={known}",
                   "-o", "GlobalKnownHostsFile=/dev/null", "-o", "PreferredAuthentications=password",
                   "-o", "PubkeyAuthentication=no", "-o", "NumberOfPasswordPrompts=1",
                   "-o", "ConnectTimeout=15"]
        if args.command == "put":
            command = ["scp", *options, "-P", port, args.paths[0], f"{user}@{host}:{args.paths[1]}"]
        else:
            command = ["ssh", *options, "-p", port, f"{user}@{host}", args.command]
        raise SystemExit(subprocess.run(command, env=env, start_new_session=True).returncode)


if __name__ == "__main__":
    main()
