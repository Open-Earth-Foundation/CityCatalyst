from __future__ import annotations

import copy
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from app.db.session import get_session_factory
from sqlalchemy import bindparam, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

logger = logging.getLogger(__name__)


class ConceptNoteCityContextRepositoryError(Exception):
    """Base repository error with a stable public code and HTTP status."""

    def __init__(self, code: str, status_code: int, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code


class ConceptNoteCityContextStorageUnavailable(
    ConceptNoteCityContextRepositoryError
):
    """Raised when the datateam-managed CNB storage cannot be reached."""

    def __init__(self) -> None:
        super().__init__(
            "cnb_storage_unavailable",
            503,
            "Concept Note context storage is not available",
        )


@dataclass(frozen=True)
class ConceptNoteRunContext:
    """Validated run binding and its current context bundle."""

    city_id: str
    context_bundle: dict[str, Any]


class ConceptNoteCityContextRepository(ABC):
    """Typed access boundary for datateam-managed CNB run and bundle tables."""

    @abstractmethod
    async def load_run_context(
        self,
        *,
        user_id: str,
        run_id: UUID,
        city_id: UUID,
    ) -> ConceptNoteRunContext:
        """Validate the run binding and return the current context bundle."""

    @abstractmethod
    async def merge_ghgi_context(
        self,
        *,
        user_id: str,
        run_id: UUID,
        city_id: UUID,
        ghgi_context: dict[str, Any],
    ) -> dict[str, Any]:
        """Atomically replace GHGI while preserving the current MEED snapshot."""


class SqlAlchemyConceptNoteCityContextRepository(
    ConceptNoteCityContextRepository
):
    """Repository adapter for the datateam-managed CNB PostgreSQL schema."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        self._session_factory = session_factory

    async def load_run_context(
        self,
        *,
        user_id: str,
        run_id: UUID,
        city_id: UUID,
    ) -> ConceptNoteRunContext:
        """Validate ownership and city binding, then load the current snapshot."""
        try:
            async with self._session_factory() as session:
                row = (
                    await session.execute(
                        text(
                            """
                            SELECT
                                runs.user_id,
                                runs.city_id,
                                bundles.context_bundle
                            FROM concept_note_runs AS runs
                            LEFT JOIN concept_note_context_bundles AS bundles
                                ON bundles.run_id = runs.run_id
                            WHERE runs.run_id = :run_id
                            """
                        ),
                        {"run_id": run_id},
                    )
                ).mappings().one_or_none()
        except SQLAlchemyError as exc:
            logger.exception("Failed to load CNB run context", exc_info=exc)
            raise ConceptNoteCityContextStorageUnavailable() from exc

        return validated_run_context(
            row=row,
            user_id=user_id,
            city_id=city_id,
        )

    async def merge_ghgi_context(
        self,
        *,
        user_id: str,
        run_id: UUID,
        city_id: UUID,
        ghgi_context: dict[str, Any],
    ) -> dict[str, Any]:
        """Lock the run and atomically persist the GHGI context update."""
        try:
            async with self._session_factory() as session, session.begin():
                run_row = (
                    await session.execute(
                        text(
                            """
                                SELECT user_id, city_id
                                FROM concept_note_runs
                                WHERE run_id = :run_id
                                FOR UPDATE
                                """
                        ),
                        {"run_id": run_id},
                    )
                ).mappings().one_or_none()
                validated_run_context(
                    row=run_row,
                    user_id=user_id,
                    city_id=city_id,
                )

                bundle_row = (
                    await session.execute(
                        text(
                            """
                                SELECT context_bundle
                                FROM concept_note_context_bundles
                                WHERE run_id = :run_id
                                FOR UPDATE
                                """
                        ),
                        {"run_id": run_id},
                    )
                ).mappings().one_or_none()
                current_bundle = (
                    bundle_row.get("context_bundle") if bundle_row else None
                )
                merged_bundle = merge_ghgi_into_bundle(
                    current_bundle=current_bundle,
                    ghgi_context=ghgi_context,
                )
                statement = text(
                    """
                        INSERT INTO concept_note_context_bundles (
                            run_id,
                            context_bundle,
                            created_at,
                            updated_at
                        )
                        VALUES (
                            :run_id,
                            :context_bundle,
                            CURRENT_TIMESTAMP,
                            CURRENT_TIMESTAMP
                        )
                        ON CONFLICT (run_id) DO UPDATE
                        SET
                            context_bundle = EXCLUDED.context_bundle,
                            updated_at = CURRENT_TIMESTAMP
                        """
                ).bindparams(
                    bindparam("context_bundle", type_=JSONB),
                )
                await session.execute(
                    statement,
                    {
                        "run_id": run_id,
                        "context_bundle": merged_bundle,
                    },
                )
        except ConceptNoteCityContextRepositoryError:
            raise
        except SQLAlchemyError as exc:
            logger.exception("Failed to persist CNB city context", exc_info=exc)
            raise ConceptNoteCityContextStorageUnavailable() from exc

        return merged_bundle


class UnavailableConceptNoteCityContextRepository(
    ConceptNoteCityContextRepository
):
    """Safe fallback when no CNB database session can be configured."""

    async def load_run_context(
        self,
        *,
        user_id: str,
        run_id: UUID,
        city_id: UUID,
    ) -> ConceptNoteRunContext:
        """Reject reads when the external CNB repository is unavailable."""
        raise ConceptNoteCityContextStorageUnavailable()

    async def merge_ghgi_context(
        self,
        *,
        user_id: str,
        run_id: UUID,
        city_id: UUID,
        ghgi_context: dict[str, Any],
    ) -> dict[str, Any]:
        """Reject writes when the external CNB repository is unavailable."""
        raise ConceptNoteCityContextStorageUnavailable()


def validated_run_context(
    *,
    row: Any,
    user_id: str,
    city_id: UUID,
) -> ConceptNoteRunContext:
    """Validate existence, ownership, city binding, and bundle shape."""
    if row is None:
        raise ConceptNoteCityContextRepositoryError(
            "concept_note_run_not_found",
            404,
            "Concept Note run was not found",
        )
    if str(row["user_id"]) != user_id:
        raise ConceptNoteCityContextRepositoryError(
            "concept_note_run_forbidden",
            403,
            "Concept Note run belongs to another user",
        )
    if str(row["city_id"]) != str(city_id):
        raise ConceptNoteCityContextRepositoryError(
            "run_city_mismatch",
            409,
            "Requested city does not match the Concept Note run",
        )

    context_bundle = row.get("context_bundle") or {}
    if not isinstance(context_bundle, dict):
        logger.error("CNB context bundle is not a JSON object")
        raise ConceptNoteCityContextStorageUnavailable()
    return ConceptNoteRunContext(
        city_id=str(row["city_id"]),
        context_bundle=context_bundle,
    )


def merge_ghgi_into_bundle(
    *,
    current_bundle: Any,
    ghgi_context: dict[str, Any],
) -> dict[str, Any]:
    """Replace GHGI while preserving MEED and unrelated bundle content."""
    if current_bundle is None:
        bundle: dict[str, Any] = {}
    elif isinstance(current_bundle, dict):
        bundle = copy.deepcopy(current_bundle)
    else:
        raise ConceptNoteCityContextStorageUnavailable()

    current_cc_context = bundle.get("cc_context")
    if current_cc_context is None:
        merged_cc_context: dict[str, Any] = {}
    elif isinstance(current_cc_context, dict):
        merged_cc_context = copy.deepcopy(current_cc_context)
    else:
        raise ConceptNoteCityContextStorageUnavailable()

    merged_cc_context["ghgi"] = copy.deepcopy(ghgi_context)
    bundle["cc_context"] = merged_cc_context
    return bundle


def get_concept_note_city_context_repository() -> ConceptNoteCityContextRepository:
    """Provide the configured datateam CNB repository adapter."""
    try:
        return SqlAlchemyConceptNoteCityContextRepository(get_session_factory())
    except Exception:
        logger.exception("CNB database session factory is unavailable")
        return UnavailableConceptNoteCityContextRepository()
