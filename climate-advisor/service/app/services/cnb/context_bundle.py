"""Automatic Concept Note context-bundle assembly."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable, Mapping
from contextvars import Context
from datetime import datetime, timedelta, timezone
from typing import Any, Literal
from uuid import UUID, uuid4

from app.db.session import get_session_factory
from app.models.cnb.context_bundle import (
    SelectedSource,
    SourceDocumentText,
    SourceTextContext,
)
from app.persistence.concept_notes.context_bundle import (
    ContextBundleBuildSnapshot,
    ContextBundlePersistenceError,
    begin_build,
    complete_build,
    fail_build,
    load_refresh_state,
    load_source_revalidation_inputs,
    recover_stale_builds,
    set_selected_inventory,
)
from app.persistence.concept_notes.markdown import ConceptNoteUploadSnapshot
from app.persistence.concept_notes.source_revalidation import (
    claim_source_revalidation,
    finish_source_revalidation,
    list_pending_source_revalidations,
    recover_stale_source_revalidations,
)
from app.services.citycatalyst_client import CityCatalystClient, CityCatalystClientError
from app.services.cnb.chapter_drafting import ConceptNoteChapterDraftService
from app.services.cnb.source_impact_review import RevalidationSource
from app.services.cnb.source_analysis import (
    SourceAnalysisError,
    SourceUnit,
    analyze_document,
    gather_all_or_raise,
    render_source_text,
    source_analysis_contract_version,
    verify_source_artifact,
)
from app.services.concept_note_city_context import (
    ConceptNoteCityContextDataError,
    inventory_candidate,
    inventory_uuid,
    load_accessible_inventory,
    load_city_profile,
    load_ghgi_context,
    load_hiap_context,
)
from app.utils.conversation_observability import finish_workflow_trace, workflow_trace
from app.utils.prompt_budget import count_prompt_tokens
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)
_BACKGROUND_BUILDS: set[asyncio.Task[bool]] = set()
_BACKGROUND_REVALIDATIONS: set[asyncio.Task[bool]] = set()
CONTEXT_BUNDLE_RECONCILE_INTERVAL_SECONDS = 300
CONTEXT_BUNDLE_STALE_AFTER = timedelta(hours=1)


class ContextBundleService:
    """Coordinate source analysis and optional CityCatalyst context."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        *,
        analyze_document_fn: Callable[
            ..., Awaitable[SelectedSource]
        ] = analyze_document,
        verify_source_artifact_fn: Callable[..., list[SourceUnit]] = (
            verify_source_artifact
        ),
        cc_client_factory: Callable[[], CityCatalystClient] = CityCatalystClient,
        revalidate_fn: Callable[..., Awaitable[bool]] | None = None,
    ) -> None:
        """Store dependencies so background resources are created inside the task.

        ``revalidate_fn`` redrafts chapters affected by new sources and returns
        whether the pass succeeded; without it no revalidation job is queued.
        """
        self.session_factory = session_factory
        self.analyze_document_fn = analyze_document_fn
        self.verify_source_artifact_fn = verify_source_artifact_fn
        self.cc_client_factory = cc_client_factory
        self.revalidate_fn = revalidate_fn

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
        """Build a usable bundle with or without uploaded document evidence."""
        active = snapshot or await self.begin(
            user_id=user_id,
            run_id=run_id,
            force=force,
        )
        if active.already_current:
            return True

        with workflow_trace(
            name="cnb_source_analysis",
            inputs={"run_id": str(run_id), "build_id": str(active.build_id)},
            session_id=active.thread_id or run_id,
            user_id=user_id,
            attributes={
                "workflow": "CNB",
                "interaction": "source_analysis",
                "concept_note_run_id": str(run_id),
            },
        ) as span:
            cc_client: CityCatalystClient | None = None
            try:
                cc_client = self.cc_client_factory()
                selected_sources: list[SelectedSource] = []
                uploads_to_analyze: list[ConceptNoteUploadSnapshot] = []
                new_sources: list[RevalidationSource] = []
                source_text: SourceTextContext | None = None

                # Reuse unchanged source analyses and run the LLM only for new inputs.
                if active.uploads:
                    analysis_settings = get_settings()
                    contract_version = source_analysis_contract_version(
                        analysis_settings
                    )
                    reader_limit = asyncio.Semaphore(
                        analysis_settings.llm.generation.prompt_budget.cnb_sources.max_concurrency
                    )
                    previous_by_upload = {
                        source.upload_id: source for source in active.previous_sources
                    }
                    selected_by_upload: dict[UUID, SelectedSource] = {}
                    for upload in active.uploads:
                        previous = previous_by_upload.get(upload.upload_id)
                        if previous is not None and _can_reuse_source_analysis(
                            upload,
                            previous,
                            contract_version,
                        ):
                            selected_by_upload[upload.upload_id] = previous
                        else:
                            uploads_to_analyze.append(upload)

                    if uploads_to_analyze:
                        new_sources = await gather_all_or_raise(
                            *(
                                self._analyze_upload(
                                    upload=upload,
                                    token=token,
                                    cc_client=cc_client,
                                    analysis_settings=analysis_settings,
                                    reader_limit=reader_limit,
                                    contract_version=contract_version,
                                )
                                for upload in uploads_to_analyze
                            )
                        )
                        selected_by_upload.update(
                            {item.source.upload_id: item.source for item in new_sources}
                        )
                    selected_sources = [
                        selected_by_upload[upload.upload_id]
                        for upload in active.uploads
                    ]
                    source_text = await self._build_source_text(
                        uploads=active.uploads,
                        analyzed_units={
                            item.source.upload_id: item.units for item in new_sources
                        },
                        token=token,
                        cc_client=cc_client,
                        settings=analysis_settings,
                    )

                # Enrich every run with best-effort CityCatalyst context.
                (
                    (ghgi, hiap, optional_statuses, warnings, candidate),
                    (city, city_status, city_warning),
                ) = await asyncio.gather(
                    self._load_optional_context(
                        user_id=user_id,
                        city_id=UUID(active.city_id),
                        token=token,
                        cc_client=cc_client,
                        selected_inventory_id=active.selected_inventory_id,
                    ),
                    self._try_load_city(
                        cc_client=cc_client,
                        user_id=user_id,
                        city_id=UUID(active.city_id),
                        token=token,
                    ),
                )
                optional_statuses = {"city": city_status, **optional_statuses}
                if city_warning:
                    warnings.insert(0, city_warning)
                if not active.uploads:
                    warnings.insert(
                        0,
                        "No source document is attached; responses use limited context until a source is added.",
                    )

                # A bundle without uploads is ready and can be rebuilt after an upload.
                completed = await complete_build(
                    session_factory=self.session_factory,
                    user_id=user_id,
                    run_id=run_id,
                    build_id=active.build_id,
                    selected_sources=list(selected_sources),
                    source_text=source_text,
                    city=city,
                    ghgi=ghgi,
                    hiap=hiap,
                    optional_sources=optional_statuses,
                    warnings=warnings,
                    revalidation_upload_ids=(
                        [item.source.upload_id for item in new_sources]
                        if self.revalidate_fn is not None
                        else None
                    ),
                    inventory_candidate=candidate,
                )
                # Start the persisted job now, reusing the verified source text.
                if completed and new_sources and self.revalidate_fn is not None:
                    schedule_source_revalidation(
                        service=self,
                        run_id=run_id,
                        preloaded={item.source.upload_id: item for item in new_sources},
                    )
                finish_workflow_trace(span, {"completed": completed}, ok=completed)
                return completed
            except SourceAnalysisError as exc:
                # Record only safe diagnostics, never document text or provider payloads.
                logger.warning(
                    "Concept Note source analysis failed run_id=%s build_id=%s code=%s reason=%s details=%s",
                    run_id,
                    active.build_id,
                    exc.code,
                    exc.reason,
                    exc.details,
                )
                await self._record_failure(
                    user_id=user_id,
                    snapshot=active,
                    error_code=exc.code,
                    warning="A ready city source could not be fully analyzed.",
                    error_reason=exc.reason,
                    error_details=exc.details,
                )
                finish_workflow_trace(span, {"completed": False}, ok=False)
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
                finish_workflow_trace(span, {"completed": False}, ok=False)
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
        contract_version: str,
    ) -> RevalidationSource:
        """Re-fetch, revalidate, and fully analyze one ready upload."""
        source_units = await self._load_source_units(
            upload=upload,
            token=token,
            cc_client=cc_client,
        )
        # Analyze only the verified source units under the shared reader limit.
        analysis = await self.analyze_document_fn(
            upload_id=upload.upload_id,
            filename=upload.filename,
            source_label=upload.source_label,
            sha256=upload.markdown_sha256,
            source_format=upload.source_format,
            pages=source_units,
            settings=analysis_settings,
            reader_limit=reader_limit,
        )
        return RevalidationSource(
            source=analysis.model_copy(
                update={"analysis_contract_version": contract_version}
            ),
            units=source_units,
        )

    async def run_source_revalidation(
        self,
        *,
        run_id: UUID,
        preloaded: dict[UUID, RevalidationSource] | None = None,
    ) -> bool:
        """Claim and run one persisted chapter-revalidation job.

        ``preloaded`` holds verified source text from the build that queued the
        job; any other queued upload is re-fetched with a service-minted token
        for the run owner. The lease is always released, and a failed pass
        stays queued for the reconciler to retry.
        """
        if self.revalidate_fn is None:
            return False
        claim = await claim_source_revalidation(
            session_factory=self.session_factory,
            run_id=run_id,
        )
        if claim is None:
            return False

        succeeded = False
        cc_client: CityCatalystClient | None = None
        try:
            # Reuse this build's verified text; re-fetch uploads it did not cover.
            preloaded = preloaded or {}
            sources = [
                preloaded[upload_id]
                for upload_id in claim.upload_ids
                if upload_id in preloaded
            ]
            missing = [
                upload_id
                for upload_id in claim.upload_ids
                if upload_id not in preloaded
            ]
            if missing:
                inputs = await load_source_revalidation_inputs(
                    session_factory=self.session_factory,
                    run_id=run_id,
                    upload_ids=missing,
                )
                if inputs:
                    cc_client = self.cc_client_factory()
                    token, _ = await cc_client.refresh_token(claim.user_id)
                    for upload, source in inputs:
                        units = await self._load_source_units(
                            upload=upload,
                            token=token,
                            cc_client=cc_client,
                        )
                        sources.append(RevalidationSource(source=source, units=units))

            # Uploads removed since queueing leave nothing to revalidate.
            succeeded = (
                await self.revalidate_fn(
                    run_id=run_id,
                    user_id=claim.user_id,
                    new_sources=sources,
                )
                if sources
                else True
            )
        except Exception:
            logger.exception(
                "Concept Note source revalidation job failed run_id=%s", run_id
            )
        finally:
            if cc_client is not None:
                await cc_client.close()
            # A failed release leaves the lease for stale-job recovery.
            try:
                await finish_source_revalidation(
                    session_factory=self.session_factory,
                    run_id=run_id,
                    upload_ids=claim.upload_ids,
                    succeeded=succeeded,
                )
            except Exception:
                logger.exception(
                    "Failed to release Concept Note source revalidation run_id=%s",
                    run_id,
                )
        return succeeded

    async def _load_source_units(
        self,
        *,
        upload: ConceptNoteUploadSnapshot,
        token: str,
        cc_client: CityCatalystClient,
    ) -> list[SourceUnit]:
        """Fetch one ready upload through CC and verify its immutable identity."""
        # Require the immutable metadata needed for the declared source format.
        if (
            upload.markdown_s3_key is None
            or upload.markdown_sha256 is None
            or (upload.source_format == "pdf" and upload.page_count is None)
        ):
            raise SourceAnalysisError(
                "incomplete_source_pointer",
                "Ready upload is missing immutable source metadata",
            )
        # Read through CC, then verify identity before any use of the text.
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
        return self.verify_source_artifact_fn(
            artifact=artifact,
            markdown_s3_key=upload.markdown_s3_key,
            sha256=upload.markdown_sha256,
            source_format=upload.source_format,
            page_count=upload.page_count,
        )

    async def _build_source_text(
        self,
        *,
        uploads: list[ConceptNoteUploadSnapshot],
        analyzed_units: dict[UUID, list[SourceUnit]],
        token: str,
        cc_client: CityCatalystClient,
        settings: Settings,
    ) -> SourceTextContext:
        """Keep complete source text for agents only while it fits the budget."""
        budget = settings.llm.generation.prompt_budget
        max_tokens = budget.cnb_sources.full_text_max_tokens
        try:
            # Reused analyses need their verified text fetched again; no LLM runs.
            units_by_upload = dict(analyzed_units)
            missing = [u for u in uploads if u.upload_id not in units_by_upload]
            fetched = await gather_all_or_raise(
                *(
                    self._load_source_units(
                        upload=upload, token=token, cc_client=cc_client
                    )
                    for upload in missing
                )
            )
            units_by_upload.update(
                {
                    upload.upload_id: units
                    for upload, units in zip(missing, fetched, strict=True)
                }
            )
        except SourceAnalysisError as exc:
            # Summaries stay usable, so a text fetch failure only drops full text.
            logger.warning(
                "Concept Note source text unavailable; using summaries code=%s",
                exc.code,
            )
            return SourceTextContext(mode="summary", token_count=0, max_tokens=max_tokens)

        documents = [
            SourceDocumentText(
                upload_id=upload.upload_id,
                source_label=upload.source_label or upload.filename,
                filename=upload.filename,
                source_format=upload.source_format,
                text=render_source_text(units_by_upload[upload.upload_id]),
            )
            for upload in uploads
        ]
        token_count = count_prompt_tokens(
            [document.text for document in documents],
            model=settings.llm.models.cnb_chapter_drafter.name,
            fallback_encoding=budget.tokenizer_encoding,
        ).tokens
        full_text = token_count <= max_tokens
        logger.info(
            "Concept Note source text mode=%s tokens=%s max_tokens=%s sources=%s",
            "full_text" if full_text else "summary",
            token_count,
            max_tokens,
            len(documents),
        )
        return SourceTextContext(
            mode="full_text" if full_text else "summary",
            token_count=token_count,
            max_tokens=max_tokens,
            documents=documents if full_text else [],
        )

    async def _load_optional_context(
        self,
        *,
        user_id: str,
        city_id: UUID,
        token: str,
        cc_client: CityCatalystClient,
        selected_inventory_id: UUID | None = None,
    ) -> tuple[
        dict[str, Any] | None,
        dict[str, Any] | None,
        dict[str, str],
        list[str],
        dict[str, Any] | None,
    ]:
        """Attempt GHGI and HIAP without allowing either to block readiness.

        Also returns the checked inventory version, or ``None`` when the lookup
        failed, so the next workspace open retries it.
        """
        statuses = {"ghgi": "missing", "hiap": "missing"}
        warnings: list[str] = []
        unavailable = ["GHGI and HIAP context were unavailable."]
        try:
            inventory = await load_accessible_inventory(
                cc_client=cc_client,
                user_id=user_id,
                city_id=city_id,
                token=token,
                inventory_id=selected_inventory_id,
            )
            candidate = inventory_candidate(inventory)
        except (CityCatalystClientError, ConceptNoteCityContextDataError):
            statuses = {"ghgi": "unavailable", "hiap": "unavailable"}
            return None, None, statuses, unavailable, None
        except Exception:
            logger.exception("Unexpected optional inventory lookup failure")
            statuses = {"ghgi": "unavailable", "hiap": "unavailable"}
            return None, None, statuses, unavailable, None
        if (
            selected_inventory_id is not None
            and inventory is not None
            and inventory_uuid(inventory) != selected_inventory_id
        ):
            warnings.append(
                "The chosen inventory is no longer available; the newest was used."
            )

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
        return ghgi, hiap, statuses, warnings, candidate

    async def refresh_if_stale(
        self,
        *,
        user_id: str,
        run_id: UUID,
        token: str,
    ) -> Literal["queued", "current", "building"]:
        """Rebuild a ready bundle only when its inventory changed in the city.

        Called once per workspace open, so it compares cheap inventory list
        metadata instead of reloading GHGI and HIAP.
        """
        state = await load_refresh_state(
            session_factory=self.session_factory,
            user_id=user_id,
            run_id=run_id,
        )
        if state.status == "building":
            return "building"
        # Failed builds recover through retry, and drafting reads the context
        # mid-run; the next open checks again.
        if state.status != "ready" or state.draft_running:
            return "current"
        try:
            candidate = inventory_candidate(
                await self._load_inventory(
                    user_id, state.city_id, token, state.selected_inventory_id
                )
            )
        except (CityCatalystClientError, ConceptNoteCityContextDataError):
            return "current"
        if candidate == state.inventory_candidate:
            return "current"
        await self._queue_rebuild(user_id=user_id, run_id=run_id, token=token)
        return "queued"

    async def select_inventory(
        self,
        *,
        user_id: str,
        run_id: UUID,
        token: str,
        inventory_id: UUID | None,
    ) -> None:
        """Save the run's inventory choice after checking access, then rebuild."""
        state = await load_refresh_state(
            session_factory=self.session_factory,
            user_id=user_id,
            run_id=run_id,
        )
        if inventory_id is not None:
            try:
                inventory = await self._load_inventory(
                    user_id, state.city_id, token, inventory_id
                )
            except (CityCatalystClientError, ConceptNoteCityContextDataError) as exc:
                raise ContextBundlePersistenceError(
                    "cc_inventory_unavailable",
                    503,
                    "City inventories are temporarily unavailable",
                ) from exc
            if inventory is None or inventory_uuid(inventory) != inventory_id:
                raise ContextBundlePersistenceError(
                    "inventory_not_accessible",
                    404,
                    "The inventory is not available for this city",
                )
        await set_selected_inventory(
            session_factory=self.session_factory,
            user_id=user_id,
            run_id=run_id,
            inventory_id=inventory_id,
        )
        await self._queue_rebuild(user_id=user_id, run_id=run_id, token=token)

    async def _load_inventory(
        self, user_id: str, city_id: str, token: str, inventory_id: UUID | None
    ) -> Mapping[str, Any] | None:
        """Load the chosen, else newest, inventory the user can access."""
        cc_client = self.cc_client_factory()
        try:
            return await load_accessible_inventory(
                cc_client=cc_client,
                user_id=user_id,
                city_id=UUID(city_id),
                token=token,
                inventory_id=inventory_id,
            )
        finally:
            await cc_client.close()

    async def _queue_rebuild(self, *, user_id: str, run_id: UUID, token: str) -> None:
        """Start a forced background rebuild that reuses unchanged analyses."""
        snapshot = await self.begin(user_id=user_id, run_id=run_id, force=True)
        schedule_context_bundle_build(
            service=self,
            user_id=user_id,
            run_id=run_id,
            token=token,
            force=True,
            snapshot=snapshot,
        )

    async def _try_load_city(
        self,
        *,
        cc_client: CityCatalystClient,
        user_id: str,
        city_id: UUID,
        token: str,
    ) -> tuple[dict[str, Any] | None, str, str | None]:
        """Return the city profile, or an explicit null that does not block readiness."""
        try:
            profile = await load_city_profile(
                cc_client=cc_client,
                user_id=user_id,
                city_id=city_id,
                token=token,
            )
        except (CityCatalystClientError, ConceptNoteCityContextDataError):
            return None, "unavailable", "City profile was unavailable."
        except Exception:
            logger.exception("Unexpected optional city profile lookup failure")
            return None, "unavailable", "City profile was unavailable."
        return profile, "available", None

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
        error_reason: str | None = None,
        error_details: dict[str, int] | None = None,
    ) -> None:
        """Persist one guarded retryable failure without masking its cause."""
        await fail_build(
            session_factory=self.session_factory,
            user_id=user_id,
            run_id=snapshot.run_id,
            build_id=snapshot.build_id,
            error_code=error_code,
            warning=warning,
            error_reason=error_reason,
            error_details=error_details,
        )


