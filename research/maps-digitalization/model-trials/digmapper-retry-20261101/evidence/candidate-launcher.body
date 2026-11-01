from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
from typing import Sequence

from criticalmaas_launcher import __version__

PIPELINE_MODULES = {
    "segmentation": {
        "pipeline": "pipelines.segmentation.run_pipeline",
        "server": "pipelines.segmentation.run_server",
        "imports": ["torch", "torchvision", "detectron2"],
        "model_args": ["--model <segmentation-model-dir>"],
    },
    "metadata_extraction": {
        "pipeline": "pipelines.metadata_extraction.run_pipeline",
        "server": "pipelines.metadata_extraction.run_server",
        "imports": ["torch", "torchvision", "detectron2"],
        "model_args": ["--model <segmentation-model-dir-or-null>"],
    },
    "point_extraction": {
        "pipeline": "pipelines.point_extraction.run_pipeline",
        "server": "pipelines.point_extraction.run_server",
        "imports": ["torch", "torchvision", "ultralytics"],
        "model_args": [
            "--model_point_extractor <point-model-file-or-dir>",
            "[--model_segmenter <segmentation-model-dir>]",
        ],
    },
    "geo_referencing": {
        "pipeline": "pipelines.geo_referencing.run_pipeline",
        "server": "pipelines.geo_referencing.run_server",
        "imports": ["torch", "torchvision", "detectron2", "rasterio", "pyproj"],
        "model_args": ["--model <georeferencing-model-dir>"],
    },
    "text_extraction": {
        "pipeline": "pipelines.text_extraction.run_pipeline",
        "server": "pipelines.text_extraction.run_server",
        "imports": ["google.cloud.vision", "rasterio"],
        "model_args": [],
    },
}

REPO_SENTINELS = ("pipelines", "tasks", "util", "data")


class LauncherError(RuntimeError):
    pass


def _is_repo_root(path: Path) -> bool:
    return path.is_dir() and all((path / entry).exists() for entry in REPO_SENTINELS)


def resolve_repo_root(explicit: str | None = None) -> Path:
    candidates: list[Path] = []
    for raw in (
        explicit,
        os.environ.get("CRITICALMAAS_REPO_ROOT"),
    ):
        if raw:
            candidates.append(Path(raw).expanduser())

    if getattr(sys, "frozen", False):
        meipass = Path(getattr(sys, "_MEIPASS", Path(sys.executable).resolve().parent))
        candidates.extend(
            [
                meipass / "repo",
                Path(sys.executable).resolve().parent / "repo",
                Path(sys.executable).resolve().parent,
            ]
        )

    here = Path(__file__).resolve()
    candidates.extend(
        [
            Path.cwd(),
            here.parent.parent,
            here.parent.parent.parent,
        ]
    )

    checked: set[Path] = set()
    for candidate in candidates:
        normalized = candidate.resolve()
        if normalized in checked:
            continue
        checked.add(normalized)
        if _is_repo_root(normalized):
            return normalized

    raise LauncherError(
        "Could not locate the CriticalMAAS source tree. Use --repo-root or set "
        "CRITICALMAAS_REPO_ROOT to a checkout/bundled directory containing pipelines/, tasks/, util/ and data/."
    )


def resolve_python(repo_root: Path, explicit: str | None = None) -> Path:
    if explicit:
        candidate = Path(explicit).expanduser().resolve()
        if candidate.exists():
            return candidate
        raise LauncherError(f"Python executable not found: {candidate}")

    env_python = os.environ.get("CRITICALMAAS_PYTHON")
    if env_python:
        candidate = Path(env_python).expanduser().resolve()
        if candidate.exists():
            return candidate
        raise LauncherError(f"CRITICALMAAS_PYTHON does not exist: {candidate}")

    candidates = [
        repo_root / ".venv" / "Scripts" / "python.exe",
        repo_root / ".venv" / "bin" / "python",
        Path(sys.executable).resolve().parent / ".venv" / "Scripts" / "python.exe",
        Path(sys.executable).resolve().parent / ".venv" / "bin" / "python",
    ]

    if not getattr(sys, "frozen", False):
        candidates.insert(0, Path(sys.executable).resolve())

    for candidate in candidates:
        if candidate.exists():
            return candidate

    raise LauncherError(
        "No usable Python runtime was found. Create a repository-local .venv, pass --python, "
        "or set CRITICALMAAS_PYTHON to the interpreter that has the required pipeline dependencies installed."
    )


