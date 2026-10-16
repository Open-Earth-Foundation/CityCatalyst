#!/usr/bin/env python3
"""Build locally, upload a release, then build images and deploy on existing Mikrus."""

import argparse
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import tarfile
import tempfile

from remote import ROOT, load_env

HERE = Path(__file__).resolve().parent


def run(*args, cwd=ROOT):
    subprocess.run(args, cwd=cwd, check=True)


def release_member(member):
    """Exclude private config, local dependencies, and caches from uploads."""
    path = Path(member.name)
    if (path.name.startswith(".env") or path.name == ".secrets.state"
            or "node_modules" in path.parts or "/.next/cache" in member.name):
        return None
    return member


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Show target and plan; do not build, upload or deploy")
    args = parser.parse_args()
    values = load_env()
    tag = subprocess.check_output(["git", "rev-parse", "--short=12", "HEAD"], cwd=ROOT, text=True).strip()
    stack = values.get("MIKRUS_DEPLOY_DIR", "/root/citycatalyst")
    release = f"{stack}/releases/{tag}"
    print(f"Target: {values['MIKRUS_HOST']}:{values['MIKRUS_PORT']} ({stack})", flush=True)
    print(f"Site: {values['CC_URL']} | revision/image tag: {tag}", flush=True)
    if args.dry_run:
        print("Plan: npm ci/build/openapi locally; archive committed source + build output; upload; build images; stop writers; back up DB; migrate; start; install recovery.")
        return
    # Build and package the same committed source. Never ship unrelated local edits.
    run("git", "diff", "--exit-code", "HEAD", "--", "app", "climate-advisor", "ops/mikrus")
    if not shutil.which("npm"):
        parser.error("Install Node.js 22 and npm locally before deploying")
    with tempfile.TemporaryDirectory(prefix="citycatalyst-mikrus-") as temp:
        temp = Path(temp)
        source = temp / "source.tar"
        run("git", "archive", "--format=tar", "-o", str(source), "HEAD", "app", "climate-advisor", "ops/mikrus")
        with tarfile.open(source) as archive:
            archive.extractall(temp, filter="data")
        (temp / "app").rename(temp / "web")
        (temp / "climate-advisor").rename(temp / "ca")
        # Build the archive, not the working tree (which may contain ignored or
        # untracked source). Build-time app config stays local and is not shipped.
        for name in (".env", ".env.local", ".env.production", ".env.production.local"):
            if (ROOT / "app" / name).is_file():
                shutil.copy2(ROOT / "app" / name, temp / "web" / name)
                (temp / "web" / name).chmod(0o600)
        run("npm", "ci", cwd=temp / "web")
        run("npm", "run", "build", cwd=temp / "web")
        run("npm", "run", "openapi:build", cwd=temp / "web")
        if not (temp / "web/.next/BUILD_ID").is_file():
            raise SystemExit("Missing production .next/BUILD_ID")
        shutil.copy2(HERE / "Dockerfile.mikrus", temp / "web/Dockerfile.mikrus")
        # The normal app .dockerignore excludes .next; this image needs that build.
        (temp / "web/.dockerignore").write_text("node_modules\n.env*\n.git\n.next/cache\n")
        bundle = temp / "release.tar.gz"
        with tarfile.open(bundle, "w:gz") as archive:
            for name in ("web", "ca", "ops"):
                archive.add(temp / name, arcname=name, filter=release_member)
        helper = str(HERE / "remote.py")
        run(sys.executable, helper, f"install -d -m 700 {shlex.quote(release)}")
        run(sys.executable, helper, "put", str(bundle), f"{release}/release.tar.gz")
        command = (
            f"set -eu; cd {shlex.quote(release)}; tar -xzf release.tar.gz; "
            f"sh ops/mikrus/build.sh {shlex.quote(tag)}; "
            f"bash ops/mikrus/rollout.sh {shlex.quote(tag)} {shlex.quote(stack)}"
        )
        run(sys.executable, helper, command)


if __name__ == "__main__":
    main()
