from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any
from uuid import UUID

import pytest
from app.config import get_settings
from app.models.cnb.concept_note_application_context import ApplicationContextTemplate
from app.models.cnb.concept_note_chapter_validation import (
    ChapterCompletenessValidationOutput,
    ChapterConsistencyValidationOutput,
    ChapterValidationChapter,
    ChapterValidationEvidenceLink,
    ChapterValidationFindingDraft,
    ChapterValidationGap,
    ChapterValidationPassCheck,
    ChapterValidationRequest,
    ChapterValidationTemplate,
)
from app.persistence.concept_notes.workspace import (
    WorkspaceValidationChapter,
    WorkspaceValidationContext,
    WorkspaceValidationEvidence,
    WorkspaceValidationGap,
)
from app.services.cnb.chapter_validation import (
    ChapterValidationError,
    ChapterValidationInputTooLargeError,
    ChapterValidationModelOutputError,
    ConceptNoteChapterValidationService,
    build_chapter_validation_request,
)
from app.utils.prompt_budget import TokenCount

TARGET_ID = UUID("11111111-1111-4111-8111-111111111111")
OTHER_ID = UUID("22222222-2222-4222-8222-222222222222")
THIRD_ID = UUID("33333333-3333-4333-8333-333333333333")
UNKNOWN_ID = UUID("99999999-9999-4999-8999-999999999999")

POLITICAL_BODY = (
    "Krakow Fast Tram Stage IV is presented as a sustainable urban mobility "
    "project. This investment concept should be anchored in adopted commitments."
)
APPLICANT_BODY = (
    "The applicant is the Municipality of Krakow. Its project is Krakow Fast "
    "Tram Stage IV, a route supporting sustainable urban mobility."
)
INVESTMENT_BODY = (
    "The proposed measure is the delivery of the 4.45 km tram route. Construction "
    "is 97% complete and commissioning is underway."
)
EUCF_SUPPORT_BODY = (
    "EUCF-supported work should focus on clearly defined remaining or follow-on "
    "investment-concept activities rather than on works already completed, under "
    "construction, or being commissioned."
)

PassCallback = Callable[[str, dict[str, Any]], Awaitable[Any]]


