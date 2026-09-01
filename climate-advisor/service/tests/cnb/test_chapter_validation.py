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
    chapter,
    completeness,
    consistency,
    finding,
    request,
    service,
    static_passes,
)


def test_builds_request_from_repository_snapshot() -> None:
    target = WorkspaceValidationChapter(
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
    context = WorkspaceValidationContext(
        target=target,
        chapters=[target],
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

    built = build_chapter_validation_request(context, template=template)

    assert built.chapters[0].revision_number == 2
    assert built.template and built.template.template_id == template.id
    assert built.open_gaps[0].severity == "critical"
    assert built.evidence_links[0].source_location == "page 4"


async def test_runs_completeness_before_document_consistency() -> None:
    calls: list[tuple[str, dict[str, Any]]] = []

    async def run_pass(phase: str, payload: dict[str, Any]) -> Any:
        calls.append((phase, payload))
        return completeness() if phase == "completeness" else consistency()

    decision = await service(run_pass).validate(
        request(
            chapters=[
                chapter(TARGET_ID, position=0),
                chapter(OTHER_ID, position=1),
                chapter(THIRD_ID, position=2),
            ]
        )
    )

    assert [phase for phase, _ in calls] == ["completeness", "consistency"]
    assert {item["chapter_id"] for item in calls[1][1]["compared_chapters"]} == {
        str(OTHER_ID),
        str(THIRD_ID),
    }
    assert decision.status == "ready"


async def test_batches_complete_comparison_chapters_without_truncation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    batches: list[list[dict[str, Any]]] = []

    def fake_count(parts: list[Any], **_: Any) -> TokenCount:
        compared = parts[1].get("compared_chapters", [])
        return TokenCount(
            tokens=100 + sum(len(item["body_markdown"]) for item in compared),
            tokenizer="test",
        )

    async def run_pass(phase: str, payload: dict[str, Any]) -> Any:
        if phase == "completeness":
            return completeness()
        batches.append(payload["compared_chapters"])
        return consistency()

    monkeypatch.setattr(
        "app.services.cnb.chapter_validation.count_prompt_tokens", fake_count
    )
    validation_service = service(run_pass)
    budget = validation_service._settings.llm.generation.prompt_budget.cnb_validation
    budget.max_prompt_tokens = 1000

    await validation_service.validate(
        request(
            chapters=[
                chapter(TARGET_ID, position=0),
                chapter(OTHER_ID, position=1, body="A" * 600),
                chapter(THIRD_ID, position=2, body="B" * 600),
            ]
        )
    )

    assert [[item["chapter_id"] for item in batch] for batch in batches] == [
        [str(OTHER_ID)],
        [str(THIRD_ID)],
    ]


async def test_rejects_hallucinated_chapter_ids() -> None:
    model_result = consistency(
        findings=[
            finding(
                "cross_chapter_conflict",
                "The totals conflict.",
                "Confirm the total.",
                chapter_ids=[TARGET_ID, UNKNOWN_ID],
            )
        ],
    )

    with pytest.raises(ChapterValidationModelOutputError):
        await service(static_passes(consistency_result=model_result)).validate(
            request(
                chapters=[
                    chapter(TARGET_ID, position=0),
                    chapter(OTHER_ID, position=1),
                ]
            )
        )


async def test_authoritative_gap_blocks_a_clean_model_result() -> None:
    decision = await service(static_passes()).validate(
        request(
            gaps=[
                ChapterValidationGap(
                    severity="missing_information",
                    reason="Confirm the co-financing amount.",
                )
            ],
            evidence=False,
        )
    )

    assert decision.status == "incomplete"
    assert any(item.category == "missing_information" for item in decision.findings)


async def test_rejects_oversized_input_before_calling_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    run_pass = AsyncMock(return_value=completeness())
    monkeypatch.setattr(
        "app.services.cnb.chapter_validation.count_prompt_tokens",
        lambda *_args, **_kwargs: TokenCount(tokens=100_000, tokenizer="test"),
    )

    with pytest.raises(ChapterValidationInputTooLargeError):
        await service(run_pass).validate(request())
    run_pass.assert_not_awaited()


async def test_provider_failure_returns_stable_error() -> None:
    run_pass = AsyncMock(side_effect=RuntimeError("provider unavailable"))
    with pytest.raises(ChapterValidationError) as exc_info:
        await service(run_pass).validate(request())
    assert exc_info.value.code == "chapter_validation_failed"


@pytest.mark.parametrize(
    ("required", "expected_status", "expected_severity"),
    [(True, "incomplete", "blocking"), (False, "needs_review", "warning")],
)
async def test_empty_chapter_short_circuits_by_required_state(
    required: bool,
    expected_status: str,
    expected_severity: str,
) -> None:
    run_pass = AsyncMock(return_value=completeness())
    decision = await service(run_pass).validate(
        request(
            chapters=[chapter(TARGET_ID, position=0, body=None, required=required)],
            target_required=required,
        )
    )

    run_pass.assert_not_awaited()
    assert decision.status == expected_status
    assert decision.findings[0].severity == expected_severity
