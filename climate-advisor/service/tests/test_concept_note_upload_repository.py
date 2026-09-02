from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

import pytest
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.db import Base
from app.models.cnb.concept_note_markdown import (
    ConceptNoteMarkdownRequest,
    ConceptNoteUploadCreateRequest,
)
from app.models.db.concept_note import ConceptNoteRun, ConceptNoteUpload
from app.persistence.concept_notes.markdown import (
    ConceptNoteMarkdownRepositoryError,
    SqlAlchemyConceptNoteMarkdownRepository,
)


async def _set_run_updated_at(
    session_factory: async_sessionmaker[AsyncSession],
    run_id: UUID,
    value: datetime,
) -> None:
    """Set a stable timestamp before exercising one lifecycle transition."""
    async with session_factory() as session, session.begin():
        run = await session.get(ConceptNoteRun, run_id)
        assert run is not None
        run.updated_at = value


async def _get_run_updated_at(
    session_factory: async_sessionmaker[AsyncSession],
    run_id: UUID,
) -> datetime:
    """Read the parent run activity timestamp."""
    async with session_factory() as session:
        run = await session.get(ConceptNoteRun, run_id)
        assert run is not None
        return run.updated_at


@pytest.mark.asyncio
async def test_repository_persists_nullable_then_immutable_pointer(
    tmp_path,
) -> None:
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{(tmp_path / 'cnb.db').as_posix()}"
    )
    try:
        async with engine.begin() as connection:
            await connection.run_sync(
                lambda sync_connection: Base.metadata.create_all(
                    sync_connection,
                    tables=[
                        ConceptNoteRun.__table__,
                        ConceptNoteUpload.__table__,
                    ],
                )
            )
        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        run_id = uuid4()
        upload_id = uuid4()
        inactive_at = datetime(2020, 1, 1)
        async with session_factory() as session, session.begin():
            session.add(
                ConceptNoteRun(
                    run_id=run_id,
                    user_id="owner-user",
                    name="Test run",
                    city_id=str(uuid4()),
                    idempotency_key=uuid4(),
                    request_fingerprint="a" * 64,
                    context_summary={},
                    permission_summary={},
                    updated_at=inactive_at,
                )
            )

        repository = SqlAlchemyConceptNoteMarkdownRepository(session_factory)
        created = await repository.create_upload(
            user_id="owner-user",
            run_id=run_id,
            payload=ConceptNoteUploadCreateRequest(
                upload_id=upload_id,
                user_id="owner-user",
                filename="plan.pdf",
                source_label="Plan",
            ),
        )
        assert created.status == "queued"
        assert created.markdown_s3_key is None
        assert created.markdown_sha256 is None
        assert created.page_count is None
        assert await _get_run_updated_at(session_factory, run_id) != inactive_at

        await _set_run_updated_at(session_factory, run_id, inactive_at)
        failed = await repository.mark_failed(
            user_id="owner-user",
            run_id=run_id,
            upload_id=upload_id,
            error_code="ocr_failed",
        )
        assert failed.status == "failed"
        assert await _get_run_updated_at(session_factory, run_id) != inactive_at

        await _set_run_updated_at(session_factory, run_id, inactive_at)
        retried = await repository.retry_upload(
            user_id="owner-user",
            run_id=run_id,
            upload_id=upload_id,
        )
        assert retried.status == "queued"
        assert await _get_run_updated_at(session_factory, run_id) != inactive_at

        pointer = ConceptNoteMarkdownRequest(
            markdown_s3_key="pdf-ocr/results/result.md",
            filename="plan.pdf",
            source_label="Plan",
            page_count=3,
            sha256="b" * 64,
        )
        await _set_run_updated_at(session_factory, run_id, inactive_at)
        ready = await repository.register_markdown(
            user_id="owner-user",
            run_id=run_id,
            upload_id=upload_id,
            payload=pointer,
        )
        replayed = await repository.register_markdown(
            user_id="owner-user",
            run_id=run_id,
            upload_id=upload_id,
            payload=pointer,
        )
        assert ready.status == replayed.status == "ready"
        assert ready.markdown_s3_key == pointer.markdown_s3_key
        assert await _get_run_updated_at(session_factory, run_id) != inactive_at

        with pytest.raises(ConceptNoteMarkdownRepositoryError) as conflict:
            await repository.register_markdown(
                user_id="owner-user",
                run_id=run_id,
                upload_id=upload_id,
                payload=pointer.model_copy(
                    update={"markdown_s3_key": "different/result.md"}
                ),
            )
        assert conflict.value.code == "markdown_identity_conflict"
    finally:
        await engine.dispose()
