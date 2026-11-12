"""Pytest configuration and shared fixtures for HIAP Brazil v3."""

import os

import pytest
from fastapi.testclient import TestClient

# Disable file logging before importing the app: `app.main` calls
# `setup_logger()` at import time and would otherwise create `LOG_DIR/app.log`.
os.environ.setdefault("LOG_FILE_ENABLED", "false")

from app.main import app


@pytest.fixture
def client() -> TestClient:
    """FastAPI test client fixture."""
    return TestClient(app)
