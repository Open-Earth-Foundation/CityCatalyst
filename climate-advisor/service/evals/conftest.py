"""Eval settings: no remote MLflow unless an eval harness opts in."""

import os

import pytest


def pytest_configure(config: pytest.Config) -> None:
    """Keep eval runs from writing runs or traces to remote MLflow by default."""
    os.environ["MLFLOW_ENABLED"] = "false"