def _chapter(
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


def _request(
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
        chapters=chapters
        or [_chapter(TARGET_ID, position=0, required=target_required)],
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


def _passing_completeness() -> ChapterCompletenessValidationOutput:
    return ChapterCompletenessValidationOutput(
        checks=[
            ChapterValidationPassCheck(key="required_content", status="pass"),
            ChapterValidationPassCheck(key="template_constraints", status="pass"),
            ChapterValidationPassCheck(key="evidence_citations", status="pass"),
        ]
    )


def _passing_consistency() -> ChapterConsistencyValidationOutput:
    return ChapterConsistencyValidationOutput(
        checks=[
            ChapterValidationPassCheck(key="internal_consistency", status="pass"),
            ChapterValidationPassCheck(
                key="cross_chapter_consistency",
                status="pass",
            ),
        ]
    )


def _service(run_pass: PassCallback) -> ConceptNoteChapterValidationService:
    settings = get_settings().model_copy(deep=True)
    return ConceptNoteChapterValidationService(
        settings=settings,
        run_pass=run_pass,  # type: ignore[arg-type]
    )


def test_builds_core_request_from_repository_snapshot() -> None:
    context = WorkspaceValidationContext(
        target=WorkspaceValidationChapter(
            chapter_id=TARGET_ID,
            chapter_ref="chapter-1",
            title="Chapter 1",
            position=0,
            status="draft",
            required=True,
            body_markdown="Draft body",
            revision_id=UUID("55555555-5555-4555-8555-555555555555"),
            revision_number=2,
        ),
        chapters=[
            WorkspaceValidationChapter(
                chapter_id=TARGET_ID,
                chapter_ref="chapter-1",
                title="Chapter 1",
                position=0,
                status="draft",
                required=True,
                body_markdown="Draft body",
                revision_id=UUID("55555555-5555-4555-8555-555555555555"),
                revision_number=2,
            )
        ],
        open_gaps=[
            WorkspaceValidationGap(
                gap_id=UUID("66666666-6666-4666-8666-666666666666"),
                field_key="budget",
                severity="critical",
                reason="Confirm the project budget.",
            )
        ],
        evidence_links=[
            WorkspaceValidationEvidence(
                evidence_link_id=UUID("77777777-7777-4777-8777-777777777777"),
                selected_source_label="Budget annex",
                source_location="page 4",
                claim_ref="project budget",
                quote_or_summary="Confirmed total",
            )
        ],
        fingerprint="b" * 64,
    )
    template = ApplicationContextTemplate(
        id=UUID("88888888-8888-4888-8888-888888888888"),
        name="Application",
        chapter_schema=[{"chapter_ref": "chapter-1"}],
        required_fields=["Budget"],
    )

    request = build_chapter_validation_request(context, template=template)

    assert request.target_chapter_id == TARGET_ID
    assert request.chapters[0].template_section_id == "chapter-1"
    assert request.chapters[0].revision_number == 2
    assert request.template is not None
    assert request.template.template_id == template.id
    assert request.open_gaps[0].severity == "critical"
    assert request.evidence_links[0].source_location == "page 4"


async def test_runs_completeness_before_full_document_consistency() -> None:
    calls: list[tuple[str, dict[str, Any]]] = []

    async def run_pass(phase: str, payload: dict[str, Any]) -> Any:
        calls.append((phase, payload))
        if phase == "completeness":
            return _passing_completeness()
        return _passing_consistency()

    request = _request(
        chapters=[
            _chapter(TARGET_ID, position=0),
            _chapter(OTHER_ID, position=1),
            _chapter(THIRD_ID, position=2),
        ]
    )

    decision = await _service(run_pass).validate(request)

    assert [phase for phase, _ in calls] == ["completeness", "consistency"]
    consistency_payload = calls[1][1]
    assert consistency_payload["completeness_result"] == (
        _passing_completeness().model_dump(mode="json")
    )
    assert {
        chapter["chapter_id"] for chapter in consistency_payload["compared_chapters"]
    } == {str(OTHER_ID), str(THIRD_ID)}
    assert decision.status == "ready"
    assert len(decision.checks) == 6


async def test_batches_complete_comparison_chapters_without_truncation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    compared_batches: list[list[dict[str, Any]]] = []

    def fake_count(parts: list[Any], **_: Any) -> TokenCount:
        payload = parts[1]
        if "compared_chapters" not in payload:
            return TokenCount(tokens=100, tokenizer="test")
        tokens = 100 + sum(
            len(chapter["body_markdown"]) for chapter in payload["compared_chapters"]
        )
        return TokenCount(tokens=tokens, tokenizer="test")

    async def run_pass(phase: str, payload: dict[str, Any]) -> Any:
        if phase == "completeness":
            return _passing_completeness()
        compared_batches.append(payload["compared_chapters"])
        return _passing_consistency()

    monkeypatch.setattr(
        "app.services.cnb.chapter_validation.count_prompt_tokens",
        fake_count,
    )
    service = _service(run_pass)
    service._settings.llm.generation.prompt_budget.cnb_validation.max_prompt_tokens = (
        1000
    )
    request = _request(
        chapters=[
            _chapter(TARGET_ID, position=0),
            _chapter(OTHER_ID, position=1, body="A" * 600),
            _chapter(THIRD_ID, position=2, body="B" * 600),
        ]
    )

    await service.validate(request)

    assert len(compared_batches) == 2
    assert [
        chapter["chapter_id"] for batch in compared_batches for chapter in batch
    ] == [str(OTHER_ID), str(THIRD_ID)]
    assert compared_batches[0][0]["body_markdown"] == "A" * 600
    assert compared_batches[1][0]["body_markdown"] == "B" * 600


async def test_rejects_consistency_findings_with_hallucinated_chapter_ids() -> None:
    async def run_pass(phase: str, payload: dict[str, Any]) -> Any:
        if phase == "completeness":
            return _passing_completeness()
        return ChapterConsistencyValidationOutput(
            checks=[
                ChapterValidationPassCheck(
                    key="internal_consistency",
                    status="pass",
                ),
                ChapterValidationPassCheck(
                    key="cross_chapter_consistency",
                    status="fail",
                    message="Conflicting totals",
                ),
            ],
            findings=[
                ChapterValidationFindingDraft(
                    category="cross_chapter_conflict",
                    severity="blocking",
                    message="The totals conflict.",
                    suggested_action="Confirm the correct total.",
                    involved_chapter_ids=[TARGET_ID, UNKNOWN_ID],
                )
            ],
        )

    request = _request(
        chapters=[_chapter(TARGET_ID, position=0), _chapter(OTHER_ID, position=1)]
    )

    with pytest.raises(ChapterValidationModelOutputError):
        await _service(run_pass).validate(request)


async def test_missing_information_can_support_a_template_failure() -> None:
    """Accept one actionable omission when it also violates the template."""

    async def run_pass(phase: str, payload: dict[str, Any]) -> Any:
        if phase == "consistency":
            return _passing_consistency()
        return ChapterCompletenessValidationOutput(
            checks=[
                ChapterValidationPassCheck(
                    key="required_content",
                    status="fail",
                    message="The applicant identity is missing.",
                ),
                ChapterValidationPassCheck(
                    key="template_constraints",
                    status="fail",
                    message="The required applicant field is empty.",
                ),
                ChapterValidationPassCheck(
                    key="evidence_citations",
                    status="pass",
                ),
            ],
            findings=[
                ChapterValidationFindingDraft(
                    category="missing_information",
                    severity="blocking",
                    message="The chapter does not identify the applicant.",
                    suggested_action="Add the applicant's full legal identity.",
                    involved_chapter_ids=[TARGET_ID],
                )
            ],
        )

    decision = await _service(run_pass).validate(_request(evidence=False))

    assert decision.status == "incomplete"
    template_check = next(
        check for check in decision.checks if check.key == "template_constraints"
    )
    assert template_check.status == "fail"
    assert [finding.category for finding in decision.findings] == [
        "missing_information"
    ]


async def test_synthesizes_target_finding_from_a_nonpass_check_summary() -> None:
    """Preserve a useful target-only result when the model omits one finding."""

    async def run_pass(phase: str, payload: dict[str, Any]) -> Any:
        if phase == "consistency":
            return _passing_consistency()
        return ChapterCompletenessValidationOutput(
            checks=[
                ChapterValidationPassCheck(
                    key="required_content",
                    status="pass",
                ),
                ChapterValidationPassCheck(
                    key="template_constraints",
                    status="fail",
                    message="The required applicant section is absent.",
                ),
                ChapterValidationPassCheck(
                    key="evidence_citations",
                    status="pass",
                ),
            ]
        )

    decision = await _service(run_pass).validate(_request(evidence=False))

    assert decision.status == "incomplete"
    assert len(decision.findings) == 1
    finding = decision.findings[0]
    assert finding.category == "template_constraint"
    assert finding.involved_chapter_ids == [TARGET_ID]
    assert finding.message == "The required applicant section is absent."


async def test_rejects_cross_chapter_check_without_related_chapter_finding() -> None:
    """Do not invent a related chapter when a cross-document finding is absent."""

    async def run_pass(phase: str, payload: dict[str, Any]) -> Any:
        if phase == "completeness":
            return _passing_completeness()
        return ChapterConsistencyValidationOutput(
            checks=[
                ChapterValidationPassCheck(
                    key="internal_consistency",
                    status="pass",
                ),
                ChapterValidationPassCheck(
                    key="cross_chapter_consistency",
                    status="fail",
                    message="Another chapter states a different total.",
                ),
            ]
        )

    request = _request(
        chapters=[_chapter(TARGET_ID, position=0), _chapter(OTHER_ID, position=1)]
    )

    with pytest.raises(ChapterValidationModelOutputError):
        await _service(run_pass).validate(request)


async def test_blocking_workspace_gap_overrides_clean_model_result() -> None:
    async def run_pass(phase: str, payload: dict[str, Any]) -> Any:
        return (
            _passing_completeness()
            if phase == "completeness"
            else _passing_consistency()
        )

    request = _request(
        gaps=[
            ChapterValidationGap(
                severity="missing_information",
                reason="Confirm the committed co-financing amount.",
            )
        ],
        evidence=False,
    )

    decision = await _service(run_pass).validate(request)

    assert decision.status == "incomplete"
    checks = {check.key: check.status for check in decision.checks}
    assert checks["blocking_gaps"] == "fail"
    assert checks["evidence_citations"] == "pass"
    assert any(
        finding.category == "missing_information" and finding.severity == "blocking"
        for finding in decision.findings
    )


async def test_missing_evidence_requires_review_but_does_not_block() -> None:
    async def run_pass(phase: str, payload: dict[str, Any]) -> Any:
        if phase == "consistency":
            return _passing_consistency()
        return ChapterCompletenessValidationOutput(
            checks=[
                ChapterValidationPassCheck(
                    key="required_content",
                    status="pass",
                ),
                ChapterValidationPassCheck(
                    key="template_constraints",
                    status="pass",
                ),
                ChapterValidationPassCheck(
                    key="evidence_citations",
                    status="warning",
                    message="The emissions claim has no supporting source.",
                ),
            ],
            findings=[
                ChapterValidationFindingDraft(
                    category="evidence",
                    severity="warning",
                    message="The emissions claim has no supporting source.",
                    suggested_action="Link the calculation supporting the claim.",
                    involved_chapter_ids=[TARGET_ID],
                )
            ],
        )

    decision = await _service(run_pass).validate(_request(evidence=False))

    assert decision.status == "needs_review"
    assert [finding.phase for finding in decision.findings] == ["evidence"]
    assert decision.findings[0].severity == "warning"


async def test_no_evidence_links_can_still_be_ready_without_evidence_deficiency() -> (
    None
):
    """Do not warn solely because a chapter has no persisted evidence links."""

    async def run_pass(phase: str, payload: dict[str, Any]) -> Any:
        return (
            _passing_completeness()
            if phase == "completeness"
            else _passing_consistency()
        )

    decision = await _service(run_pass).validate(_request(evidence=False))

    assert decision.status == "ready"
    assert decision.findings == []


async def test_deduplicates_model_paraphrase_of_persisted_gap() -> None:
    """Surface an authoritative open gap once when the model also recognizes it."""

    async def run_pass(phase: str, payload: dict[str, Any]) -> Any:
        if phase == "consistency":
            return _passing_consistency()
        return ChapterCompletenessValidationOutput(
            checks=[
                ChapterValidationPassCheck(
                    key="required_content",
                    status="fail",
                    message="The committed co-financing amount is missing.",
                ),
                ChapterValidationPassCheck(
                    key="template_constraints",
                    status="pass",
                ),
                ChapterValidationPassCheck(
                    key="evidence_citations",
                    status="pass",
                ),
            ],
            findings=[
                ChapterValidationFindingDraft(
                    category="missing_information",
                    severity="blocking",
                    message="The committed co-financing amount is missing.",
                    suggested_action="Confirm the committed co-financing amount.",
                    involved_chapter_ids=[TARGET_ID],
                ),
                ChapterValidationFindingDraft(
                    category="template_constraint",
                    severity="blocking",
                    message="Confirm the committed co-financing amount.",
                    suggested_action="Complete the matching required template field.",
                    involved_chapter_ids=[TARGET_ID],
                ),
            ],
        )

    request = _request(
        gaps=[
            ChapterValidationGap(
                severity="missing_information",
                reason="Confirm the committed co-financing amount.",
            )
        ]
    )
    decision = await _service(run_pass).validate(request)

    gap_findings = [
        finding
        for finding in decision.findings
        if finding.category == "missing_information"
    ]
    assert len(gap_findings) == 1
    assert gap_findings[0].message == (
        "Open gap: Confirm the committed co-financing amount."
    )
    assert not any(
        finding.category == "template_constraint" for finding in decision.findings
    )


async def test_deduplicates_model_summary_of_multiple_persisted_gaps() -> None:
    """Prefer granular canonical gaps over one redundant model summary."""

    async def run_pass(phase: str, payload: dict[str, Any]) -> Any:
        if phase == "consistency":
            return _passing_consistency()
        return ChapterCompletenessValidationOutput(
            checks=[
                ChapterValidationPassCheck(
                    key="required_content",
                    status="fail",
                    message="Applicant identity and territorial data are absent.",
                ),
                ChapterValidationPassCheck(
                    key="template_constraints",
                    status="pass",
                ),
                ChapterValidationPassCheck(
                    key="evidence_citations",
                    status="pass",
                ),
            ],
            findings=[
                ChapterValidationFindingDraft(
                    category="missing_information",
                    severity="blocking",
                    message=(
                        "Applicant identity, territorial codes, population, and "
                        "contact persons are absent."
                    ),
                    suggested_action=(
                        "Add applicant identity, territorial codes, population, "
                        "and contact persons."
                    ),
                    involved_chapter_ids=[TARGET_ID],
                )
            ],
        )

    request = _request(
        gaps=[
            ChapterValidationGap(
                severity="missing_information",
                reason="Provide applicant identity and contact persons.",
            ),
            ChapterValidationGap(
                severity="missing_information",
                reason="Provide territorial codes and population.",
            ),
        ]
    )
    decision = await _service(run_pass).validate(request)

    gap_findings = [
        finding
        for finding in decision.findings
        if finding.category == "missing_information"
    ]
    assert len(gap_findings) == 2
    assert all(finding.message.startswith("Open gap:") for finding in gap_findings)


async def test_missing_information_is_blocking_even_if_model_marks_warning() -> None:
    async def run_pass(phase: str, payload: dict[str, Any]) -> Any:
        if phase == "consistency":
            return _passing_consistency()
        return ChapterCompletenessValidationOutput(
            checks=[
                ChapterValidationPassCheck(
                    key="required_content",
                    status="warning",
                    message="A date is missing.",
                ),
                ChapterValidationPassCheck(
                    key="template_constraints",
                    status="pass",
                ),
                ChapterValidationPassCheck(
                    key="evidence_citations",
                    status="pass",
                ),
            ],
            findings=[
                ChapterValidationFindingDraft(
                    category="missing_information",
                    severity="warning",
                    message="The implementation start date is missing.",
                    suggested_action="Add the confirmed start date.",
                    involved_chapter_ids=[TARGET_ID],
                )
            ],
        )

    decision = await _service(run_pass).validate(_request())

    assert decision.status == "incomplete"
    assert decision.findings[0].severity == "blocking"
    required_check = next(
        check for check in decision.checks if check.key == "required_content"
    )
    assert required_check.status == "fail"


async def test_template_constraint_failure_is_incomplete() -> None:
    """Map a required template violation to a blocking public result."""

    async def run_pass(phase: str, payload: dict[str, Any]) -> Any:
        if phase == "consistency":
            return _passing_consistency()
        return ChapterCompletenessValidationOutput(
            checks=[
                ChapterValidationPassCheck(
                    key="required_content",
                    status="pass",
                ),
                ChapterValidationPassCheck(
                    key="template_constraints",
                    status="fail",
                    message="The required objective format is not followed.",
                ),
                ChapterValidationPassCheck(
                    key="evidence_citations",
                    status="pass",
                ),
            ],
            findings=[
                ChapterValidationFindingDraft(
                    category="template_constraint",
                    severity="warning",
                    message="The required objective format is not followed.",
                    suggested_action="Add the objective value, unit, and target year.",
                    involved_chapter_ids=[TARGET_ID],
                )
            ],
        )

    decision = await _service(run_pass).validate(_request())

    assert decision.status == "incomplete"
    assert decision.findings[0].severity == "blocking"
    template_check = next(
        check for check in decision.checks if check.key == "template_constraints"
    )
    assert template_check.status == "fail"


async def test_internal_conflict_failure_is_incomplete() -> None:
    """Map a target-only material contradiction in pass two to incomplete."""

    async def run_pass(phase: str, payload: dict[str, Any]) -> Any:
        if phase == "completeness":
            return _passing_completeness()
        return ChapterConsistencyValidationOutput(
            checks=[
                ChapterValidationPassCheck(
                    key="internal_consistency",
                    status="fail",
                    message="The delivery dates contradict each other.",
                ),
                ChapterValidationPassCheck(
                    key="cross_chapter_consistency",
                    status="pass",
                ),
            ],
            findings=[
                ChapterValidationFindingDraft(
                    category="internal_conflict",
                    severity="blocking",
                    message="The chapter gives two incompatible completion dates.",
                    suggested_action="Confirm and use one approved completion date.",
                    involved_chapter_ids=[TARGET_ID],
                )
            ],
        )

    decision = await _service(run_pass).validate(_request())

    assert decision.status == "incomplete"
    assert decision.findings[0].phase == "consistency"
    internal_check = next(
        check for check in decision.checks if check.key == "internal_consistency"
    )
    assert internal_check.status == "fail"


async def test_cross_chapter_conflict_blocks_only_the_target_decision() -> None:
    async def run_pass(phase: str, payload: dict[str, Any]) -> Any:
        if phase == "completeness":
            return _passing_completeness()
        return ChapterConsistencyValidationOutput(
            checks=[
                ChapterValidationPassCheck(
                    key="internal_consistency",
                    status="pass",
                ),
                ChapterValidationPassCheck(
                    key="cross_chapter_consistency",
                    status="fail",
                    message="The project totals conflict.",
                ),
            ],
            findings=[
                ChapterValidationFindingDraft(
                    category="cross_chapter_conflict",
                    severity="blocking",
                    message="The target and budget totals differ.",
                    suggested_action="Use the confirmed total in both chapters.",
                    involved_chapter_ids=[TARGET_ID, OTHER_ID],
                    excerpts=["EUR 4 million", "EUR 5 million"],
                )
            ],
        )

    request = _request(
        chapters=[_chapter(TARGET_ID, position=0), _chapter(OTHER_ID, position=1)]
    )
    decision = await _service(run_pass).validate(request)

    assert decision.target_chapter_id == TARGET_ID
    assert decision.status == "incomplete"
    assert decision.findings[0].phase == "consistency"
    assert decision.findings[0].involved_chapter_ids == [TARGET_ID, OTHER_ID]


@pytest.mark.parametrize(
    (
        "target_title",
        "target_body",
        "compared_chapters",
        "related_chapter_id",
    ),
    [
        (
            "Political commitments",
            POLITICAL_BODY,
            [
                (OTHER_ID, "Proposed investment project", INVESTMENT_BODY),
                (THIRD_ID, "Use of EUCF support", EUCF_SUPPORT_BODY),
            ],
            None,
        ),
        (
            "Applicant",
            APPLICANT_BODY,
            [
                (OTHER_ID, "Proposed investment project", INVESTMENT_BODY),
                (THIRD_ID, "Use of EUCF support", EUCF_SUPPORT_BODY),
            ],
            None,
        ),
        (
            "Proposed investment project",
            INVESTMENT_BODY,
            [
                (OTHER_ID, "Political commitments", POLITICAL_BODY),
                (THIRD_ID, "Use of EUCF support", EUCF_SUPPORT_BODY),
            ],
            THIRD_ID,
        ),
        (
            "Use of EUCF support",
            EUCF_SUPPORT_BODY,
            [
                (OTHER_ID, "Political commitments", POLITICAL_BODY),
                (THIRD_ID, "Proposed investment project", INVESTMENT_BODY),
            ],
            THIRD_ID,
        ),
    ],
)
async def test_scope_conflict_requires_an_explicit_target_claim(
    target_title: str,
    target_body: str,
    compared_chapters: list[tuple[UUID, str, str]],
    related_chapter_id: UUID | None,
) -> None:
    async def run_pass(phase: str, payload: dict[str, Any]) -> Any:
        if phase == "completeness":
            return _passing_completeness()

        assert payload["target_chapter"]["title"] == target_title
        assert {chapter["title"] for chapter in payload["compared_chapters"]} == {
            title for _, title, _ in compared_chapters
        }
        return _passing_consistency()

    target = _chapter(TARGET_ID, position=0, body=target_body).model_copy(
        update={"title": target_title}
    )
    comparisons = [
        _chapter(chapter_id, position=position, body=body).model_copy(
            update={"title": title}
        )
        for position, (chapter_id, title, body) in enumerate(
            compared_chapters,
            start=1,
        )
    ]

    decision = await _service(run_pass).validate(
        _request(chapters=[target, *comparisons])
    )

    cross_check = next(
        check for check in decision.checks if check.key == "cross_chapter_consistency"
    )
    if related_chapter_id is None:
        assert decision.status == "ready"
        assert cross_check.status == "pass"
        assert not any(finding.phase == "consistency" for finding in decision.findings)
    else:
        assert decision.status == "incomplete"
        assert cross_check.status == "fail"
        conflict = next(
            finding
            for finding in decision.findings
            if finding.category == "cross_chapter_conflict"
        )
        assert conflict.involved_chapter_ids == [TARGET_ID, related_chapter_id]


async def test_deterministic_scope_conflict_deduplicates_model_paraphrase() -> None:
    """Prefer the deterministic target-involved finding over the same model issue."""

    async def run_pass(phase: str, payload: dict[str, Any]) -> Any:
        if phase == "completeness":
            return _passing_completeness()
        return ChapterConsistencyValidationOutput(
            checks=[
                ChapterValidationPassCheck(
                    key="internal_consistency",
                    status="pass",
                ),
                ChapterValidationPassCheck(
                    key="cross_chapter_consistency",
                    status="fail",
                    message="The two chapters define incompatible project scope.",
                ),
            ],
            findings=[
                ChapterValidationFindingDraft(
                    category="cross_chapter_conflict",
                    severity="blocking",
                    message=(
                        "The target includes delivery of the current route while "
                        "the related chapter excludes construction works."
                    ),
                    suggested_action=(
                        "Align both chapters on one future residual scope."
                    ),
                    involved_chapter_ids=[TARGET_ID, OTHER_ID],
                )
            ],
        )

    decision = await _service(run_pass).validate(
        _request(
            chapters=[
                _chapter(TARGET_ID, position=0, body=INVESTMENT_BODY),
                _chapter(OTHER_ID, position=1, body=EUCF_SUPPORT_BODY),
            ]
        )
    )

    conflicts = [
        finding
        for finding in decision.findings
        if finding.category == "cross_chapter_conflict"
    ]
    assert len(conflicts) == 1
    assert conflicts[0].excerpts == [
        "The proposed measure is the delivery of the 4.45 km tram route.",
        (
            "EUCF-supported work should focus on clearly defined remaining or "
            "follow-on investment-concept activities rather than on works already "
            "completed, under construction, or being commissioned."
        ),
    ]


async def test_scope_words_without_explicit_claims_do_not_trigger_guard() -> None:
    """Ignore project names, route descriptions, framing, and generic scope words."""

    async def run_pass(phase: str, payload: dict[str, Any]) -> Any:
        return (
            _passing_completeness()
            if phase == "completeness"
            else _passing_consistency()
        )

    decision = await _service(run_pass).validate(
        _request(
            chapters=[
                _chapter(
                    TARGET_ID,
                    position=0,
                    body=(
                        "This investment concept names the tram route and describes "
                        "sustainable delivery governance. Construction terminology "
                        "is used in a background project title."
                    ),
                ),
                _chapter(
                    OTHER_ID,
                    position=1,
                    body=(
                        "The route is a sustainable mobility project. Commissioning "
                        "appears only in the source bibliography."
                    ),
                ),
            ]
        )
    )

    assert decision.status == "ready"
    assert not any(finding.phase == "consistency" for finding in decision.findings)


async def test_deduplicates_repeated_internal_findings_across_batches(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_count(parts: list[Any], **_: Any) -> TokenCount:
        payload = parts[1]
        compared = payload.get("compared_chapters", [])
        return TokenCount(
            tokens=100 if len(compared) <= 1 else 2000,
            tokenizer="test",
        )

    async def run_pass(phase: str, payload: dict[str, Any]) -> Any:
        if phase == "completeness":
            return _passing_completeness()
        return ChapterConsistencyValidationOutput(
            checks=[
                ChapterValidationPassCheck(
                    key="internal_consistency",
                    status="warning",
                    message="The sequence is ambiguous.",
                ),
                ChapterValidationPassCheck(
                    key="cross_chapter_consistency",
                    status="pass",
                ),
            ],
            findings=[
                ChapterValidationFindingDraft(
                    category="logic_error",
                    severity="warning",
                    message="The delivery sequence is ambiguous.",
                    suggested_action="Clarify which activity occurs first.",
                    involved_chapter_ids=[TARGET_ID],
                )
            ],
        )

    monkeypatch.setattr(
        "app.services.cnb.chapter_validation.count_prompt_tokens",
        fake_count,
    )
    service = _service(run_pass)
    service._settings.llm.generation.prompt_budget.cnb_validation.max_prompt_tokens = (
        1000
    )
    request = _request(
        chapters=[
            _chapter(TARGET_ID, position=0),
            _chapter(OTHER_ID, position=1),
            _chapter(THIRD_ID, position=2),
        ]
    )

    decision = await service.validate(request)

    assert decision.status == "needs_review"
    assert len(decision.findings) == 1


async def test_rejects_indivisible_oversized_input_without_calling_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = 0

    def oversized(*_: Any, **__: Any) -> TokenCount:
        return TokenCount(tokens=100_000, tokenizer="test")

    async def run_pass(phase: str, payload: dict[str, Any]) -> Any:
        nonlocal calls
        calls += 1
        return _passing_completeness()

    monkeypatch.setattr(
        "app.services.cnb.chapter_validation.count_prompt_tokens",
        oversized,
    )

    with pytest.raises(ChapterValidationInputTooLargeError):
        await _service(run_pass).validate(_request())

    assert calls == 0


async def test_provider_failure_returns_no_persistence_ready_decision() -> None:
    async def run_pass(phase: str, payload: dict[str, Any]) -> Any:
        raise RuntimeError("provider unavailable")

    with pytest.raises(ChapterValidationError) as exc_info:
        await _service(run_pass).validate(_request())

    assert exc_info.value.code == "chapter_validation_failed"


async def test_empty_chapter_short_circuits_to_incomplete() -> None:
    calls = 0

    async def run_pass(phase: str, payload: dict[str, Any]) -> Any:
        nonlocal calls
        calls += 1
        return _passing_completeness()

    request = _request(
        chapters=[_chapter(TARGET_ID, position=0, body=None)],
        gaps=[
            ChapterValidationGap(
                severity="critical",
                reason="Confirm the required budget.",
            )
        ],
    )

    decision = await _service(run_pass).validate(request)

    assert calls == 0
    assert decision.status == "incomplete"
    assert decision.validated_revision_number is None
    assert decision.findings[0].category == "missing_information"
    assert any(finding.category == "unresolved_gap" for finding in decision.findings)
    checks = {check.key: check.status for check in decision.checks}
    assert checks["blocking_gaps"] == "fail"
    assert checks["evidence_citations"] == "pass"


async def test_empty_optional_chapter_is_non_blocking_missing_information() -> None:
    calls = 0

    async def run_pass(phase: str, payload: dict[str, Any]) -> Any:
        nonlocal calls
        calls += 1
        return _passing_completeness()

    decision = await _service(run_pass).validate(
        _request(
            chapters=[
                _chapter(
                    TARGET_ID,
                    position=0,
                    body=None,
                    required=False,
                )
            ],
            target_required=False,
        )
    )

    assert calls == 0
    assert decision.status == "needs_review"
    assert decision.findings[0].category == "missing_information"
    assert decision.findings[0].severity == "warning"
    checks = {check.key: check.status for check in decision.checks}
    assert checks["required_content"] == "warning"
