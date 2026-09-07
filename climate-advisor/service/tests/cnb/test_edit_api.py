from __future__ import annotations

from collections.abc import AsyncIterator
from uuid import uuid4

import pytest
from app.db.base import Base
from app.db.session import get_session
from app.models.db.concept_note import ConceptNoteContextBundle, ConceptNoteRun
from app.persistence.concept_notes.edits import EditOperationError
from app.routes.concept_note_edits import edit_exception_handler, router
from app.services.citycatalyst_client import CityCatalystClientError
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from tests.cnb.edit_helpers import (
    CHAPTER_ID,
    RUN_ID,
    request,
    seed_chapter,
    service,
)
from tests.cnb.edit_helpers import (
    edit_database as edit_database,
)

CITY_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"


class FakeCityClient:
    revoked = False
    identity_calls = 0
    city_calls = 0

    async def validate_user_identity(self, token):
        self.identity_calls += 1
        if token not in {"owner-token", "other-token"}:
            raise CityCatalystClientError("Unauthorized", status_code=401)
        return "owner" if token == "owner-token" else "other"

    async def get_city(self, **kwargs):
        self.city_calls += 1
        if self.revoked:
            raise CityCatalystClientError("City access revoked", status_code=403)
        assert kwargs["city_id"] == CITY_ID
        return {"cityId": CITY_ID}

    async def close(self):
        pass


@pytest.fixture
async def api(edit_database, tmp_path, monkeypatch) -> AsyncIterator[tuple]:
    await seed_chapter(edit_database)
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{(tmp_path / 'workflow.db').as_posix()}"
    )
    async with engine.begin() as connection:
        await connection.run_sync(
            lambda sync: Base.metadata.create_all(
                sync,
                tables=[ConceptNoteRun.__table__, ConceptNoteContextBundle.__table__],
            )
        )
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session, session.begin():
        session.add(
            ConceptNoteRun(
                run_id=RUN_ID,
                user_id="owner",
                name="Synthetic edit run",
                city_id=CITY_ID,
                idempotency_key=uuid4(),
                request_fingerprint="a" * 64,
                status="active",
                workflow_step="editing_document",
                context_summary={},
                permission_summary={},
            )
        )

    async def session_dependency():
        async with sessions() as session:
            yield session

    city = FakeCityClient()
    edits = service(edit_database)
    monkeypatch.setattr(
        "app.services.concept_note_runs.CityCatalystClient", lambda: city
    )
    monkeypatch.setattr("app.routes.concept_note_edits.get_edit_service", lambda: edits)
    application = FastAPI()
    application.include_router(router, prefix="/v1")
    application.add_exception_handler(EditOperationError, edit_exception_handler)
    application.dependency_overrides[get_session] = session_dependency
    try:
        async with AsyncClient(
            transport=ASGITransport(app=application),
            base_url="http://test",
            headers={"Authorization": "Bearer owner-token"},
        ) as client:
            yield client, edits, city, sessions
    finally:
        await engine.dispose()


def path(suffix="", user="owner") -> str:
    return f"/v1/concept-notes/{RUN_ID}/edit-proposals{suffix}?user_id={user}"


async def test_api_proposal_apply_read_list_replay_use_real_persistence_and_auth(
    api,
) -> None:
    client, edits, city, _ = api
    body = request().model_dump(mode="json")
    created = await client.post(path(), json=body)
    assert created.status_code == 202
    proposal = created.json()
    assert proposal["status"] == "proposed"
    assert (await edits.workspace.list_chapters(run_id=RUN_ID))[0].revision_number == 1
    proposal_id = proposal["proposal_id"]
    assert (await client.get(path(f"/{proposal_id}"))).json() == proposal
    assert (await client.get(path())).json()[0] == proposal
    apply = {
        "idempotency_key": str(uuid4()),
        "expected_revisions": {str(CHAPTER_ID): 1},
    }
    result = await client.post(path(f"/{proposal_id}/apply"), json=apply)
    replay = await client.post(path(f"/{proposal_id}/apply"), json=apply)
    assert result.status_code == 200 and replay.json() == result.json()
    assert result.json()["result"]["revisions"] == {str(CHAPTER_ID): 2}
    assert city.identity_calls == 5 and city.city_calls == 5


async def test_missing_token_wrong_identity_and_foreign_run_are_rejected(api) -> None:
    client, _, _, _ = api
    assert (await client.get(path(), headers={"Authorization": ""})).status_code == 401
    assert (await client.get(path(user="other"))).status_code == 403
    assert (
        await client.get(
            path(user="other"), headers={"Authorization": "Bearer other-token"}
        )
    ).status_code == 404
    assert (
        await client.get(path().replace(str(RUN_ID), str(uuid4())))
    ).status_code == 404


