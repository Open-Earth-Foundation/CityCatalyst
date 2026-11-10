"""Build in-memory production inputs for golden-set stages; no database writes.

Every stage reuses the same synthetic identities so chapter, upload, and run IDs
are stable across runs and comparable between reports.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid5

from app.config import Settings
from app.models.cnb.concept_note_application_context import (
    ApplicationContextFunder,
    ApplicationContextOpportunity,
    ApplicationContextTemplate,
    ConceptNoteApplicationContextResponse,
)
from app.models.cnb.context_bundle import (
    BundleCcContext,
    ConceptNoteContextBundle,
    SelectedSource,
    SourceDocumentText,
)
from app.models.db.concept_note import ConceptNoteRun
from app.persistence.concept_notes.gaps import WorkspaceGapSnapshot
from app.persistence.concept_notes.workspace import (
    WorkspaceTemplateChapter,
    normalize_template_chapters,
)
from app.persistence.concept_notes.workspace_snapshots import WorkspaceChapterSnapshot
from app.services.cnb.application_context import included_sources_from_bundle
from app.services.cnb.chapter_drafting import build_run_context
from app.services.cnb.context_bundle import source_text_context
from app.services.cnb.source_analysis import render_source_text

from benchmark.cnb.golden_set.core import LoadedFixture
from benchmark.cnb.golden_set.models import ReferenceChapter, ReferenceGap, TextUnit

_EPOCH = datetime(2026, 1, 1, tzinfo=UTC)


def golden_id(fixture_id: str, name: str) -> UUID:
    """Return a stable synthetic identity for one fixture object."""
    return uuid5(NAMESPACE_URL, f"cnb-golden-set/{fixture_id}/{name}")


@dataclass(frozen=True)
class GoldenWorkspace:
    """Production inputs for drafting, validating, and editing one fixture."""

    application_context: ConceptNoteApplicationContextResponse
    bundle: ConceptNoteContextBundle
    run_context: dict[str, Any]
    chapters: list[WorkspaceChapterSnapshot]
    templates: list[WorkspaceTemplateChapter]


def fixture_template(loaded: LoadedFixture) -> ApplicationContextTemplate | None:
    """The fixture's application template as production would load it."""
    template = loaded.drafting_input
    if template is None:
        return None
    return ApplicationContextTemplate(
        id=golden_id(loaded.fixture.fixture_id, "template"),
        name=template.template_name,
        chapter_schema=template.chapter_schema,
        required_fields=template.required_fields,
    )


def build_workspace(
    loaded: LoadedFixture,
    settings: Settings,
    selected_source: SelectedSource,
) -> GoldenWorkspace:
    """Build the bundle, application context, and empty chapters a new run drafts into."""
    fixture = loaded.fixture
    template = loaded.drafting_input
    if template is None:
        raise ValueError(f"{fixture.fixture_id} has no chapter-writing input")
    fid = fixture.fixture_id
    run_id, city_id = golden_id(fid, "run"), golden_id(fid, "city")
    source_text = source_text_context(
        [
            SourceDocumentText(
                upload_id=golden_id(fid, "upload"),
                source_label=fixture.source.source_label,
                filename=fixture.source.filename,
                source_format=fixture.source.source_format,
                text=render_source_text(loaded.units),
            )
        ],
        settings,
        selected_sources=[selected_source],
    )
    bundle = ConceptNoteContextBundle(
        selected_sources=[selected_source],
        cc_context=BundleCcContext.model_validate(template.cc_context),
        source_text=source_text,
    )
    run = ConceptNoteRun(
        run_id=run_id,
        name=template.run_name,
        city_id=str(city_id),
        project_id=None,
        context_summary={},
    )
    application_context = ConceptNoteApplicationContextResponse(
        run_id=run_id,
        city_id=city_id,
        funder=ApplicationContextFunder(id=golden_id(fid, "funder"), name=template.funder),
        opportunity=ApplicationContextOpportunity(
            id=golden_id(fid, "opportunity"), name=template.opportunity
        ),
        template=fixture_template(loaded),
        included_sources=included_sources_from_bundle(bundle),
    )
    templates = normalize_template_chapters(template.chapter_schema)
    chapters = [
        WorkspaceChapterSnapshot(
            chapter_id=golden_id(fid, item.chapter_ref),
            chapter_ref=item.chapter_ref,
            title=item.title,
            position=position,
            status="pending",
            required=item.required,
            user_locked=False,
            body_markdown=None,
            description=item.description,
        )
        for position, item in enumerate(templates)
    ]
    return GoldenWorkspace(
        application_context=application_context,
        bundle=bundle,
        run_context=build_run_context(run, bundle),
        chapters=chapters,
        templates=templates,
    )


