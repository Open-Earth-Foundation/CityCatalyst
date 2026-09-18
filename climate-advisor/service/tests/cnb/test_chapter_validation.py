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
    ChapterValidationTemplateError,
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
        chapter_schema=[{"chapter_ref": "chapter-1", "required_fields": ["Budget"]}],
        required_fields=["Budget"],
    )

    built = build_chapter_validation_request(context, template=template)

    assert built.chapters[0].revision_number == 2
    assert built.template and built.template.template_id == template.id
    assert built.template.chapter_schema[0]["required_fields"] == ["Budget"]
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
    assert {item["chapter_id"] for item in calls[1][1]["document"]["chapters"]} == {
        str(OTHER_ID),
        str(THIRD_ID),
    }
    assert calls[0][1]["output"]["chapter_id"] == str(TARGET_ID)
    assert calls[1][1]["output"]["chapter_id"] == str(TARGET_ID)
    assert calls[0][1]["document"]["evidence_links"][0]["position"] == 1
    assert calls[1][1]["document"]["evidence_links"][0]["position"] == 1
    assert decision.status == "ready"


async def test_completeness_receives_only_selected_schema_and_associated_fields() -> (
    None
):
    validation_request = request()
    template = validation_request.template
    assert template is not None
    template.chapter_schema = [
        {
            "chapter_ref": "other",
            "title": "Chapter 1",
            "required_fields": ["Budget", "Project name"],
            "description": "Unrelated budget instructions",
        },
        {
            "chapter_ref": "chapter-1",
            "title": "Timetable",
            "description": "Explain delivery milestones.",
            "required": True,
            "required_fields": ["Implementation timetable", "Project name"],
            "word_limit": 200,
        },
    ]
    template.required_fields = ["Budget", "Implementation timetable", "Project name"]
    before = template.model_dump()
    calls: list[dict[str, Any]] = []

    async def run_pass(phase: str, payload: dict[str, Any]) -> Any:
        if phase == "completeness":
            calls.append(payload)
            return completeness()
        return consistency()

    await service(run_pass).validate(validation_request)

    assert calls[0]["document"]["validation_profile"] == {
        "name": "Application template",
        "output_format": None,
        "chapter_schema": {
            "title": "Timetable",
            "description": "Explain delivery milestones.",
            "required": True,
            "word_limit": 200,
        },
        "required_fields": ["Implementation timetable", "Project name"],
    }
    assert "template" not in calls[0]["document"]
    assert template.model_dump() == before


@pytest.mark.parametrize(
    "schema",
    [
        [],
        [{"chapter_ref": "wrong", "required_fields": ["Implementation timetable"]}],
        [{"chapter_ref": "chapter-1"}, {"chapter_ref": " chapter-1 "}],
        [{"chapter_ref": "chapter-1"}],
        [{"chapter_ref": "chapter-1", "required_fields": []}],
        [{"chapter_ref": "chapter-1", "required_fields": None}],
        [{"chapter_ref": "chapter-1", "required_fields": "Implementation timetable"}],
        [{"chapter_ref": "chapter-1", "required_fields": [123]}],
        [{"chapter_ref": "chapter-1", "required_fields": [" "]}],
    ],
    ids=[
        "empty",
        "no-match",
        "duplicate",
        "legacy-flat",
        "unassigned",
        "null",
        "string",
        "number",
        "blank",
    ],
)
async def test_invalid_template_never_calls_model(schema: list[dict[str, Any]]) -> None:
    validation_request = request()
    assert validation_request.template is not None
    validation_request.template.chapter_schema = schema
    run_pass = AsyncMock()

    with pytest.raises(ChapterValidationTemplateError) as error:
        await service(run_pass).validate(validation_request)

    assert error.value.code == "chapter_validation_template_invalid"
    assert error.value.status_code == 409
    run_pass.assert_not_awaited()


@pytest.mark.parametrize("chapter_ref", [None, " chapter-1 "])
async def test_selection_uses_the_same_reference_normalization_as_workspace(
    chapter_ref: str | None,
) -> None:
    validation_request = request()
    assert validation_request.template is not None
    schema = validation_request.template.chapter_schema[0]
    if chapter_ref is None:
        schema.pop("chapter_ref")
    else:
        schema["chapter_ref"] = chapter_ref

    assert (
        await service(static_passes()).validate(validation_request)
    ).status == "ready"


async def test_chapter_without_fields_does_not_inherit_other_chapters_requirements() -> (
    None
):
    validation_request = request()
    assert validation_request.template is not None
    validation_request.template.chapter_schema = [
        {"chapter_ref": "chapter-1", "required_fields": []},
        {"chapter_ref": "other", "required_fields": ["Implementation timetable"]},
    ]

    async def run_pass(phase: str, payload: dict[str, Any]) -> Any:
        if phase == "completeness":
            assert payload["document"]["validation_profile"]["required_fields"] == []
            return completeness()
        return consistency()

    await service(run_pass).validate(validation_request)


async def test_no_template_preserves_template_free_validation() -> None:
    validation_request = request()
    validation_request.template = None

    async def run_pass(phase: str, payload: dict[str, Any]) -> Any:
        if phase == "completeness":
            assert payload["document"]["validation_profile"] is None
            return completeness()
        return consistency()

    await service(run_pass).validate(validation_request)


async def test_resolves_model_evidence_positions_to_public_source_metadata() -> None:
    model_result = completeness(
        findings=[
            finding(
                "evidence",
                "The stated start date conflicts with the delivery plan.",
                "Confirm the approved start date.",
                severity="warning",
                evidence_positions=[1],
            )
        ]
    )
    validation_request = request()
    validation_request.evidence_links[0] = validation_request.evidence_links[
        0
    ].model_copy(
        update={
            "source_location": "page 7",
            "claim_ref": "implementation start date",
            "quote_or_summary": "Works begin in March 2027.",
        }
    )

    decision = await service(static_passes(completeness_result=model_result)).validate(
        validation_request
    )

    assert decision.findings[0].phase == "evidence"
    assert decision.findings[0].evidence[0].selected_source_label == "City climate plan"
    assert decision.findings[0].evidence[0].source_location == "page 7"
    assert decision.findings[0].evidence[0].claim_ref == "implementation start date"


async def test_rejects_model_reference_to_unavailable_evidence() -> None:
    model_result = completeness(
        findings=[
            finding(
                "evidence",
                "The date conflicts with a source.",
                "Confirm the date.",
                severity="warning",
                evidence_positions=[2],
            )
        ]
    )

    with pytest.raises(ChapterValidationModelOutputError):
        await service(static_passes(completeness_result=model_result)).validate(
            request()
        )


async def test_batches_complete_document_chapters_without_truncation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    batches: list[list[dict[str, Any]]] = []

    def fake_count(parts: list[Any], **_: Any) -> TokenCount:
        document_chapters = parts[1].get("document", {}).get("chapters", [])
        return TokenCount(
            tokens=100 + sum(len(item["body_markdown"]) for item in document_chapters),
            tokenizer="test",
        )

    async def run_pass(phase: str, payload: dict[str, Any]) -> Any:
        if phase == "completeness":
            return completeness()
        batches.append(payload["document"]["chapters"])
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
