"""
Pytest configuration and shared fixtures for HIAP-MEED.
"""

import os

import pytest
from fastapi.testclient import TestClient

# Disable file logging before importing the FastAPI app. `app.main` calls
# `setup_logger()` at import time and would otherwise create `LOG_DIR/app.log`.
os.environ.setdefault("LOG_FILE_ENABLED", "false")

from app.main import app


@pytest.fixture(autouse=True)
def disable_artifact_logging(monkeypatch: pytest.MonkeyPatch) -> None:
    """Disable per-request artifact JSONL writes during pytest runs."""
    monkeypatch.setenv("ARTIFACT_LOG_JSONL", "false")


@pytest.fixture
def client():
    """FastAPI test client fixture."""
    return TestClient(app)
