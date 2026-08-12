from collections.abc import AsyncIterator
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import Uuid, bindparam, text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from app.services.cnb.funding_references import PostgresFundingReferenceValidator


@pytest.fixture
async def reference_session_factory() -> AsyncIterator[
    async_sessionmaker[AsyncSession]
]:
    """Provide managed-reference table shapes through in-memory SQLite."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as connection:
        await connection.execute(
            text("CREATE TABLE funders (funder_id TEXT PRIMARY KEY)")
        )
        await connection.execute(
            text(
                "CREATE TABLE funding_opportunities ("
                "funding_opportunity_id TEXT PRIMARY KEY, funder_id TEXT NOT NULL)"
            )
        )

    try:
        yield async_sessionmaker(engine, expire_on_commit=False)
    finally:
        await engine.dispose()


async def _insert_references(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    funder_id: UUID,
    funding_opportunity_id: UUID | None = None,
) -> None:
    """Insert one funder and an optional owned funding opportunity."""
    async with session_factory() as session:
        await session.execute(
            text("INSERT INTO funders (funder_id) VALUES (:funder_id)").bindparams(
                bindparam("funder_id", type_=Uuid(as_uuid=True))
            ),
            {"funder_id": funder_id},
        )
        if funding_opportunity_id is not None:
            await session.execute(
                text(
                    "INSERT INTO funding_opportunities "
                    "(funding_opportunity_id, funder_id) "
                    "VALUES (:funding_opportunity_id, :funder_id)"
                ).bindparams(
                    bindparam("funding_opportunity_id", type_=Uuid(as_uuid=True)),
                    bindparam("funder_id", type_=Uuid(as_uuid=True)),
                ),
                {
                    "funding_opportunity_id": funding_opportunity_id,
                    "funder_id": funder_id,
                },
            )
        await session.commit()


async def test_validator_accepts_known_funder_and_owned_opportunity(
    reference_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    funder_id = uuid4()
    funding_opportunity_id = uuid4()
    await _insert_references(
        reference_session_factory,
        funder_id=funder_id,
        funding_opportunity_id=funding_opportunity_id,
    )

    validator = PostgresFundingReferenceValidator(reference_session_factory)
    await validator.validate(
        funder_id=funder_id,
        selected_funding_opportunity_id=funding_opportunity_id,
    )


async def test_validator_rejects_unknown_funder(
    reference_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    validator = PostgresFundingReferenceValidator(reference_session_factory)

    with pytest.raises(HTTPException) as exc_info:
        await validator.validate(
            funder_id=uuid4(),
            selected_funding_opportunity_id=None,
        )

    assert exc_info.value.status_code == 422
    assert exc_info.value.detail == "Unknown funder_id"


async def test_validator_rejects_unknown_funding_opportunity(
    reference_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    funder_id = uuid4()
    await _insert_references(
        reference_session_factory,
        funder_id=funder_id,
    )
    validator = PostgresFundingReferenceValidator(reference_session_factory)

    with pytest.raises(HTTPException) as exc_info:
        await validator.validate(
            funder_id=funder_id,
            selected_funding_opportunity_id=uuid4(),
        )

    assert exc_info.value.status_code == 422
    assert exc_info.value.detail == "Unknown selected_funding_opportunity_id"


async def test_validator_rejects_opportunity_owned_by_another_funder(
    reference_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    requested_funder_id = uuid4()
    opportunity_funder_id = uuid4()
    funding_opportunity_id = uuid4()
    await _insert_references(
        reference_session_factory,
        funder_id=requested_funder_id,
    )
    await _insert_references(
        reference_session_factory,
        funder_id=opportunity_funder_id,
        funding_opportunity_id=funding_opportunity_id,
    )
    validator = PostgresFundingReferenceValidator(reference_session_factory)

    with pytest.raises(HTTPException) as exc_info:
        await validator.validate(
            funder_id=requested_funder_id,
            selected_funding_opportunity_id=funding_opportunity_id,
        )

    assert exc_info.value.status_code == 422
    assert (
        exc_info.value.detail
        == "selected_funding_opportunity_id does not belong to funder_id"
    )
