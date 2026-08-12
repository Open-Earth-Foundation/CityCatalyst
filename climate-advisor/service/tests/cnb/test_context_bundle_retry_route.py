from __future__ import annotations

from uuid import uuid4

from app.main import get_app
from app.persistence.concept_notes.context_bundle import (
    ContextBundleBuildSnapshot,
    ContextBundleRepositoryError,
)
from app.routes.concept_note_context_bundle import get_citycatalyst_client
from app.services.cnb.context_bundle import get_context_bundle_service
from fastapi.testclient import TestClient


class FakeClient:
    async def validate_user_identity(self, token: str) -> str:
        return "owner"


class FakeService:
    def __init__(self, run_id) -> None:
        self.run_id = run_id
        self.calls: list[dict] = []

    async def begin(self, **kwargs):
        self.calls.append(kwargs)
        return ContextBundleBuildSnapshot(
            run_id=self.run_id,
            city_id=str(uuid4()),
            build_id=uuid4(),
            source_fingerprint="a" * 64,
            uploads=[],
            already_current=False,
        )


class FailingService:
    async def begin(self, **kwargs):
        raise ContextBundleRepositoryError(
            "cnb_storage_unavailable",
            503,
            "database password and internal stack trace",
        )


def test_retry_route_authorizes_and_queues_guarded_build(monkeypatch) -> None:
    run_id = uuid4()
    service = FakeService(run_id)
    scheduled: list[dict] = []
    app = get_app()
    app.dependency_overrides[get_citycatalyst_client] = lambda: FakeClient()
    app.dependency_overrides[get_context_bundle_service] = lambda: service
    monkeypatch.setattr(
        "app.routes.concept_note_context_bundle.schedule_context_bundle_build",
        lambda **kwargs: scheduled.append(kwargs),
    )
    try:
        with TestClient(app) as client:
            response = client.post(
                f"/v1/concept-notes/{run_id}/context-bundle/retry",
                headers={"Authorization": "Bearer token"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 202
    assert response.json() == {"run_id": str(run_id), "status": "queued"}
    assert service.calls == [{"user_id": "owner", "run_id": run_id, "force": True}]
    assert scheduled[0]["snapshot"].run_id == run_id
    assert scheduled[0]["force"] is True


def test_retry_route_does_not_expose_repository_exception_details() -> None:
    run_id = uuid4()
    app = get_app()
    app.dependency_overrides[get_citycatalyst_client] = lambda: FakeClient()
    app.dependency_overrides[get_context_bundle_service] = lambda: FailingService()
    try:
        with TestClient(app) as client:
            response = client.post(
                f"/v1/concept-notes/{run_id}/context-bundle/retry",
                headers={"Authorization": "Bearer token"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 503
    assert response.json() == {
        "code": "cnb_storage_unavailable",
        "detail": "Concept Note context storage is unavailable",
        "status": 503,
    }