async def test_city_permission_is_rechecked_before_apply(api) -> None:
    client, edits, city, _ = api
    proposal_id = (
        await client.post(path(), json=request().model_dump(mode="json"))
    ).json()["proposal_id"]
    city.revoked = True
    response = await client.post(
        path(f"/{proposal_id}/apply"),
        json={
            "idempotency_key": str(uuid4()),
            "expected_revisions": {str(CHAPTER_ID): 1},
        },
    )
    assert response.status_code == 403
    assert (await edits.workspace.list_chapters(run_id=RUN_ID))[0].revision_number == 1


async def test_invalid_payload_and_revision_vector_do_not_mutate(api) -> None:
    client, _, _, _ = api
    assert (
        await client.post(
            path(), json={"instruction": "edit", "idempotency_key": "invalid"}
        )
    ).status_code == 422
    proposal_id = (
        await client.post(path(), json=request().model_dump(mode="json"))
    ).json()["proposal_id"]
    response = await client.post(
        path(f"/{proposal_id}/apply"),
        json={
            "idempotency_key": str(uuid4()),
            "expected_revisions": {str(CHAPTER_ID): 99},
        },
    )
    assert (
        response.status_code == 409
        and response.json()["code"] == "revision_vector_mismatch"
    )


async def test_foreign_proposal_and_inactive_run_mutations_fail(api) -> None:
    client, _, _, sessions = api
    assert (await client.get(path(f"/{uuid4()}"))).status_code == 404
    async with sessions() as session, session.begin():
        run = await session.get(ConceptNoteRun, RUN_ID)
        run.status = "archived"
    response = await client.post(path(), json=request().model_dump(mode="json"))
    assert response.status_code == 409 and response.json()["code"] == "run_inactive"


async def test_service_unavailable_is_recoverable(api, monkeypatch) -> None:
    client, _, _, _ = api
    monkeypatch.setattr("app.routes.concept_note_edits.get_edit_service", lambda: None)
    assert (await client.get(path())).status_code == 503


def revisions_path(suffix="", user="owner") -> str:
    return f"/v1/concept-notes/{RUN_ID}/revisions{suffix}?user_id={user}"


async def apply_first(client):
    proposal = (
        await client.post(path(), json=request().model_dump(mode="json"))
    ).json()
    accepted = {
        "idempotency_key": str(uuid4()),
        "expected_revisions": proposal["base_revisions"],
    }
    response = await client.post(
        path(f"/{proposal['proposal_id']}/apply"), json=accepted
    )
    assert response.status_code == 200
    return response.json(), accepted


async def test_history_read_undo_restore_and_replay_preserve_real_revisions(
    api,
) -> None:
    client, edits, _, _ = api
    applied, _ = await apply_first(client)
    application_id = applied["result"]["application_id"]
    history = (await client.get(revisions_path())).json()
    assert (
        history[0]["application_id"] == application_id and history[0]["chapters"] == []
    )
    detail = (await client.get(revisions_path(f"/{application_id}"))).json()
    assert "builds parks" in detail["chapters"][0]["before"]
    assert "creates greener parks" in detail["chapters"][0]["after"]
    undo_body = {
        "idempotency_key": str(uuid4()),
        "expected_revisions": {str(CHAPTER_ID): 2},
    }
    undone = await client.post(
        revisions_path(f"/{application_id}/undo"), json=undo_body
    )
    assert undone.status_code == 200 and undone.json()["after_revisions"] == {
        str(CHAPTER_ID): 3
    }
    assert (
        await client.post(revisions_path(f"/{application_id}/undo"), json=undo_body)
    ).json() == undone.json()
    restored = await client.post(
        revisions_path(f"/{application_id}/restore"),
        json={
            "idempotency_key": str(uuid4()),
            "expected_revisions": {str(CHAPTER_ID): 3},
        },
    )
    assert restored.status_code == 200 and restored.json()["after_revisions"] == {
        str(CHAPTER_ID): 4
    }
    older = (await client.get(revisions_path() + "&before_sequence=3")).json()
    assert [entry["sequence"] for entry in older] == [2, 1]
    assert (await edits.workspace.list_chapters(run_id=RUN_ID))[0].revision_number == 4


async def test_history_endpoints_refuse_foreign_owners_and_unknown_revisions(
    api,
) -> None:
    client, _, _, _ = api
    applied, _ = await apply_first(client)
    application_id = applied["result"]["application_id"]
    for suffix in ["", f"/{application_id}"]:
        assert (
            await client.get(
                revisions_path(suffix, user="other"),
                headers={"Authorization": "Bearer other-token"},
            )
        ).status_code == 404
    assert (await client.get(revisions_path(f"/{uuid4()}"))).status_code == 404
    assert (
        await client.post(
            revisions_path(f"/{application_id}/undo", user="other"),
            headers={"Authorization": "Bearer other-token"},
            json={
                "idempotency_key": str(uuid4()),
                "expected_revisions": {str(CHAPTER_ID): 2},
            },
        )
    ).status_code == 404
