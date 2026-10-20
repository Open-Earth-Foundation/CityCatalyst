"""Add a funder, programme and template to the CNB catalogue, or give one note
its own application template.

A run can read one uploaded document into a reviewable draft, or accept values
typed by hand. Nothing is saved until the user confirms. The pending import
lives in the run's context bundle under ``funder_import``; its ``kind`` says
whether it reads a funder or only a template. Confirmed funders become ordinary
``funders``, ``funding_opportunities`` and ``funder_templates`` rows, with
per-field provenance in the existing ``source_documents`` and
``funding_evidence`` tables. A confirmed own template is stored on the run
(``concept_note_runs.custom_template``) by the funding-selection save.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from contextlib import suppress
from contextvars import Context
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from functools import partial
from typing import Any
from uuid import UUID, uuid4

from app.db.cnb_reference import get_cnb_reference_session_factory
from app.db.session import get_session_factory
from app.models.cnb.concept_note_markdown import source_format_from_filename
from app.models.cnb.funding_catalogue import MANUAL_SOURCE_PREFIX, UPLOAD_SOURCE_PREFIX
from app.models.cnb.concept_note_application_context import FundingAddedFrom
from app.models.cnb.funder_creation import (
    CustomTemplateRequest,
    FunderCreateRequest,
    FunderCreateResponse,
    FunderImport,
    FunderImportDraft,
    FunderImportKind,
    StoredCustomTemplate,
)
from app.models.db.cnb_reference import (
    CnbFunder,
    CnbFunderTemplate,
    CnbFundingEvidence,
    CnbFundingOpportunity,
    CnbSourceDocument,
)
from app.models.db.concept_note import (
    ConceptNoteContextBundle,
    ConceptNoteRun,
    ConceptNoteUpload,
)
from app.services.citycatalyst_client import CityCatalystClient, CityCatalystClientError
from app.services.cnb.source_analysis import SourceAnalysisError, verify_source_artifact
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from app.services.cnb.funder_document import FunderImportError, extract_funder_draft
from app.services.cnb.funder_fields import (
    field_values,
    has_value,
    json_value,
    normalize_chapters,
    template_required_fields,
)

logger = logging.getLogger(__name__)

IMPORT_BUNDLE_KEY = "funder_import"
# The import waits for the upload to finish converting before reading it.
UPLOAD_POLL_SECONDS = 2.0
UPLOAD_WAIT = timedelta(minutes=10)
# A lost worker becomes retryable without expiring a healthy, slow extraction.
IMPORT_HEARTBEAT_SECONDS = 30.0
STALE_IMPORT_AFTER = timedelta(minutes=2)
_BACKGROUND_IMPORTS: set[asyncio.Task[None]] = set()

ExtractDraft = Callable[..., Awaitable[FunderImportDraft]]


def api_error(code: str, message: str, status_code: int = 409) -> HTTPException:
    """Return a machine-readable error the browser can map to copy."""
    return HTTPException(
        status_code=status_code, detail={"code": code, "message": message}
    )


# --- Import lifecycle -------------------------------------------------------


async def load_funder_import(
    session: AsyncSession, run: ConceptNoteRun
) -> FunderImport | None:
    """Return the run's pending import; an abandoned job is reported as failed."""
    bundle = await session.get(
        ConceptNoteContextBundle, run.run_id, populate_existing=True
    )
    current = _import_from_bundle(bundle)
    if current is None or current.status != "processing":
        return current
    if datetime.now(UTC) - current.updated_at > STALE_IMPORT_AFTER:
        return current.model_copy(
            update={"status": "failed", "error_code": "extraction_interrupted"}
        )
    upload = await session.get(ConceptNoteUpload, current.upload_id)
    converting = upload is not None and upload.ingest_status != "ready"
    return current.model_copy(update={"stage": "converting" if converting else "reading"})


