"""Automatic PDF-first Concept Note context-bundle assembly."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID, uuid4

from app.config import Settings, get_settings
from app.db.session import get_session_factory
from app.models.cnb.context_bundle import SelectedSource
from app.persistence.concept_notes.context_bundle import (
    ContextBundleBuildSnapshot,
    begin_build,
    complete_build,
    fail_build,
    recover_stale_builds,
)
from app.persistence.concept_notes.markdown import ConceptNoteUploadSnapshot
from app.services.citycatalyst_client import CityCatalystClient, CityCatalystClientError
from app.services.cnb.source_analysis import (
    SourceAnalysisError,
    SourcePage,
    analyze_document,
    gather_all_or_raise,
    verify_source_artifact,
)
from app.services.concept_note_city_context import (
    ConceptNoteCityContextDataError,
    load_accessible_inventory,
    load_ghgi_context,
    load_hiap_context,
)
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

logger = logging.getLogger(__name__)
_BACKGROUND_BUILDS: set[asyncio.Task[bool]] = set()
CONTEXT_BUNDLE_RECONCILE_INTERVAL_SECONDS = 300
CONTEXT_BUNDLE_STALE_AFTER = timedelta(hours=1)


class ContextBundleService:
    """Coordinate immutable PDF analysis and optional CityCatalyst context."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        *,
        analyze_document_fn: Callable[..., Awaitable[SelectedSource]] = analyze_document,
        verify_source_artifact_fn: Callable[..., list[SourcePage]] = (
            verify_source_artifact
        ),
        cc_client_factory: Callable[[], CityCatalystClient] = CityCatalystClient,
    ) -> None:
        """Store dependencies so background resources are created inside the task."""
        self.session_factory = session_factory
        self.analyze_document_fn = analyze_document_fn
        self.verify_source_artifact_fn = verify_source_artifact_fn
        self.cc_client_factory = cc_client_factory

    async def begin(
        self,
        *,
        user_id: str,
        run_id: UUID,
        force: bool = False,
    ) -> ContextBundleBuildSnapshot:
        """Persist a new active build and snapshot the ready source set."""
        return await begin_build(
            session_factory=self.session_factory,
            user_id=user_id,
            run_id=run_id,
            build_id=uuid4(),
            force=force,
        )

    async def build(
        self,
        *,
        user_id: str,
        run_id: UUID,
        token: str,
        force: bool = False,
        snapshot: ContextBundleBuildSnapshot | None = None,
    ) -> bool:
        """Build every ready PDF and best-effort GHGI/HIAP context."""
        active = snapshot or await self.begin(
            user_id=user_id,
            run_id=run_id,
            force=force,
        )
        if active.already_current:
            return True
        if not active.uploads:
            await self._record_failure(
                user_id=user_id,
                snapshot=active,
                error_code="no_ready_city_pdf",
                warning="At least one successfully ingested city PDF is required.",
            )
            return False

        cc_client: CityCatalystClient | None = None
        try:
            cc_client = self.cc_client_factory()
            analysis_settings = get_settings()
            reader_limit = asyncio.Semaphore(
                analysis_settings.llm.generation.prompt_budget.cnb_sources.max_concurrency
            )
            selected_sources = await gather_all_or_raise(
                *(
                    self._analyze_upload(
                        upload=upload,
                        token=token,
                        cc_client=cc_client,
                        analysis_settings=analysis_settings,
                        reader_limit=reader_limit,
                    )
                    for upload in active.uploads
                )
            )
            ghgi, hiap, optional_statuses, warnings = await self._load_optional_context(
                user_id=user_id,
                city_id=UUID(active.city_id),
                token=token,
                cc_client=cc_client,
            )
            return await complete_build(
                session_factory=self.session_factory,
                user_id=user_id,
                run_id=run_id,
                build_id=active.build_id,
                selected_sources=list(selected_sources),
                ghgi=ghgi,
                hiap=hiap,
                optional_sources=optional_statuses,
                warnings=warnings,
            )
        except SourceAnalysisError as exc:
            await self._record_failure(
                user_id=user_id,
                snapshot=active,
                error_code=exc.code,
                warning="A ready city PDF could not be fully analyzed.",
            )
            return False
        except Exception:
            logger.exception(
                "Unexpected Concept Note context build failure run_id=%s build_id=%s",
                run_id,
                active.build_id,
            )
            await self._record_failure(
                user_id=user_id,
                snapshot=active,
                error_code="context_bundle_build_failed",
                warning="The context bundle could not be built.",
            )
            return False
        finally:
            if cc_client is not None:
                await cc_client.close()

    async def _analyze_upload(
        self,
        *,
        upload: ConceptNoteUploadSnapshot,
        token: str,
        cc_client: CityCatalystClient,
        analysis_settings: Settings,
        reader_limit: asyncio.Semaphore,
    ) -> SelectedSource:
        """Re-fetch, revalidate, and fully analyze one ready upload."""
        if (
            upload.markdown_s3_key is None
            or upload.markdown_sha256 is None
            or upload.page_count is None
        ):
            raise SourceAnalysisError(
                "incomplete_source_pointer",
                "Ready upload is missing immutable source metadata",
            )
        try:
            artifact = await cc_client.get_concept_note_markdown(
                upload_id=str(upload.upload_id),
                token=token,
            )
        except CityCatalystClientError as exc:
            raise SourceAnalysisError(
                "source_fetch_failed",
                "Ready upload could not be fetched from CityCatalyst",
            ) from exc
        pages = self.verify_source_artifact_fn(
            artifact=artifact,
            markdown_s3_key=upload.markdown_s3_key,
            sha256=upload.markdown_sha256,
            page_count=upload.page_count,
        )
        return await self.analyze_document_fn(
            upload_id=upload.upload_id,
            filename=upload.filename,
            source_label=upload.source_label,
            sha256=upload.markdown_sha256,
            pages=pages,
            settings=analysis_settings,
            reader_limit=reader_limit,
        )

    async def _load_optional_context(
        self,
        *,
        user_id: str,
        city_id: UUID,
        token: str,
        cc_client: CityCatalystClient,
    ) -> tuple[
        dict[str, Any] | None,
        dict[str, Any] | None,
        dict[str, str],
        list[str],
    ]:
        """Attempt GHGI and HIAP without allowing either to block readiness."""
        statuses = {"ghgi": "missing", "hiap": "missing"}
        warnings: list[str] = []
        try:
            inventory = await load_accessible_inventory(
                cc_client=cc_client,
                user_id=user_id,
                city_id=city_id,
                token=token,
            )
        except (CityCatalystClientError, ConceptNoteCityContextDataError):
            statuses = {"ghgi": "unavailable", "hiap": "unavailable"}
            return None, None, statuses, [
                "GHGI and HIAP context were unavailable; PDF context is ready."
            ]
        except Exception:
            logger.exception("Unexpected optional inventory lookup failure")
            statuses = {"ghgi": "unavailable", "hiap": "unavailable"}
            return None, None, statuses, [
                "GHGI and HIAP context were unavailable; PDF context is ready."
            ]

        ghgi_result, hiap_result = await asyncio.gather(
            self._try_load_ghgi(
                cc_client=cc_client,
                user_id=user_id,
                city_id=city_id,
                inventory=inventory,
                token=token,
            ),
            self._try_load_hiap(
                cc_client=cc_client,
                user_id=user_id,
                city_id=city_id,
                inventory=inventory,
                token=token,
            ),
        )
        ghgi, statuses["ghgi"], ghgi_warning = ghgi_result
        hiap, statuses["hiap"], hiap_warning = hiap_result
        warnings.extend(item for item in (ghgi_warning, hiap_warning) if item)
        return ghgi, hiap, statuses, warnings

    async def _try_load_ghgi(
        self,
        *,
        cc_client: CityCatalystClient,
        user_id: str,
        city_id: UUID,
        inventory: Any,
        token: str,
    ) -> tuple[dict[str, Any] | None, str, str | None]:
        """Return usable available or partial GHGI, otherwise an explicit null."""
        try:
            context = await load_ghgi_context(
                cc_client=cc_client,
                user_id=user_id,
                city_id=city_id,
                selected_inventory=inventory,
                token=token,
            )
        except (CityCatalystClientError, ConceptNoteCityContextDataError):
            return None, "unavailable", "GHGI context was unavailable."
        except Exception:
            logger.exception("Unexpected optional GHGI lookup failure")
            return None, "unavailable", "GHGI context was unavailable."
        if context.availability == "missing":
            return None, "missing", None
        return context.model_dump(mode="json"), context.availability, None

    async def _try_load_hiap(
        self,
        *,
        cc_client: CityCatalystClient,
        user_id: str,
        city_id: UUID,
        inventory: Any,
        token: str,
    ) -> tuple[dict[str, Any] | None, str, str | None]:
        """Return HIAP only when at least one persisted action is usable."""
        if inventory is None:
            return None, "missing", None
        try:
            context = await load_hiap_context(
                cc_client=cc_client,
                user_id=user_id,
                city_id=city_id,
                selected_inventory=inventory,
                language="en",
                token=token,
            )
        except (CityCatalystClientError, ConceptNoteCityContextDataError):
            return None, "unavailable", "HIAP context was unavailable."
        except Exception:
            logger.exception("Unexpected optional HIAP lookup failure")
            return None, "unavailable", "HIAP context was unavailable."
        actions = [*context.mitigation.actions, *context.adaptation.actions]
        if not actions:
            return None, context.availability, None
        return context.model_dump(mode="json"), context.availability, None

    async def _record_failure(
        self,
        *,
        user_id: str,
        snapshot: ContextBundleBuildSnapshot,
        error_code: str,
        warning: str,
    ) -> None:
        """Persist one guarded retryable failure without masking its cause."""
        await fail_build(
            session_factory=self.session_factory,
            user_id=user_id,
            run_id=snapshot.run_id,
            build_id=snapshot.build_id,
            error_code=error_code,
            warning=warning,
        )


