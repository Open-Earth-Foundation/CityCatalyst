"""Add a funder, programme and template to the CNB catalogue.

A run can read one uploaded funder document into a reviewable draft, or accept
values typed by hand. Nothing reaches the catalogue until the user confirms.
The pending import lives in the run's context bundle under ``funder_import``;
confirmed values become ordinary ``funders``, ``funding_opportunities`` and
``funder_templates`` rows, with per-field provenance in the existing
``source_documents`` and ``funding_evidence`` tables.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections import Counter
from collections.abc import Awaitable, Callable, Sequence
from contextvars import Context
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from agents import Runner
from app.db.cnb_reference import get_cnb_reference_session_factory
from app.db.session import get_session_factory
from app.models.cnb.concept_note_markdown import source_format_from_filename
from app.models.cnb.funding_catalogue import MANUAL_SOURCE_PREFIX, UPLOAD_SOURCE_PREFIX
from app.models.cnb.funder_import import (
    ExtractedChapter,
    ExtractedFact,
    FieldEvidence,
    FunderCreateRequest,
    FunderCreateResponse,
    FunderDocumentExtraction,
    FunderFields,
    FunderImport,
    FunderImportDraft,
    FunderProfileFacts,
    ProgrammeFields,
    TemplateChapterFields,
    TemplateFields,
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
from app.persistence.concept_notes.workspace import normalize_template_chapters
from app.services.citycatalyst_client import CityCatalystClient, CityCatalystClientError
from app.services.cnb.source_analysis import (
    SourceAnalysisError,
    SourcePage,
    SourceUnit,
    resolve_analysis_client,
    run_agent,
    markdown_heading_slug,
    render_source_text,
    verify_source_artifact,
)
from app.utils.prompt_budget import count_prompt_tokens
from fastapi import HTTPException
from openai import AsyncOpenAI
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)

IMPORT_BUNDLE_KEY = "funder_import"
# The import waits for the upload to finish converting before reading it.
UPLOAD_POLL_SECONDS = 2.0
UPLOAD_WAIT = timedelta(minutes=10)
# A process restart loses the in-memory job; after this long it becomes retryable.
STALE_IMPORT_AFTER = UPLOAD_WAIT + timedelta(minutes=15)
MAX_EVIDENCE_PER_FIELD = 3
OPPORTUNITY_FIELDS = (
    "applicant_type",
    "category",
    "sector",
    "hazards",
    "interventions",
    "finance_route",
    "instrument_type",
    "region_scope",
    "min_award",
    "max_award",
    "currency",
    "status",
    "summary",
)
# Catalogue columns a draft reports as ``missing`` when the document is silent.
CATALOGUE_PATHS = (
    "funder.name",
    "funder.funder_type",
    "funder.country",
    "funder.region",
    "opportunity.name",
    *(f"opportunity.{name}" for name in OPPORTUNITY_FIELDS),
    "template.template_name",
    "template.output_format",
    "template.chapter_schema",
)
_BACKGROUND_IMPORTS: set[asyncio.Task[None]] = set()

ExtractDraft = Callable[..., Awaitable[FunderImportDraft]]


class FunderImportError(Exception):
    """Retryable failure to read funder details from an uploaded document."""

    def __init__(self, code: str, message: str) -> None:
        """Keep a stable public code separate from the internal message."""
        super().__init__(message)
        self.code = code


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
        raise api_error(
            "funder_import_running", "A funder document is already being read."
        )

    # Replace any previous draft or failure; a new id makes late results no-ops.
    now = datetime.now(UTC)
    funder_import = FunderImport(
        import_id=uuid4(),
        upload_id=upload.upload_id,
        filename=upload.filename,
        status="processing",
        created_at=now,
        updated_at=now,
    )
    await _write_import(session, run.run_id, funder_import)
    await session.commit()
    logger.info(
        "Started CNB funder import run_id=%s import_id=%s upload_id=%s",
        run.run_id,
        funder_import.import_id,
        upload_id,
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
    current = _import_from_bundle(bundle)
    if current is not None and current.import_id == import_id:
        _set_import(bundle, None)
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
    extract = extract or extract_funder_draft
    cc_client: CityCatalystClient | None = None
    draft: FunderImportDraft | None = None
    error_code: str | None = None
    try:
        # Step 1: wait until the upload on the still-current import is converted.
        upload = await _converted_upload(factory, run_id, import_id)
        if upload is None:
            return

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
        draft = await extract(
            units, filename=upload.filename, source_format=source_format
        )
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
        if cc_client is not None:
            await cc_client.close()

    # Step 3: publish the outcome only if the user has not replaced the import.
    await _finish_import(factory, run_id, import_id, error_code=error_code, draft=draft)


async def _converted_upload(
    factory: async_sessionmaker[AsyncSession], run_id: UUID, import_id: UUID
) -> ConceptNoteUpload | None:
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
            return upload
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
        if current is None or current.import_id != import_id:
            logger.info("Ignored superseded CNB funder import import_id=%s", import_id)
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


# --- Extraction ---------------------------------------------------------------


async def extract_funder_draft(
    units: Sequence[SourceUnit],
    *,
    filename: str,
    source_format: str,
    settings: Settings | None = None,
    client: AsyncOpenAI | None = None,
    runner: Any = Runner,
) -> FunderImportDraft:
    """Read the whole document in one model call and verify its quotes."""
    settings = settings or get_settings()
    prompt = settings.llm.prompts.get_prompt("cnb_funder_document_extraction")
    model_config = settings.llm.models.cnb_funder_extractor
    budget = settings.llm.generation.prompt_budget

    # Refuse documents that cannot be read completely in one call.
    input_text = json.dumps(
        {
            "filename": filename,
            "source_format": source_format,
            "document": render_source_text(units),
        },
        ensure_ascii=False,
    )
    token_count = count_prompt_tokens(
        [prompt, input_text],
        model=model_config.name,
        fallback_encoding=budget.tokenizer_encoding,
    ).tokens
    if token_count > budget.cnb_funder_import.max_document_tokens:
        raise FunderImportError(
            "document_too_long", f"Funder document has {token_count} tokens"
        )

    client, owns_client = resolve_analysis_client(settings, client)
    try:
        extraction = await run_agent(
            name="Concept Note funder document reader",
            prompt=prompt,
            model_config=model_config,
            output_type=FunderDocumentExtraction,
            input_text=input_text,
            client=client,
            runner=runner,
        )
    finally:
        if owns_client:
            await client.close()
    return build_draft(extraction, units)


def build_draft(
    extraction: FunderDocumentExtraction, units: Sequence[SourceUnit]
) -> FunderImportDraft:
    """Convert model output into catalogue fields and keep only verbatim quotes."""
    funder = _cleaned(extraction.funder, exclude={"stated_facts", "derived_facts"})
    opportunity = _cleaned(extraction.opportunity)
    template = _cleaned(extraction.template, exclude={"chapters"})
    chapters, chapter_refs = _extracted_chapters(extraction.template.chapters)
    min_award = _award(opportunity["min_award"])
    max_award = _award(opportunity["max_award"])
    if min_award is not None and max_award is not None and min_award > max_award:
        min_award = max_award = None
        opportunity["known_gaps"].append(
            "The award range could not be read consistently."
        )
    draft = FunderImportDraft(
        funder=FunderFields(
            **{**funder, "name": funder["name"] or ""},
            profile=FunderProfileFacts(
                stated=_facts(extraction.funder.stated_facts),
                derived=_facts(extraction.funder.derived_facts),
            ),
        ),
        opportunity=ProgrammeFields(
            **{
                **opportunity,
                "name": opportunity["name"] or "",
                "min_award": min_award,
                "max_award": max_award,
            }
        ),
        template=TemplateFields(
            **{**template, "template_name": template["template_name"] or ""},
            chapter_schema=chapters,
        ),
    )

    # Keep evidence only for filled fields and only when the quote is in the text.
    filled = {path for path in evidence_paths(draft) if field_value(draft, path)}
    unit_texts = [(_squash(unit.text), unit) for unit in units]
    evidence: list[FieldEvidence] = []
    per_field: Counter[str] = Counter()
    for item in extraction.evidence:
        path = _renamed_chapter_path(item.field, chapter_refs)
        quote = _squash(item.quote)
        if not quote or path not in filled or per_field[path] >= MAX_EVIDENCE_PER_FIELD:
            continue
        unit = next((unit for text, unit in unit_texts if quote in text), None)
        if unit is None:
            continue
        page = unit.number if isinstance(unit, SourcePage) else None
        evidence.append(FieldEvidence(field=path, quote=item.quote.strip(), page=page))
        per_field[path] += 1

    draft.evidence = evidence
    draft.missing = [path for path in CATALOGUE_PATHS if not field_value(draft, path)]
    return draft


def _extracted_chapters(
    chapters: Sequence[ExtractedChapter],
) -> tuple[list[TemplateChapterFields], dict[str, str]]:
    """Normalize titled chapters and remember how model refs map to stored refs."""
    kept = [chapter for chapter in chapters if chapter.title.strip()]
    normalized = normalize_chapters(
        [
            TemplateChapterFields(
                chapter_ref=chapter.chapter_ref,
                title=chapter.title,
                description=_text(chapter.description),
                required=chapter.required,
                required_fields=chapter.required_fields,
            )
            for chapter in kept
        ]
    )
    return normalized, {
        original.chapter_ref: stored.chapter_ref
        for original, stored in zip(kept, normalized, strict=True)
    }


def _renamed_chapter_path(path: str, chapter_refs: dict[str, str]) -> str:
    """Point chapter evidence at the normalized chapter reference."""
    prefix = "template.chapter_schema."
    if path.startswith(prefix):
        original = path[len(prefix) :]
        return prefix + chapter_refs.get(original, original)
    return path


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
        await _reviewed_import(session, run, payload.import_id)
        if payload.import_id is not None
        else (None, None)
    )

    # Step 2: store chapters in the shape drafting and validation expect.
    template = payload.template.model_copy(
        update={"chapter_schema": normalize_chapters(payload.template.chapter_schema)}
    )
    reviewed = payload.model_copy(update={"template": template})
    chapter_schema = [chapter.model_dump(mode="json") for chapter in template.chapter_schema]
    normalize_template_chapters(chapter_schema)

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
                    **reviewed.opportunity.model_dump(
                        include={*OPPORTUNITY_FIELDS, "known_gaps"}
                    ),
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
    session: AsyncSession, run: ConceptNoteRun, import_id: UUID
) -> tuple[FunderImportDraft, ConceptNoteUpload]:
    """Return the ready draft and its upload, or reject a changed import."""
    funder_import = await load_funder_import(session, run)
    if (
        funder_import is None
        or funder_import.import_id != import_id
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


def evidence_rows(
    draft: FunderImportDraft,
    reviewed: FunderCreateRequest,
    *,
    opportunity_id: UUID,
    source_document_id: UUID,
) -> list[CnbFundingEvidence]:
    """Record extracted and edited fields; values typed by hand get no evidence."""
    rows: list[CnbFundingEvidence] = []
    for item in draft.evidence:
        saved = field_value(reviewed, item.field)
        if not saved:
            continue
        original = field_value(draft, item.field)
        # Decimal equality ignores scale lost in the browser's numeric payload.
        origin = "extracted" if saved == original else "edited"
        source_map: dict[str, Any] = {
            "entity": item.field.split(".", 1)[0],
            "field": item.field,
            "origin": origin,
            "page": item.page,
        }
        if origin == "edited":
            source_map["original_value"] = _json(original)
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


# --- Field helpers --------------------------------------------------------------


def normalize_chapters(
    chapters: Sequence[TemplateChapterFields],
) -> list[TemplateChapterFields]:
    """Give every chapter a unique slug ref and clean required-field names."""
    normalized: list[TemplateChapterFields] = []
    seen: set[str] = set()
    for index, chapter in enumerate(chapters, start=1):
        base = markdown_heading_slug(chapter.chapter_ref or chapter.title)
        if base == "section":
            base = f"chapter-{index}"
        ref, suffix = base, 2
        while ref in seen:
            ref, suffix = f"{base}-{suffix}", suffix + 1
        seen.add(ref)
        normalized.append(
            chapter.model_copy(
                update={
                    "chapter_ref": ref,
                    "title": chapter.title.strip(),
                    "required_fields": _clean_list(chapter.required_fields),
                }
            )
        )
    return normalized


def template_required_fields(template: TemplateFields) -> list[str]:
    """Build the template inventory from chapter fields so each has an owner."""
    return list(
        dict.fromkeys(
            field for chapter in template.chapter_schema for field in chapter.required_fields
        )
    )


def evidence_paths(record: FunderImportDraft | FunderCreateRequest) -> list[str]:
    """Paths evidence can support: columns, each profile fact and each chapter."""
    profile = record.funder.profile
    return [
        *(path for path in CATALOGUE_PATHS if path != "template.chapter_schema"),
        *(f"funder.profile.stated.{key}" for key in profile.stated),
        *(f"funder.profile.derived.{key}" for key in profile.derived),
        *(
            f"template.chapter_schema.{chapter.chapter_ref}"
            for chapter in record.template.chapter_schema
        ),
    ]


def field_value(record: FunderImportDraft | FunderCreateRequest, path: str) -> Any:
    """Return the value at a field path, or None when it does not exist."""
    entity, _, rest = path.partition(".")
    if entity == "funder":
        if rest.startswith("profile."):
            group, _, key = rest[len("profile.") :].partition(".")
            facts = getattr(record.funder.profile, group, None)
            return facts.get(key) if isinstance(facts, dict) else None
        return getattr(record.funder, rest, None)
    if entity == "opportunity":
        return getattr(record.opportunity, rest, None)
    if entity == "template":
        if rest == "chapter_schema":
            return record.template.chapter_schema
        if rest.startswith("chapter_schema."):
            ref = rest[len("chapter_schema.") :]
            return next(
                (
                    chapter
                    for chapter in record.template.chapter_schema
                    if chapter.chapter_ref == ref
                ),
                None,
            )
        return getattr(record.template, rest, None)
    return None


def _json(value: Any) -> Any:
    """Return a JSON-comparable form of one field value."""
    if isinstance(value, TemplateChapterFields):
        return value.model_dump(mode="json")
    if isinstance(value, Decimal):
        return str(value)
    return value


def _text(value: str | None) -> str | None:
    """Strip text and treat blanks as missing."""
    return (value or "").strip() or None


def _squash(text: str) -> str:
    """Collapse whitespace so quotes match across line breaks."""
    return " ".join(text.split())


def _cleaned(model: BaseModel, *, exclude: set[str] | None = None) -> dict[str, Any]:
    """Field values with text stripped (blank as None) and lists de-duplicated."""
    values = model.model_dump(exclude=exclude)
    for key, value in values.items():
        if isinstance(value, str):
            values[key] = _text(value)
        elif isinstance(value, list):
            values[key] = _clean_list(value)
    return values


def _clean_list(values: Sequence[str]) -> list[str]:
    """Strip, drop blanks and keep the first copy of each value."""
    return list(dict.fromkeys(stripped for value in values if (stripped := value.strip())))


def _facts(facts: Sequence[ExtractedFact]) -> dict[str, str]:
    """Turn model key/value facts into a map, keeping the first of duplicates."""
    result: dict[str, str] = {}
    for fact in facts:
        key, value = fact.key.strip(), fact.value.strip()
        if key and value and key not in result:
            result[key] = value
    return result


def _award(value: float | None) -> Decimal | None:
    """Convert a model number to a non-negative two-decimal amount."""
    if value is None or value < 0:
        return None
    return Decimal(str(round(value, 2)))