async def start_funder_import(
    session: AsyncSession,
    run: ConceptNoteRun,
    *,
    upload_id: UUID,
    token: str,
    kind: FunderImportKind = "funder",
) -> FunderImport:
    """Record a new import for a run upload and read it in the background.

    The upload may still be converting; the background job waits for it.
    Starting again on the same upload is how a failed import is retried.
    """
    upload = await session.get(ConceptNoteUpload, upload_id)
    if upload is None or upload.run_id != run.run_id:
        raise api_error("upload_not_found", "The uploaded file was not found.", 404)
    # Serialize starts before reading the current import, including runs whose
    # context bundle has not been created yet. Bundle writes take their own lock.
    await session.get(ConceptNoteRun, run.run_id, with_for_update=True)
    current = await load_funder_import(session, run)
    if current is not None and current.status == "processing":
        raise api_error("funder_import_running", "A document is already being read.")
    if current is not None and current.status == "ready":
        raise api_error(
            "funder_import_pending",
            "Review or discard the ready document draft before reading another file.",
        )

    # Replace a failure; a new id makes late results no-ops.
    now = datetime.now(UTC)
    funder_import = FunderImport(
        import_id=uuid4(),
        upload_id=upload.upload_id,
        filename=upload.filename,
        kind=kind,
        status="processing",
        created_at=now,
        updated_at=now,
    )
    await _write_import(session, run.run_id, funder_import)
    await session.commit()
    logger.info(
        "Started CNB funder import run_id=%s import_id=%s upload_id=%s kind=%s",
        run.run_id,
        funder_import.import_id,
        upload_id,
        kind,
    )
    schedule_funder_import(
        run_id=run.run_id, import_id=funder_import.import_id, token=token
    )
    return funder_import


async def discard_funder_import(
    session: AsyncSession, run: ConceptNoteRun, *, import_id: UUID
) -> None:
    """Forget only the observed import; preserve a concurrent replacement."""
    bundle = await _locked_bundle(session, run.run_id)
    if bundle is not None:
        clear_import(bundle, import_id)
    await session.commit()
    logger.info(
        "Discarded CNB funder import run_id=%s import_id=%s", run.run_id, import_id
    )


def schedule_funder_import(*, run_id: UUID, import_id: UUID, token: str) -> None:
    """Retain an in-process extraction task until it finishes."""
    task = asyncio.create_task(
        run_funder_import(run_id=run_id, import_id=import_id, token=token),
        context=Context(),
    )
    _BACKGROUND_IMPORTS.add(task)

    def release(completed: asyncio.Task[None]) -> None:
        """Drop the finished task and log a crash the job did not handle."""
        _BACKGROUND_IMPORTS.discard(completed)
        if completed.cancelled():
            return
        try:
            completed.result()
        except Exception:
            logger.exception("CNB funder import task crashed run_id=%s", run_id)

    task.add_done_callback(release)


async def run_funder_import(
    *,
    run_id: UUID,
    import_id: UUID,
    token: str,
    session_factory: async_sessionmaker[AsyncSession] | None = None,
    cc_client_factory: Callable[[], CityCatalystClient] = CityCatalystClient,
    extract: ExtractDraft | None = None,
) -> None:
    """Wait for, fetch, verify and read one upload, then store a draft or failure."""
    factory = session_factory or get_session_factory()
    cc_client: CityCatalystClient | None = None
    draft: FunderImportDraft | None = None
    error_code: str | None = None
    heartbeat = asyncio.create_task(_heartbeat_import(factory, run_id, import_id))
    try:
        # Step 1: wait until the upload on the still-current import is converted.
        converted = await _converted_upload(factory, run_id, import_id)
        if converted is None:
            return
        current, upload = converted
        read = extract or partial(extract_funder_draft, kind=current.kind)

        # Step 2: read the verified text and extract the catalogue record.
        source_format = source_format_from_filename(upload.filename)
        cc_client = cc_client_factory()
        artifact = await cc_client.get_concept_note_markdown(
            upload_id=str(upload.upload_id), token=token
        )
        units = verify_source_artifact(
            artifact=artifact,
            markdown_s3_key=upload.markdown_s3_key,
            sha256=upload.markdown_sha256,
            source_format=source_format,
            page_count=upload.page_count,
        )
        draft = await read(units, filename=upload.filename, source_format=source_format)
    except CityCatalystClientError:
        logger.warning("Funder document fetch failed run_id=%s", run_id)
        error_code = "source_fetch_failed"
    except (FunderImportError, SourceAnalysisError) as exc:
        logger.warning(
            "Funder document extraction failed run_id=%s code=%s", run_id, exc.code
        )
        error_code = exc.code
    except Exception:
        logger.exception("Unexpected funder extraction failure run_id=%s", run_id)
        error_code = "extraction_failed"
    finally:
        heartbeat.cancel()
        with suppress(asyncio.CancelledError):
            await heartbeat
        if cc_client is not None:
            await cc_client.close()

    # Step 3: publish the outcome only if the user has not replaced the import.
    await _finish_import(factory, run_id, import_id, error_code=error_code, draft=draft)