def schedule_context_bundle_build(
    *,
    service: ContextBundleService,
    user_id: str,
    run_id: UUID,
    token: str,
    force: bool = False,
    snapshot: ContextBundleBuildSnapshot | None = None,
) -> None:
    """Retain an in-process background build until terminal completion."""

    task = asyncio.create_task(
        service.build(
            user_id=user_id,
            run_id=run_id,
            token=token,
            force=force,
            snapshot=snapshot,
        )
    )
    _BACKGROUND_BUILDS.add(task)

    def release(completed: asyncio.Task[bool]) -> None:
        _BACKGROUND_BUILDS.discard(completed)
        try:
            completed.result()
        except Exception:
            logger.exception("Concept Note background context build crashed")

    task.add_done_callback(release)


async def run_context_bundle_reconciler(
    *,
    interval_seconds: float = CONTEXT_BUNDLE_RECONCILE_INTERVAL_SECONDS,
    stale_after: timedelta = CONTEXT_BUNDLE_STALE_AFTER,
) -> None:
    """Periodically make interrupted context-bundle builds retryable."""
    while True:
        await asyncio.sleep(interval_seconds)
        try:
            recovered = await recover_stale_builds(
                session_factory=get_session_factory(),
                stale_before=datetime.now(timezone.utc) - stale_after,
            )
            if recovered:
                logger.warning(
                    "Recovered %s interrupted Concept Note context-bundle builds",
                    recovered,
                )
        except Exception:
            logger.exception("Concept Note context-bundle reconciliation failed")


def get_context_bundle_service() -> ContextBundleService | None:
    """Provide a build service, or a safe unavailable marker without a database."""
    try:
        return ContextBundleService(
            get_session_factory(),
        )
    except Exception:
        logger.exception("Concept Note context-bundle storage is unavailable")
        return None
