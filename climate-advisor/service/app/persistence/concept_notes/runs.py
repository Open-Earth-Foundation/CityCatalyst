from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.db.concept_note import ConceptNoteContextBundle, ConceptNoteRun
from app.models.db.thread import Thread


class ConceptNoteRunRepository:
    """Database access for Concept Note Builder run persistence."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the async database session used by repository operations."""
        self.session = session

    async def get_by_idempotency_key(
        self,
        *,
        user_id: str,
        idempotency_key: UUID,
    ) -> ConceptNoteRun | None:
        """Load an existing run for one user's idempotency key."""
        result = await self.session.execute(
            select(ConceptNoteRun).where(
                ConceptNoteRun.user_id == user_id,
                ConceptNoteRun.idempotency_key == idempotency_key,
            )
        )
        return result.scalar_one_or_none()

    async def thread_belongs_to_user(
        self,
        *,
        thread_id: UUID,
        user_id: str,
    ) -> bool:
        """Return whether the supplied chat thread currently belongs to the user."""
        result = await self.session.execute(
            select(Thread.thread_id).where(
                Thread.thread_id == thread_id,
                Thread.user_id == user_id,
            )
        )
        return result.scalar_one_or_none() is not None

    async def create_or_get(
        self,
        *,
        user_id: str,
        name: str,
        city_id: str,
        project_id: str | None,
        funder_id: UUID | None,
        selected_funding_opportunity_id: UUID | None,
        thread_id: UUID | None,
        idempotency_key: UUID,
        request_fingerprint: str,
        trace_id: str | None,
    ) -> tuple[ConceptNoteRun, bool]:
        """Create a run and empty bundle, or return a concurrent replay."""
        existing = await self.get_by_idempotency_key(
            user_id=user_id,
            idempotency_key=idempotency_key,
        )
        if existing is not None:
            return existing, False

        run = ConceptNoteRun(
            user_id=user_id,
            name=name,
            city_id=city_id,
            project_id=project_id,
            funder_id=funder_id,
            selected_funding_opportunity_id=selected_funding_opportunity_id,
            thread_id=thread_id,
            status="active",
            workflow_step="assembling_context",
            context_summary={},
            permission_summary={},
            trace_id=trace_id,
            idempotency_key=idempotency_key,
            request_fingerprint=request_fingerprint,
        )
        bundle = ConceptNoteContextBundle(run=run, context_bundle={})

        try:
            async with self.session.begin_nested():
                self.session.add_all([run, bundle])
                await self.session.flush()
            return run, True
        except IntegrityError:
            existing = await self.get_by_idempotency_key(
                user_id=user_id,
                idempotency_key=idempotency_key,
            )
            if existing is None:
                raise
            return existing, False

    async def get_for_user(
        self,
        *,
        run_id: UUID,
        user_id: str,
    ) -> ConceptNoteRun | None:
        """Load a run only when it belongs to the authenticated user."""
        result = await self.session.execute(
            select(ConceptNoteRun).where(
                ConceptNoteRun.run_id == run_id,
                ConceptNoteRun.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_for_user_city(
        self,
        *,
        user_id: str,
        city_id: str,
    ) -> list[ConceptNoteRun]:
        """Load a user's runs for one city in deterministic activity order."""
        query = (
            select(ConceptNoteRun)
            .where(
                ConceptNoteRun.user_id == user_id,
                ConceptNoteRun.city_id == city_id,
            )
            .order_by(
                ConceptNoteRun.updated_at.desc(),
                ConceptNoteRun.created_at.desc(),
                ConceptNoteRun.run_id.desc(),
            )
        )
        result = await self.session.execute(query)
        return list(result.scalars().all())