def _can_reuse_source_analysis(
    upload: ConceptNoteUploadSnapshot,
    previous: SelectedSource,
    contract_version: str,
) -> bool:
    """Return whether a persisted analysis matches this immutable source input."""
    return (
        upload.markdown_sha256 is not None
        and previous.upload_id == upload.upload_id
        and previous.sha256 == upload.markdown_sha256
        and previous.source_format == upload.source_format
        and previous.filename == upload.filename
        and previous.source_label == (upload.source_label or upload.filename)
        and previous.analysis_contract_version == contract_version
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
        ),
        context=Context(),
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
        try:
            await resume_source_revalidations(
                session_factory=get_session_factory(),
                stale_before=datetime.now(timezone.utc) - stale_after,
            )
        except Exception:
            logger.exception("Concept Note source-revalidation reconciliation failed")


async def resume_source_revalidations(
    *,
    session_factory: async_sessionmaker[AsyncSession],
    stale_before: datetime,
) -> int:
    """Release stale revalidation leases and schedule every pending job."""
    recovered = await recover_stale_source_revalidations(
        session_factory=session_factory,
        stale_before=stale_before,
    )
    if recovered:
        logger.warning(
            "Recovered %s interrupted Concept Note source revalidations", recovered
        )
    pending = await list_pending_source_revalidations(session_factory=session_factory)
    service = get_context_bundle_service() if pending else None
    if service is None:
        return 0
    for run_id in pending:
        schedule_source_revalidation(service=service, run_id=run_id)
    return len(pending)


