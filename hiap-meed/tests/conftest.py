"""
Pytest configuration and shared fixtures for HIAP-MEED.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(autouse=True)
def disable_artifact_logging(monkeypatch: pytest.MonkeyPatch) -> None:
    """Disable per-request artifact JSONL writes during pytest runs."""
    monkeypatch.setenv("ARTIFACT_LOG_JSONL", "false")


@pytest.fixture
def client():
    """FastAPI test client fixture."""
    return TestClient(app)
