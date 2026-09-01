"""Concise builders shared by chapter-validation tests."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any
from uuid import UUID

from app.config import get_settings
from app.models.cnb.concept_note_chapter_validation import (
    ChapterCompletenessValidationOutput,
    ChapterConsistencyValidationOutput,
    ChapterValidationChapter,
    ChapterValidationCheckKey,
    ChapterValidationCheckStatus,
    ChapterValidationEvidenceLink,
    ChapterValidationFindingCategory,
    ChapterValidationFindingDraft,
    ChapterValidationGap,
    ChapterValidationPassCheck,
    ChapterValidationRequest,
    ChapterValidationSeverity,
    ChapterValidationTemplate,
)
from app.services.cnb.chapter_validation import ConceptNoteChapterValidationService

TARGET_ID = UUID("11111111-1111-4111-8111-111111111111")
OTHER_ID = UUID("22222222-2222-4222-8222-222222222222")
THIRD_ID = UUID("33333333-3333-4333-8333-333333333333")
UNKNOWN_ID = UUID("99999999-9999-4999-8999-999999999999")

PassCallback = Callable[[str, dict[str, Any]], Awaitable[Any]]


def chapter(
    chapter_id: UUID,
    *,
    position: int,
    body: str | None = "Complete chapter text.",
    required: bool = True,
) -> ChapterValidationChapter:
    return ChapterValidationChapter(
        chapter_id=chapter_id,
        template_section_id=f"chapter-{position + 1}",
        title=f"Chapter {position + 1}",
        position=position,
        required=required,
        body_markdown=body,
        revision_number=1 if body is not None else None,
    )


def request(
    *,
    chapters: list[ChapterValidationChapter] | None = None,
    gaps: list[ChapterValidationGap] | None = None,
    evidence: bool = True,
    target_required: bool = True,
) -> ChapterValidationRequest:
    evidence_links = (
        [
            ChapterValidationEvidenceLink(
                selected_source_label="City climate plan",
                claim_ref="target claim",
                quote_or_summary="Supporting summary",
            )
        ]
        if evidence
        else []
    )
    return ChapterValidationRequest(
        target_chapter_id=TARGET_ID,
        validation_input_fingerprint="a" * 64,
        chapters=chapters or [chapter(TARGET_ID, position=0, required=target_required)],
        template=ChapterValidationTemplate(
            template_id=UUID("44444444-4444-4444-8444-444444444444"),
            name="Application template",
            chapter_schema=[
                {
                    "chapter_ref": "chapter-1",
                    "title": "Chapter 1",
                    "required": target_required,
                }
            ],
            required_fields=["Implementation timetable"],
        ),
        open_gaps=gaps or [],
        evidence_links=evidence_links,
    )


def check(
    key: ChapterValidationCheckKey,
    status: ChapterValidationCheckStatus = "pass",
    message: str | None = None,
) -> ChapterValidationPassCheck:
    return ChapterValidationPassCheck(key=key, status=status, message=message)


def finding(
    category: ChapterValidationFindingCategory,
    message: str,
    suggested_action: str,
    *,
    severity: ChapterValidationSeverity = "blocking",
    chapter_ids: list[UUID] | None = None,
    excerpts: list[str] | None = None,
) -> ChapterValidationFindingDraft:
    return ChapterValidationFindingDraft(
        category=category,
        severity=severity,
        message=message,
        suggested_action=suggested_action,
        involved_chapter_ids=chapter_ids or [TARGET_ID],
        excerpts=excerpts or [],
    )


def completeness(
    *,
    required: ChapterValidationPassCheck | None = None,
    template: ChapterValidationPassCheck | None = None,
    evidence: ChapterValidationPassCheck | None = None,
    findings: list[ChapterValidationFindingDraft] | None = None,
) -> ChapterCompletenessValidationOutput:
    return ChapterCompletenessValidationOutput(
        checks=[
            required or check("required_content"),
            template or check("template_constraints"),
            evidence or check("evidence_citations"),
        ],
        findings=findings or [],
    )


def consistency(
    *,
    internal: ChapterValidationPassCheck | None = None,
    cross_chapter: ChapterValidationPassCheck | None = None,
    findings: list[ChapterValidationFindingDraft] | None = None,
) -> ChapterConsistencyValidationOutput:
    return ChapterConsistencyValidationOutput(
        checks=[
            internal or check("internal_consistency"),
            cross_chapter or check("cross_chapter_consistency"),
        ],
        findings=findings or [],
    )


def static_passes(
    *,
    completeness_result: ChapterCompletenessValidationOutput | None = None,
    consistency_result: ChapterConsistencyValidationOutput | None = None,
) -> PassCallback:
    async def run_pass(phase: str, _: dict[str, Any]) -> Any:
        if phase == "completeness":
            return completeness_result or completeness()
        return consistency_result or consistency()

    return run_pass


def service(run_pass: PassCallback) -> ConceptNoteChapterValidationService:
    settings = get_settings().model_copy(deep=True)
    return ConceptNoteChapterValidationService(
        settings=settings,
        run_pass=run_pass,  # type: ignore[arg-type]
    )
