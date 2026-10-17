"""Extract funder or standalone-template drafts and verify their document quotes."""

from __future__ import annotations

import json
from collections import Counter
from collections.abc import Sequence
from typing import Any

from agents import Runner
from app.models.cnb.funder_creation import (
    ExtractedChapter,
    ExtractedEvidence,
    FieldEvidence,
    FunderDocumentExtraction,
    FunderFields,
    FunderImportDraft,
    FunderImportKind,
    FunderProfileFacts,
    ProgrammeFields,
    TemplateChapterFields,
    TemplateDocumentExtraction,
    TemplateFields,
)
from app.services.cnb.source_analysis import (
    SourcePage,
    SourceUnit,
    resolve_analysis_client,
    run_agent,
    render_source_text,
)
from app.utils.prompt_budget import count_prompt_tokens
from openai import AsyncOpenAI
from app.config import Settings, get_settings
from app.services.cnb.funder_fields import (
    CATALOGUE_PATHS,
    TEMPLATE_PATHS,
    award_amount,
    cleaned_fields,
    field_values,
    normalize_chapters,
    optional_text,
    profile_facts,
    squash_text,
)

MAX_EVIDENCE_PER_FIELD = 3


class FunderImportError(Exception):
    """Retryable failure to read funder details from an uploaded document."""

    def __init__(self, code: str, message: str) -> None:
        """Keep a stable public code separate from the internal message."""
        super().__init__(message)
        self.code = code


async def extract_funder_draft(
    units: Sequence[SourceUnit],
    *,
    filename: str,
    source_format: str,
    kind: FunderImportKind = "funder",
    settings: Settings | None = None,
    client: AsyncOpenAI | None = None,
    runner: Any = Runner,
) -> FunderImportDraft:
    """Read a funder or just its template, retaining only verified document quotes."""
    settings = settings or get_settings()
    prompt = settings.llm.prompts.get_prompt(f"cnb_{kind}_document_extraction")
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
            "document_too_long", f"Document has {token_count} tokens"
        )

    client, owns_client = resolve_analysis_client(settings, client)
    try:
        extraction = await run_agent(
            name=f"Concept Note {kind} document reader",
            prompt=prompt,
            model_config=model_config,
            output_type=TemplateDocumentExtraction
            if kind == "template"
            else FunderDocumentExtraction,
            input_text=input_text,
            client=client,
            runner=runner,
        )
    finally:
        if owns_client:
            await client.close()

    build = build_template_draft if kind == "template" else build_draft
    return build(extraction, units)


def build_draft(
    extraction: FunderDocumentExtraction, units: Sequence[SourceUnit]
) -> FunderImportDraft:
    """Convert model output into catalogue fields and keep only verbatim quotes."""
    funder = cleaned_fields(extraction.funder, exclude={"stated_facts", "derived_facts"})
    opportunity = cleaned_fields(extraction.opportunity)
    template, chapter_refs = _template_fields(extraction.template)
    min_award = award_amount(opportunity["min_award"])
    max_award = award_amount(opportunity["max_award"])
    if min_award is not None and max_award is not None and min_award > max_award:
        min_award = max_award = None
        opportunity["known_gaps"].append(
            "The award range could not be read consistently."
        )
    draft = FunderImportDraft(
        funder=FunderFields(
            **{**funder, "name": funder["name"] or ""},
            profile=FunderProfileFacts(
                stated=profile_facts(extraction.funder.stated_facts),
                derived=profile_facts(extraction.funder.derived_facts),
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
        template=template,
    )
    return _with_evidence(draft, extraction.evidence, units, chapter_refs, CATALOGUE_PATHS)


def build_template_draft(
    extraction: TemplateDocumentExtraction, units: Sequence[SourceUnit]
) -> FunderImportDraft:
    """Convert a template-only read; funder and programme stay blank."""
    template, chapter_refs = _template_fields(extraction.template)
    draft = FunderImportDraft(
        funder=FunderFields(), opportunity=ProgrammeFields(), template=template
    )
    return _with_evidence(draft, extraction.evidence, units, chapter_refs, TEMPLATE_PATHS)


def _template_fields(
    extracted: Any,
) -> tuple[TemplateFields, dict[str, str]]:
    """Clean template columns and normalize its chapters."""
    template = cleaned_fields(extracted, exclude={"chapters"})
    chapters, chapter_refs = _extracted_chapters(extracted.chapters)
    return (
        TemplateFields(
            **{**template, "template_name": template["template_name"] or ""},
            chapter_schema=chapters,
        ),
        chapter_refs,
    )


def _with_evidence(
    draft: FunderImportDraft,
    extracted: Sequence[ExtractedEvidence],
    units: Sequence[SourceUnit],
    chapter_refs: dict[str, str],
    reported_paths: Sequence[str],
) -> FunderImportDraft:
    """Keep evidence only for filled fields whose quote is in the text."""
    values = field_values(draft)
    filled = {
        path
        for path, value in values.items()
        if value and path != "template.chapter_schema"
    }
    unit_texts = [(squash_text(unit.text), unit) for unit in units]
    evidence: list[FieldEvidence] = []
    per_field: Counter[str] = Counter()
    for item in extracted:
        path = _renamed_chapter_path(item.field, chapter_refs)
        quote = squash_text(item.quote)
        if not quote or path not in filled or per_field[path] >= MAX_EVIDENCE_PER_FIELD:
            continue
        unit = next((unit for text, unit in unit_texts if quote in text), None)
        if unit is None:
            continue
        page = unit.number if isinstance(unit, SourcePage) else None
        evidence.append(FieldEvidence(field=path, quote=item.quote.strip(), page=page))
        per_field[path] += 1

    draft.evidence = evidence
    draft.missing = [path for path in reported_paths if not values.get(path)]
    return draft


def _extracted_chapters(
    chapters: Sequence[ExtractedChapter],
) -> tuple[list[TemplateChapterFields], dict[str, str]]:
    """Normalize titled chapters and remember how model refs map to stored refs."""
    kept = [chapter for chapter in chapters if chapter.title.strip()]
    normalized = normalize_chapters(
        [
            TemplateChapterFields(
                **{**chapter.model_dump(), "description": optional_text(chapter.description)}
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
