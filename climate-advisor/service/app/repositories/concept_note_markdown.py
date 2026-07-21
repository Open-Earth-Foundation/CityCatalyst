from __future__ import annotations

from abc import ABC, abstractmethod
from uuid import UUID

from app.models.concept_note_markdown import ConceptNoteMarkdownRequest


class ConceptNoteMarkdownRepositoryError(Exception):
    """Base error with a stable public code and HTTP status."""

    def __init__(self, code: str, status_code: int, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code


class ConceptNoteStorageUnavailable(ConceptNoteMarkdownRepositoryError):
    """Raised until the external datateam storage adapter is configured."""

    def __init__(self) -> None:
        super().__init__(
            "cnb_storage_unavailable",
            503,
            "Concept Note Markdown storage is not configured",
        )


class ConceptNoteMarkdownRepository(ABC):
    """Atomic registration boundary owned by the future datateam adapter."""

    @abstractmethod
    async def register_markdown(
        self,
        *,
        user_id: str,
        run_id: UUID,
        upload_id: UUID,
        payload: ConceptNoteMarkdownRequest,
    ) -> None:
        """Validate ownership/binding/idempotency and durably register Markdown."""


class UnavailableConceptNoteMarkdownRepository(ConceptNoteMarkdownRepository):
    """Safe production default while no authoritative adapter exists."""

    async def register_markdown(
        self,
        *,
        user_id: str,
        run_id: UUID,
        upload_id: UUID,
        payload: ConceptNoteMarkdownRequest,
    ) -> None:
        """Reject registration without creating local CA persistence."""
        raise ConceptNoteStorageUnavailable()


def get_concept_note_markdown_repository() -> ConceptNoteMarkdownRepository:
    """Provide the production repository implementation."""
    return UnavailableConceptNoteMarkdownRepository()
