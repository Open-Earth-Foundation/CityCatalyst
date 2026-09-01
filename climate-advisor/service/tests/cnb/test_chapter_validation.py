from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from app.models.cnb.concept_note_application_context import ApplicationContextTemplate
from app.models.cnb.concept_note_chapter_validation import ChapterValidationGap
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
    build_chapter_validation_request,
)
from app.utils.prompt_budget import TokenCount
from tests.cnb.chapter_validation_helpers import (
    OTHER_ID,
    TARGET_ID,
    THIRD_ID,
    UNKNOWN_ID,
    chapter as _chapter,
    check as _check,
    completeness as _completeness,
    consistency as _consistency,
    finding as _finding,
    request as _request,
    service as _service,
    static_passes as _static_passes,
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
            return _completeness()
        return _consistency()

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
        _completeness().model_dump(mode="json")
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
            return _completeness()
        compared_batches.append(payload["compared_chapters"])
        return _consistency()

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
    consistency = _consistency(
        cross_chapter=_check(
            "cross_chapter_consistency", "fail", "Conflicting totals"
        ),
        findings=[
            _finding(
                "cross_chapter_conflict",
                "The totals conflict.",
                "Confirm the correct total.",
                chapter_ids=[TARGET_ID, UNKNOWN_ID],
            )
        ],
    )

    request = _request(
        chapters=[_chapter(TARGET_ID, position=0), _chapter(OTHER_ID, position=1)]
    )

    with pytest.raises(ChapterValidationModelOutputError):
        await _service(_static_passes(consistency_result=consistency)).validate(request)


async def test_missing_information_can_support_a_template_failure() -> None:
    """Accept one actionable omission when it also violates the template."""

    completeness = _completeness(
        required=_check(
            "required_content", "fail", "The applicant identity is missing."
        ),
        template=_check(
            "template_constraints",
            "fail",
            "The required applicant field is empty.",
        ),
        findings=[
            _finding(
                "missing_information",
                "The chapter does not identify the applicant.",
                "Add the applicant's full legal identity.",
            )
        ],
    )

    decision = await _service(
        _static_passes(completeness_result=completeness)
    ).validate(
        _request(evidence=False)
    )

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

    completeness = _completeness(
        template=_check(
            "template_constraints",
            "fail",
            "The required applicant section is absent.",
        )
    )

    decision = await _service(
        _static_passes(completeness_result=completeness)
    ).validate(
        _request(evidence=False)
    )

    assert decision.status == "incomplete"
    assert len(decision.findings) == 1
    finding = decision.findings[0]
    assert finding.category == "template_constraint"
    assert finding.involved_chapter_ids == [TARGET_ID]
    assert finding.message == "The required applicant section is absent."


async def test_rejects_cross_chapter_check_without_related_chapter_finding() -> None:
    """Do not invent a related chapter when a cross-document finding is absent."""

    consistency = _consistency(
        cross_chapter=_check(
            "cross_chapter_consistency",
            "fail",
            "Another chapter states a different total.",
        )
    )

    request = _request(
        chapters=[_chapter(TARGET_ID, position=0), _chapter(OTHER_ID, position=1)]
    )

    with pytest.raises(ChapterValidationModelOutputError):
        await _service(_static_passes(consistency_result=consistency)).validate(request)


async def test_blocking_workspace_gap_overrides_clean_model_result() -> None:
    request = _request(
        gaps=[
            ChapterValidationGap(
                severity="missing_information",
                reason="Confirm the committed co-financing amount.",
            )
        ],
        evidence=False,
    )

    decision = await _service(_static_passes()).validate(request)

    assert decision.status == "incomplete"
    checks = {check.key: check.status for check in decision.checks}
    assert checks["blocking_gaps"] == "fail"
    assert checks["evidence_citations"] == "pass"
    assert any(
        finding.category == "missing_information" and finding.severity == "blocking"
        for finding in decision.findings
    )


async def test_missing_evidence_requires_review_but_does_not_block() -> None:
    completeness = _completeness(
        evidence=_check(
            "evidence_citations",
            "warning",
            "The emissions claim has no supporting source.",
        ),
        findings=[
            _finding(
                "evidence",
                "The emissions claim has no supporting source.",
                "Link the calculation supporting the claim.",
                severity="warning",
            )
        ],
    )

    decision = await _service(
        _static_passes(completeness_result=completeness)
    ).validate(
        _request(evidence=False)
    )

    assert decision.status == "needs_review"
    assert [finding.phase for finding in decision.findings] == ["evidence"]
    assert decision.findings[0].severity == "warning"


async def test_no_evidence_links_can_still_be_ready_without_evidence_deficiency() -> (
    None
):
    """Do not warn solely because a chapter has no persisted evidence links."""

    decision = await _service(_static_passes()).validate(_request(evidence=False))

    assert decision.status == "ready"
    assert decision.findings == []


async def test_deduplicates_model_paraphrase_of_persisted_gap() -> None:
    """Surface an authoritative open gap once when the model also recognizes it."""

    completeness = _completeness(
        required=_check(
            "required_content",
            "fail",
            "The committed co-financing amount is missing.",
        ),
        findings=[
            _finding(
                "missing_information",
                "The committed co-financing amount is missing.",
                "Confirm the committed co-financing amount.",
            ),
            _finding(
                "template_constraint",
                "Confirm the committed co-financing amount.",
                "Complete the matching required template field.",
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
    decision = await _service(
        _static_passes(completeness_result=completeness)
    ).validate(
        request
    )

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

    completeness = _completeness(
        required=_check(
            "required_content",
            "fail",
            "Applicant identity and territorial data are absent.",
        ),
        findings=[
            _finding(
                "missing_information",
                "Applicant identity, territorial codes, population, and contact "
                "persons are absent.",
                "Add applicant identity, territorial codes, population, and "
                "contact persons.",
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
    decision = await _service(
        _static_passes(completeness_result=completeness)
    ).validate(
        request
    )

    gap_findings = [
        finding
        for finding in decision.findings
        if finding.category == "missing_information"
    ]
    assert len(gap_findings) == 2
    assert all(finding.message.startswith("Open gap:") for finding in gap_findings)


async def test_missing_information_is_blocking_even_if_model_marks_warning() -> None:
    completeness = _completeness(
        required=_check("required_content", "warning", "A date is missing."),
        findings=[
            _finding(
                "missing_information",
                "The implementation start date is missing.",
                "Add the confirmed start date.",
                severity="warning",
            )
        ],
    )

    decision = await _service(
        _static_passes(completeness_result=completeness)
    ).validate(
        _request()
    )

    assert decision.status == "incomplete"
    assert decision.findings[0].severity == "blocking"
    required_check = next(
        check for check in decision.checks if check.key == "required_content"
    )
    assert required_check.status == "fail"


async def test_template_constraint_failure_is_incomplete() -> None:
    """Map a required template violation to a blocking public result."""

    completeness = _completeness(
        template=_check(
            "template_constraints",
            "fail",
            "The required objective format is not followed.",
        ),
        findings=[
            _finding(
                "template_constraint",
                "The required objective format is not followed.",
                "Add the objective value, unit, and target year.",
                severity="warning",
            )
        ],
    )

    decision = await _service(
        _static_passes(completeness_result=completeness)
    ).validate(
        _request()
    )

    assert decision.status == "incomplete"
    assert decision.findings[0].severity == "blocking"
    template_check = next(
        check for check in decision.checks if check.key == "template_constraints"
    )
    assert template_check.status == "fail"


async def test_internal_conflict_failure_is_incomplete() -> None:
    """Map a target-only material contradiction in pass two to incomplete."""

    consistency = _consistency(
        internal=_check(
            "internal_consistency",
            "fail",
            "The delivery dates contradict each other.",
        ),
        findings=[
            _finding(
                "internal_conflict",
                "The chapter gives two incompatible completion dates.",
                "Confirm and use one approved completion date.",
            )
        ],
    )

    decision = await _service(_static_passes(consistency_result=consistency)).validate(
        _request()
    )

    assert decision.status == "incomplete"
    assert decision.findings[0].phase == "consistency"
    internal_check = next(
        check for check in decision.checks if check.key == "internal_consistency"
    )
    assert internal_check.status == "fail"


async def test_cross_chapter_conflict_blocks_only_the_target_decision() -> None:
    consistency = _consistency(
        cross_chapter=_check(
            "cross_chapter_consistency", "fail", "The project totals conflict."
        ),
        findings=[
            _finding(
                "cross_chapter_conflict",
                "The target and budget totals differ.",
                "Use the confirmed total in both chapters.",
                chapter_ids=[TARGET_ID, OTHER_ID],
                excerpts=["EUR 4 million", "EUR 5 million"],
            )
        ],
    )

    request = _request(
        chapters=[_chapter(TARGET_ID, position=0), _chapter(OTHER_ID, position=1)]
    )
    decision = await _service(
        _static_passes(consistency_result=consistency)
    ).validate(request)

    assert decision.target_chapter_id == TARGET_ID
    assert decision.status == "incomplete"
    assert decision.findings[0].phase == "consistency"
    assert decision.findings[0].involved_chapter_ids == [TARGET_ID, OTHER_ID]


async def test_rejects_indivisible_oversized_input_without_calling_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def oversized(*_: Any, **__: Any) -> TokenCount:
        return TokenCount(tokens=100_000, tokenizer="test")

    run_pass = AsyncMock(return_value=_completeness())
    monkeypatch.setattr(
        "app.services.cnb.chapter_validation.count_prompt_tokens",
        oversized,
    )

    with pytest.raises(ChapterValidationInputTooLargeError):
        await _service(run_pass).validate(_request())

    run_pass.assert_not_awaited()


async def test_provider_failure_returns_no_persistence_ready_decision() -> None:
    run_pass = AsyncMock(side_effect=RuntimeError("provider unavailable"))

    with pytest.raises(ChapterValidationError) as exc_info:
        await _service(run_pass).validate(_request())

    assert exc_info.value.code == "chapter_validation_failed"


async def test_empty_chapter_short_circuits_to_incomplete() -> None:
    run_pass = AsyncMock(return_value=_completeness())
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

    run_pass.assert_not_awaited()
    assert decision.status == "incomplete"
    assert decision.validated_revision_number is None
    assert decision.findings[0].category == "missing_information"
    assert any(finding.category == "unresolved_gap" for finding in decision.findings)
    checks = {check.key: check.status for check in decision.checks}
    assert checks["blocking_gaps"] == "fail"
    assert checks["evidence_citations"] == "pass"


async def test_empty_optional_chapter_is_non_blocking_missing_information() -> None:
    run_pass = AsyncMock(return_value=_completeness())

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

    run_pass.assert_not_awaited()
    assert decision.status == "needs_review"
    assert decision.findings[0].category == "missing_information"
    assert decision.findings[0].severity == "warning"
    checks = {check.key: check.status for check in decision.checks}
    assert checks["required_content"] == "warning"