async def _heartbeat_import(
    factory: async_sessionmaker[AsyncSession], run_id: UUID, import_id: UUID
) -> None:
    """Renew the current job's lease during conversion and extraction."""
    try:
        while True:
            await asyncio.sleep(IMPORT_HEARTBEAT_SECONDS)
            if not await _refresh_import_heartbeat(factory, run_id, import_id):
                return
    except Exception:
        # A worker that cannot renew its lease must not revive an expired import.
        logger.exception(
            "CNB import heartbeat failed run_id=%s import_id=%s", run_id, import_id
        )


async def _refresh_import_heartbeat(
    factory: async_sessionmaker[AsyncSession], run_id: UUID, import_id: UUID
) -> bool:
    """Renew an unexpired processing import under the shared bundle lock."""
    async with factory() as session, session.begin():
        bundle = await _locked_bundle(session, run_id)
        current = _import_from_bundle(bundle)
        now = datetime.now(UTC)
        if (
            current is None
            or current.import_id != import_id
            or current.status != "processing"
            or now - current.updated_at > STALE_IMPORT_AFTER
        ):
            return False
        _set_import(bundle, current.model_copy(update={"updated_at": now}))
        return True


async def _converted_upload(
    factory: async_sessionmaker[AsyncSession], run_id: UUID, import_id: UUID
) -> tuple[FunderImport, ConceptNoteUpload] | None:
    """Poll until the import's upload is converted; None once it is superseded."""
    deadline = datetime.now(UTC) + UPLOAD_WAIT
    while True:
        async with factory() as session:
            current = _import_from_bundle(
                await session.get(ConceptNoteContextBundle, run_id)
            )
            if current is None or current.import_id != import_id:
                return None
            upload = await session.get(ConceptNoteUpload, current.upload_id)
        if upload is None or upload.ingest_status == "failed":
            raise FunderImportError("upload_failed", "The upload could not be converted")
        if upload.ingest_status == "ready" and upload.markdown_s3_key and upload.markdown_sha256:
            return current, upload
        if datetime.now(UTC) > deadline:
            raise FunderImportError("upload_not_ready", "The upload is still converting")
        await asyncio.sleep(UPLOAD_POLL_SECONDS)


async def _finish_import(
    factory: async_sessionmaker[AsyncSession],
    run_id: UUID,
    import_id: UUID,
    *,
    error_code: str | None,
    draft: FunderImportDraft | None,
) -> None:
    """Store a terminal state for the import that is still current."""
    async with factory() as session, session.begin():
        bundle = await _locked_bundle(session, run_id)
        current = _import_from_bundle(bundle)
        if (
            current is None
            or current.import_id != import_id
            or current.status != "processing"
            or datetime.now(UTC) - current.updated_at > STALE_IMPORT_AFTER
        ):
            logger.info(
                "Ignored expired or superseded CNB funder import import_id=%s", import_id
            )
            return
        finished = current.model_copy(
            update={
                "status": "failed" if error_code else "ready",
                "error_code": error_code,
                "draft": draft,
                "updated_at": datetime.now(UTC),
            }
        )
        _set_import(bundle, finished)
    logger.info(
        "Finished CNB funder import run_id=%s import_id=%s status=%s",
        run_id,
        import_id,
        finished.status,
    )


async def _locked_bundle(
    session: AsyncSession, run_id: UUID
) -> ConceptNoteContextBundle | None:
    """Reload the run's context bundle under a row lock."""
    return await session.get(
        ConceptNoteContextBundle, run_id, with_for_update=True, populate_existing=True
    )


def _import_from_bundle(bundle: ConceptNoteContextBundle | None) -> FunderImport | None:
    """Parse the stored import, if the run has one."""
    if bundle is None or not isinstance(bundle.context_bundle, dict):
        return None
    value = bundle.context_bundle.get(IMPORT_BUNDLE_KEY)
    return FunderImport.model_validate(value) if value else None


