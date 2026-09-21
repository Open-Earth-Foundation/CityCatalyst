"""Unit tests for the local MLflow configuration preflight CLI."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

_SCRIPT_PATH = (
    Path(__file__).resolve().parents[1] / "scripts" / "mlflow_preflight.py"
)


def _load_preflight_module():
    """Load the service script even when parent `scripts` shadows the package."""
    spec = importlib.util.spec_from_file_location(
        "mlflow_preflight_under_test", _SCRIPT_PATH
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_preflight_json_omits_credentials_and_exits_when_unready(
    monkeypatch, capsys
) -> None:
    """The CLI must not print secrets and must fail closed when MLflow is off."""
    module = _load_preflight_module()
    monkeypatch.setenv("MLFLOW_ENABLED", "false")
    monkeypatch.setenv("MLFLOW_TRACKING_USERNAME", "service-user")
    monkeypatch.setenv("MLFLOW_TRACKING_PASSWORD", "super-secret")
    monkeypatch.setattr(module, "_load_local_env", lambda: None)

    exit_code = module.main(["--json"])
    output = capsys.readouterr().out

    assert exit_code == 1
    report = json.loads(output)
    assert report["enabled"] is False
    assert "super-secret" not in output
    assert "service-user" not in output
