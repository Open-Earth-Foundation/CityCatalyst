"""
Pytest configuration and shared fixtures for HIAP-MEED.
"""

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Add project root (hiap-meed/) and app directory (hiap-meed/app) to sys.path so
# unqualified imports in main.py (e.g., `utils`) resolve.
project_root = Path(__file__).resolve().parents[1]
app_dir = project_root / "app"
if str(app_dir) not in sys.path:
    sys.path.insert(0, str(app_dir))
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

# Import the FastAPI app from main (unqualified), matching production layout.
import main  # type: ignore

app = main.app


@pytest.fixture
def client():
    """FastAPI test client fixture."""
    return TestClient(app)

