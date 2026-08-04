from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import get_app


def _client() -> TestClient:
    """Create an isolated test client for health-route checks."""
    return TestClient(get_app())


def test_readiness_returns_ready_when_database_query_succeeds() -> None:
    session = AsyncMock()

    @asynccontextmanager
    async def open_session():
        yield session

    with patch(
        "app.routes.health.get_session_factory",
        return_value=open_session,
    ):
        response = _client().get("/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}
    session.execute.assert_awaited_once()


def test_readiness_returns_503_when_database_is_not_configured() -> None:
    with patch(
        "app.routes.health.get_session_factory",
        side_effect=RuntimeError("CA_DATABASE_URL is not configured"),
    ):
        response = _client().get("/ready")

    assert response.status_code == 503
    assert response.json()["detail"] == "Workflow database is unavailable"


def test_readiness_returns_503_when_database_query_fails() -> None:
    session = AsyncMock()
    session.execute.side_effect = OSError("database is unreachable")

    @asynccontextmanager
    async def open_session():
        yield session

    with patch(
        "app.routes.health.get_session_factory",
        return_value=open_session,
    ):
        response = _client().get("/ready")

    assert response.status_code == 503
    assert response.json()["detail"] == "Workflow database is unavailable"