async def _write_import(
    session: AsyncSession, run_id: UUID, value: FunderImport | None
) -> None:
    """Replace the stored import under a row lock shared with bundle builds."""
    bundle = await _locked_bundle(session, run_id)
    if bundle is None:
        bundle = ConceptNoteContextBundle(run_id=run_id, context_bundle={})
        session.add(bundle)
    _set_import(bundle, value)


def _set_import(bundle: ConceptNoteContextBundle, value: FunderImport | None) -> None:
    """Write or remove the import key while keeping every other bundle section."""
    payload = deepcopy(bundle.context_bundle or {})
    if value is None:
        payload.pop(IMPORT_BUNDLE_KEY, None)
    else:
        payload[IMPORT_BUNDLE_KEY] = value.model_dump(mode="json")
    bundle.context_bundle = payload


# --- Adding to the catalogue -----------------------------------------------------


async def create_funder(
    session: AsyncSession,
    run: ConceptNoteRun,
    payload: FunderCreateRequest,
    *,
    reference_factory: async_sessionmaker[AsyncSession] | None = None,
) -> FunderCreateResponse:
    """Insert reviewed catalogue rows; selection stays with the funding endpoint."""
    factory = reference_factory or get_cnb_reference_session_factory()

    # Step 1: resolve the import these values were reviewed from, if any.
    draft, upload = (
        await _reviewed_import(session, run, payload.import_id, kind="funder")
        if payload.import_id is not None
        else (None, None)
    )

    # Step 2: store chapters in the shape drafting and validation expect.
    template = payload.template.model_copy(
        update={"chapter_schema": normalize_chapters(payload.template.chapter_schema)}
    )
    reviewed = payload.model_copy(update={"template": template})
    chapter_schema = [chapter.model_dump(mode="json") for chapter in template.chapter_schema]

    # Step 3: write funder, programme, template and provenance in one transaction.
    funder_id, opportunity_id = uuid4(), uuid4()
    if upload is not None:
        source_run_id = f"{UPLOAD_SOURCE_PREFIX}{upload.upload_id}"
        source_record_ref = upload.filename[:255]
    else:
        source_run_id = f"{MANUAL_SOURCE_PREFIX}{run.run_id}"
        source_record_ref = str(opportunity_id)
    try:
        async with factory() as reference, reference.begin():
            reference.add(
                CnbFunder(
                    funder_id=funder_id,
                    name=reviewed.funder.name.strip(),
                    funder_type=reviewed.funder.funder_type,
                    country=reviewed.funder.country,
                    region=reviewed.funder.region,
                    profile=reviewed.funder.profile.model_dump(mode="json"),
                )
            )
            await reference.flush()
            reference.add(
                CnbFundingOpportunity(
                    funding_opportunity_id=opportunity_id,
                    source_run_id=source_run_id,
                    source_record_ref=source_record_ref,
                    funder_id=funder_id,
                    name=reviewed.opportunity.name.strip(),
                    **reviewed.opportunity.model_dump(exclude={"name"}),
                )
            )
            await reference.flush()
            reference.add(
                CnbFunderTemplate(
                    funding_opportunity_id=opportunity_id,
                    template_name=template.template_name.strip(),
                    output_format=template.output_format,
                    chapter_schema=chapter_schema,
                    required_fields=template_required_fields(template),
                )
            )
            if draft is not None and upload is not None:
                document_id = await _source_document_id(reference, run, upload)
                for row in evidence_rows(
                    draft,
                    reviewed,
                    opportunity_id=opportunity_id,
                    source_document_id=document_id,
                ):
                    reference.add(row)
    except IntegrityError as exc:
        raise api_error(
            "funder_already_added", "This document was already added as a funder."
        ) from exc

    # Step 4: the draft is now in the catalogue, so clear it from the run.
    if payload.import_id is not None:
        await discard_funder_import(session, run, import_id=payload.import_id)
    logger.info(
        "Added CNB funder run_id=%s funder_id=%s opportunity_id=%s from_document=%s",
        run.run_id,
        funder_id,
        opportunity_id,
        draft is not None,
    )
    return FunderCreateResponse(
        funder_id=funder_id, funding_opportunity_id=opportunity_id
    )