def frozen_selected_source(loaded: LoadedFixture, analysis: dict[str, Any]) -> SelectedSource:
    """Attach the fixture's upload identity to a reviewed extraction result."""
    fixture = loaded.fixture
    is_pdf = fixture.source.source_format == "pdf"
    return SelectedSource.model_validate(
        {
            **analysis,
            "upload_id": golden_id(fixture.fixture_id, "upload"),
            "source_label": fixture.source.source_label,
            "filename": fixture.source.filename,
            "sha256": fixture.source.sha256,
            "source_format": fixture.source.source_format,
            "page_count": len(loaded.units) if is_pdf else None,
            "block_count": None if is_pdf else len(loaded.units),
        }
    )


def edit_run_context(bundle: ConceptNoteContextBundle) -> dict[str, Any]:
    """Mirror the flat run context production gives the edit planner."""
    return {**bundle.model_dump(mode="json", exclude={"source_text"}), "manual_population": None}


def reference_snapshots(
    workspace: GoldenWorkspace,
    fixture_id: str,
    chapters: list[ReferenceChapter],
) -> list[WorkspaceChapterSnapshot]:
    """Turn reference chapters into persisted-looking snapshots with open gaps."""
    by_ref = {chapter.chapter_ref: chapter for chapter in chapters}
    snapshots = []
    for empty in workspace.chapters:
        chapter = by_ref[empty.chapter_ref]
        snapshots.append(
            WorkspaceChapterSnapshot(
                chapter_id=empty.chapter_id,
                chapter_ref=empty.chapter_ref,
                title=empty.title,
                position=empty.position,
                status="needs_review" if chapter.gaps else "draft",
                required=empty.required,
                user_locked=False,
                body_markdown=chapter.body_markdown,
                description=empty.description,
                gaps=[_gap_snapshot(fixture_id, chapter.chapter_ref, gap) for gap in chapter.gaps],
                revision_id=golden_id(fixture_id, f"{chapter.chapter_ref}/revision/1"),
                revision_number=1,
                confirmed_body_markdown=chapter.body_markdown,
                confirmed_revision_number=1,
            )
        )
    return snapshots


def _gap_snapshot(fixture_id: str, chapter_ref: str, gap: ReferenceGap) -> WorkspaceGapSnapshot:
    """An open persisted gap as the workspace would load it."""
    return WorkspaceGapSnapshot(
        gap_id=golden_id(fixture_id, f"{chapter_ref}/gap/{gap.field_key}"),
        field_key=gap.field_key,
        question=gap.question,
        why_asking=gap.why_asking,
        severity=gap.severity,
        state="open",
        suggestions=[],
        source_refs=[],
        version=1,
        resolution=None,
        created_at=_EPOCH,
        updated_at=_EPOCH,
    )


def context_units(loaded: LoadedFixture) -> list[TextUnit]:
    """Authoritative city and application context as judge evidence."""
    template = loaded.drafting_input
    if template is None:
        return []
    return text_units(
        {
            "cc_context": template.cc_context,
            "funder": template.funder,
            "opportunity": template.opportunity,
        },
        "context",
        "context",
    )


def text_units(
    value: Any, prefix: str, kind: str, chapter_ref: str | None = None
) -> list[TextUnit]:
    """Flatten actual JSON leaves into referenceable text without escaped source prose."""
    units: list[TextUnit] = []
    if isinstance(value, dict):
        for key, item in value.items():
            units += text_units(item, f"{prefix}/{key}", kind, chapter_ref)
    elif isinstance(value, list):
        for index, item in enumerate(value):
            units += text_units(item, f"{prefix}/{index}", kind, chapter_ref)
    elif value is not None:
        text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
        if text.strip():
            units.append(TextUnit(id=prefix, text=text, kind=kind, chapter_ref=chapter_ref))
    return units


def share_common_inputs(units: list[TextUnit], chapter_refs: set[str]) -> list[TextUnit]:
    """Send identical inputs shared by every chapter once, preserving access scope."""
    grouped: dict[tuple[str, str], list[TextUnit]] = {}
    for unit in units:
        # Remove only the supplied/chapter prefix; preserve the semantic field path.
        field = unit.id.split("/", 2)[2]
        grouped.setdefault((field, unit.text), []).append(unit)
    shared: list[TextUnit] = []
    for (field, _), group in grouped.items():
        if {unit.chapter_ref for unit in group} == chapter_refs:
            shared.append(
                group[0].model_copy(update={"id": f"supplied/shared/{field}", "chapter_ref": None})
            )
        else:
            shared.extend(group)
    return shared
