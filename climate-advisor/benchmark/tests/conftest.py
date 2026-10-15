"""Benchmark test settings."""

import os

import pytest


def pytest_configure(config: pytest.Config) -> None:
    """Keep benchmark tests from writing runs or traces to remote MLflow."""
    os.environ["MLFLOW_ENABLED"] = "false"
