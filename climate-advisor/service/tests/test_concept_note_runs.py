from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.models.db.thread import Thread
from app.persistence.concept_notes.runs import ConceptNoteRunRepository


async def test_thread_ownership_rejects_missing_and_wrong_user_threads() -> None:
    """Require both an existing thread and its matching user without a run FK."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
        engine,
        expire_on_commit=False,
    )
    owned_thread_id = uuid4()

    try:
        async with engine.begin() as connection:
            await connection.run_sync(Thread.__table__.create)

        async with session_factory() as session:
            session.add(Thread(thread_id=owned_thread_id, user_id="owner-1"))
            await session.commit()
            repository = ConceptNoteRunRepository(session)

            assert await repository.thread_belongs_to_user(
                thread_id=owned_thread_id,
                user_id="owner-1",
            )
            assert not await repository.thread_belongs_to_user(
                thread_id=owned_thread_id,
                user_id="other-user",
            )
            assert not await repository.thread_belongs_to_user(
                thread_id=uuid4(),
                user_id="owner-1",
            )
    finally:
        await engine.dispose()
