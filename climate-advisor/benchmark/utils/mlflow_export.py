"""Explicit MLflow parent/fixture export and checksum-verified artifact restore.

Uses MLFLOW_TRACKING_URI and standard MLflow authentication environment variables.
No fluent/global run state or service autologging is changed. Exports are strict;
callers that need best-effort behavior should catch failures at their boundary.
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
import shutil
import tempfile
import time
from collections.abc import Mapping
from pathlib import Path

from mlflow.entities import Metric, Param
from mlflow.tracking import MlflowClient

MANIFEST = "sha256-manifest.json"
logger = logging.getLogger(__name__)


def _digest(path: Path) -> str:
    """Hash a file without loading large review bundles into memory."""
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def _log_values(
    client: MlflowClient, run_id: str, metrics: Mapping[str, float | None],
    params: Mapping[str, object],
) -> None:
    """Log finite available metrics and non-null serialized parameters."""
    timestamp = int(time.time() * 1000)
    values = [Metric(k, float(v), timestamp, 0) for k, v in metrics.items()
              if v is not None and math.isfinite(float(v))]
    parameters = [Param(k, v if isinstance(v, str) else json.dumps(v, sort_keys=True))
                  for k, v in params.items() if v is not None]
    # Respect tracking-server batch limits, including older servers.
    for offset in range(0, max(len(values), len(parameters)), 100):
        client.log_batch(run_id, metrics=values[offset:offset + 100],
                         params=parameters[offset:offset + 100])


def export_run_dir(
    run_dir: Path, *, experiment_name: str,
    metrics: Mapping[str, float | None], params: Mapping[str, object],
    tags: Mapping[str, str], children: Mapping[str, Mapping[str, float | None]],
    tracking_uri: str | None = None,
) -> str:
    """Snapshot a directory, log parent/fixture runs, and return the parent ID.

    Raises on incomplete upload and marks created runs FAILED. The source is
    never changed. Only files within the source directory may be exported.
    """
    client = MlflowClient(tracking_uri=tracking_uri)
    # Snapshot first so the checksum manifest describes exactly the uploaded bytes.
    with tempfile.TemporaryDirectory() as temporary:
        snapshot = Path(temporary) / "run"
        if not run_dir.is_dir():
            raise ValueError("Run directory does not exist")
        for path in run_dir.rglob("*"):
            if path.is_symlink():
                raise ValueError("Run artifacts must not contain symbolic links")
        shutil.copytree(run_dir, snapshot)
        if (snapshot / MANIFEST).exists():
            raise ValueError("Source contains reserved checksum manifest")
        manifest = {p.relative_to(snapshot).as_posix(): _digest(p)
                    for p in sorted(snapshot.rglob("*")) if p.is_file()}
        (snapshot / MANIFEST).write_text(json.dumps({"version": 1, "files": manifest},
                                                   indent=2), encoding="utf-8")
        experiment = client.get_experiment_by_name(experiment_name)
        experiment_id = (experiment.experiment_id if experiment else
                         client.create_experiment(experiment_name))
        parent = client.create_run(experiment_id, tags=dict(tags), run_name=run_dir.name)
        parent_id = parent.info.run_id
        try:
            _log_values(client, parent_id, metrics, params)
            for name, child_metrics in children.items():
                child = client.create_run(experiment_id, run_name=name, tags={
                    **tags, "fixture_id": name, "mlflow.parentRunId": parent_id,
                })
                child_id = child.info.run_id
                try:
                    _log_values(client, child_id, child_metrics, {})
                except Exception:
                    client.set_terminated(child_id, "FAILED")
                    raise
                client.set_terminated(child_id)
            client.log_artifacts(parent_id, str(snapshot), artifact_path="run")
        except Exception:
            client.set_terminated(parent_id, "FAILED")
            raise
        client.set_terminated(parent_id)
    logger.info("Exported benchmark artifacts run_id=%s", parent_id)
    return parent_id


def download_run(
    run_id: str, destination: Path, *, tracking_uri: str | None = None,
) -> Path:
    """Restore verified artifacts to a new directory, refusing any overwrite.

    Raises on missing/extra files, checksum mismatch or unsafe manifest paths.
    The transport manifest is removed so baseline artifact hashes stay identical.
    """
    if destination.exists():
        raise FileExistsError(destination)
    client = MlflowClient(tracking_uri=tracking_uri)
    # Validate in staging before exposing any files to viewer/baseline consumers.
    with tempfile.TemporaryDirectory() as temporary:
        restored = Path(client.download_artifacts(run_id, "run", temporary))
        manifest = json.loads((restored / MANIFEST).read_text(encoding="utf-8"))
        if manifest.get("version") != 1 or not isinstance(manifest.get("files"), dict):
            raise ValueError("Unsupported checksum manifest")
        expected = manifest["files"]
        actual = {p.relative_to(restored).as_posix() for p in restored.rglob("*")
                  if p.is_file() and p != restored / MANIFEST}
        if actual != set(expected):
            raise ValueError("Artifact file set does not match checksum manifest")
        for name, digest in expected.items():
            path = restored / name
            if not path.resolve().is_relative_to(restored.resolve()) or path.is_symlink():
                raise ValueError("Unsafe artifact path")
            if _digest(path) != digest:
                raise ValueError(f"Checksum mismatch: {name}")
        (restored / MANIFEST).unlink()
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(restored, destination)
    logger.info("Verified and restored benchmark artifacts run_id=%s", run_id)
    return destination