async def _reviewed_import(
    session: AsyncSession,
    run: ConceptNoteRun,
    import_id: UUID,
    *,
    kind: FunderImportKind,
) -> tuple[FunderImportDraft, ConceptNoteUpload]:
    """Return the ready draft and its upload, or reject a changed import."""
    funder_import = await load_funder_import(session, run)
    if (
        funder_import is None
        or funder_import.import_id != import_id
        or funder_import.kind != kind
        or funder_import.status != "ready"
        or funder_import.draft is None
    ):
        raise api_error(
            "funder_import_changed",
            "The document import changed. Reload and review it again.",
        )
    upload = await session.get(ConceptNoteUpload, funder_import.upload_id)
    if upload is None or upload.markdown_sha256 is None:
        raise api_error("upload_not_found", "The uploaded file was not found.", 404)
    return funder_import.draft, upload


async def build_custom_template(
    session: AsyncSession, run: ConceptNoteRun, payload: CustomTemplateRequest
) -> StoredCustomTemplate:
    """Normalize a reviewed own template; a template import must still be current.

    The caller stores it on the run and clears the import in the same commit.
    """
    filename: str | None = None
    if payload.import_id is not None:
        _, upload = await _reviewed_import(
            session, run, payload.import_id, kind="template"
        )
        filename = upload.filename
    template = payload.template.model_copy(
        update={"chapter_schema": normalize_chapters(payload.template.chapter_schema)}
    )
    chapter_schema = [chapter.model_dump(mode="json") for chapter in template.chapter_schema]
    return StoredCustomTemplate(
        id=uuid4(),
        template_name=template.template_name.strip(),
        output_format=template.output_format,
        chapter_schema=chapter_schema,
        required_fields=template_required_fields(template),
        added_from=FundingAddedFrom(
            kind="document" if filename else "manual", filename=filename
        ),
    )


def clear_import(bundle: ConceptNoteContextBundle, import_id: UUID) -> None:
    """Remove the observed import from a bundle the caller has locked."""
    current = _import_from_bundle(bundle)
    if current is not None and current.import_id == import_id:
        _set_import(bundle, None)


def evidence_rows(
    draft: FunderImportDraft,
    reviewed: FunderCreateRequest,
    *,
    opportunity_id: UUID,
    source_document_id: UUID,
) -> list[CnbFundingEvidence]:
    """Record extracted and edited fields; values typed by hand get no evidence."""
    saved_values = field_values(reviewed)
    original_values = field_values(draft)
    rows: list[CnbFundingEvidence] = []
    for item in draft.evidence:
        saved = saved_values.get(item.field)
        if not has_value(saved):
            continue
        original = original_values.get(item.field)
        # Decimal equality ignores scale lost in the browser's numeric payload.
        origin = "extracted" if saved == original else "edited"
        source_map: dict[str, Any] = {
            "entity": item.field.split(".", 1)[0],
            "field": item.field,
            "origin": origin,
            "page": item.page,
        }
        if origin == "edited":
            source_map["original_value"] = json_value(original)
        rows.append(
            CnbFundingEvidence(
                funding_opportunity_id=opportunity_id,
                source_document_id=source_document_id,
                claim=item.field,
                quote_or_summary=item.quote,
                source_map=source_map,
            )
        )
    return rows


async def _source_document_id(
    reference: AsyncSession, run: ConceptNoteRun, upload: ConceptNoteUpload
) -> UUID:
    """Reuse or create the provenance row for one converted upload."""
    url = f"citycatalyst://concept-notes/{run.run_id}/uploads/{upload.upload_id}"
    existing = await reference.scalar(
        select(CnbSourceDocument.source_document_id).where(
            CnbSourceDocument.content_hash == upload.markdown_sha256,
            CnbSourceDocument.url == url,
        )
    )
    if existing is not None:
        return existing
    document = CnbSourceDocument(
        source_type="cnb_upload",
        url=url,
        title=upload.filename,
        content_hash=upload.markdown_sha256,
        fetched_at=upload.ingest_completed_at or datetime.now(UTC),
    )
    reference.add(document)
    await reference.flush()
    return document.source_document_id
