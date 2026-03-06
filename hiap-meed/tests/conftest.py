"""
Pytest configuration and shared fixtures for HIAP-MEED.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    """FastAPI test client fixture."""
    return TestClient(app)