def get_context_bundle_service() -> ContextBundleService | None:
    """Provide a build service, or a safe unavailable marker without a database."""
    try:
        return ContextBundleService(
            get_session_factory(),
            revalidate_fn=_revalidate_with_chapter_service,
        )
    except Exception:
        logger.exception("Concept Note context-bundle storage is unavailable")
        return None


def schedule_source_revalidation(
    *,
    service: ContextBundleService,
    run_id: UUID,
    preloaded: dict[UUID, RevalidationSource] | None = None,
) -> None:
    """Retain one background revalidation job until it terminates."""
    task = asyncio.create_task(
        service.run_source_revalidation(run_id=run_id, preloaded=preloaded),
        context=Context(),
    )
    _BACKGROUND_REVALIDATIONS.add(task)

    def release(completed: asyncio.Task[bool]) -> None:
        _BACKGROUND_REVALIDATIONS.discard(completed)
        try:
            completed.result()
        except Exception:
            logger.exception("Concept Note background source revalidation crashed")

    task.add_done_callback(release)


async def _revalidate_with_chapter_service(
    *,
    run_id: UUID,
    user_id: str,
    new_sources: list[RevalidationSource],
) -> bool:
    """Run source-impact revalidation with production database dependencies."""
    return await ConceptNoteChapterDraftService(
        get_session_factory()
    ).revalidate_after_new_sources(
        run_id=run_id,
        user_id=user_id,
        new_sources=new_sources,
    )