def check_optional_imports(python_exe: Path, pipeline_name: str) -> None:
    imports = PIPELINE_MODULES[pipeline_name]["imports"]
    if not imports:
        return

    checker = (
        "import importlib, json, sys; "
        "mods=json.loads(sys.argv[1]); "
        "missing=[m for m in mods if importlib.util.find_spec(m) is None]; "
        "raise SystemExit(json.dumps(missing)) if missing else None"
    )
    result = subprocess.run(
        [str(python_exe), "-c", checker, json.dumps(imports)],
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        return

    missing = []
    payload = (result.stderr or result.stdout or "").strip()
    try:
        missing = json.loads(payload)
    except json.JSONDecodeError:
        pass

    hints = "\n".join(f"  - {item}" for item in PIPELINE_MODULES[pipeline_name]["model_args"])
    missing_text = ", ".join(missing) if missing else payload or "unknown optional modules"
    raise LauncherError(
        f"Missing optional runtime dependencies for '{pipeline_name}': {missing_text}.\n"
        "Install the matching pipeline environment first (see README Windows runtime section).\n"
        f"Common required runtime arguments:\n{hints if hints else '  - no model path required for this launcher command'}"
    )


def build_env(repo_root: Path) -> dict[str, str]:
    env = os.environ.copy()
    existing = env.get("PYTHONPATH")
    repo_text = str(repo_root)
    env["PYTHONPATH"] = repo_text if not existing else os.pathsep.join([repo_text, existing])
    return env


def run_module(python_exe: Path, repo_root: Path, module: str, forwarded_args: Sequence[str]) -> int:
    command = [str(python_exe), "-m", module, *forwarded_args]
    completed = subprocess.run(command, cwd=repo_root, env=build_env(repo_root))
    return completed.returncode


def create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="criticalmaas",
        description=(
            "Windows launcher for the mirrored DARPA CriticalMAAS / DIGMAPPER Uncharted TA1 pipelines. "
            "The launcher itself does not embed model weights or heavyweight runtime dependencies."
        ),
    )
    parser.add_argument("--version", action="version", version=f"criticalmaas-launcher {__version__}")
    parser.add_argument("--repo-root", help="Path to a repository checkout or bundled repo payload")
    parser.add_argument("--python", dest="python_exe", help="Python executable with prepared runtime dependencies")

    subparsers = parser.add_subparsers(dest="command", required=True)

    list_parser = subparsers.add_parser("list", help="List supported pipeline launcher targets")
    list_parser.set_defaults(handler=handle_list)

    doctor_parser = subparsers.add_parser("doctor", help="Show resolved paths and dependency expectations")
    doctor_parser.add_argument("pipeline", choices=sorted(PIPELINE_MODULES))
    doctor_parser.set_defaults(handler=handle_doctor)

    for command_name in ("pipeline", "server"):
        subparser = subparsers.add_parser(command_name, help=f"Launch an upstream {command_name} entrypoint")
        subparser.add_argument("pipeline", choices=sorted(PIPELINE_MODULES))
        subparser.add_argument("args", nargs=argparse.REMAINDER, help="Arguments forwarded to the upstream entrypoint")
        subparser.set_defaults(handler=handle_dispatch, target_kind=command_name)

    return parser


def handle_list(args: argparse.Namespace) -> int:
    for name, meta in sorted(PIPELINE_MODULES.items()):
        model_args = ", ".join(meta["model_args"]) if meta["model_args"] else "no external model path"
        print(f"{name}: {model_args}")
    return 0


def handle_doctor(args: argparse.Namespace) -> int:
    repo_root = resolve_repo_root(args.repo_root)
    python_exe = resolve_python(repo_root, args.python_exe)
    meta = PIPELINE_MODULES[args.pipeline]
    print(f"repo_root={repo_root}")
    print(f"python={python_exe}")
    print(f"pipeline_module={meta['pipeline']}")
    print(f"server_module={meta['server']}")
    print("expected_optional_imports=" + ", ".join(meta["imports"]))
    return 0


def handle_dispatch(args: argparse.Namespace) -> int:
    repo_root = resolve_repo_root(args.repo_root)
    python_exe = resolve_python(repo_root, args.python_exe)
    check_optional_imports(python_exe, args.pipeline)
    module = PIPELINE_MODULES[args.pipeline][args.target_kind]
    forwarded_args = list(args.args)
    return run_module(python_exe, repo_root, module, forwarded_args)


def main(argv: Sequence[str] | None = None) -> int:
    parser = create_parser()
    args = parser.parse_args(argv)
    try:
        return args.handler(args)
    except LauncherError as exc:
        parser.exit(status=2, message=f"ERROR: {exc}\n")


if __name__ == "__main__":
    raise SystemExit(main())
