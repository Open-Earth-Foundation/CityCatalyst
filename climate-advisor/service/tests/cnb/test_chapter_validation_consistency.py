"""Focused tests for deterministic and model-reported consistency findings."""

from typing import Any
from uuid import UUID

import pytest
from app.utils.prompt_budget import TokenCount

from tests.cnb.chapter_validation_helpers import (
    OTHER_ID,
    TARGET_ID,
    THIRD_ID,
    chapter,
    check,
    completeness,
    consistency,
    finding,
    request,
    service,
    static_passes,
)

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


@pytest.mark.parametrize(
    ("target_title", "target_body", "compared_chapters", "related_chapter_id"),
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
            return completeness()

        assert payload["target_chapter"]["title"] == target_title
        assert {item["title"] for item in payload["compared_chapters"]} == {
            title for _, title, _ in compared_chapters
        }
        return consistency()

    target = chapter(TARGET_ID, position=0, body=target_body).model_copy(
        update={"title": target_title}
    )
    comparisons = [
        chapter(chapter_id, position=position, body=body).model_copy(
            update={"title": title}
        )
        for position, (chapter_id, title, body) in enumerate(
            compared_chapters, start=1
        )
    ]

    decision = await service(run_pass).validate(
        request(chapters=[target, *comparisons])
    )
    cross_check = next(
        item for item in decision.checks if item.key == "cross_chapter_consistency"
    )

    if related_chapter_id is None:
        assert decision.status == "ready"
        assert cross_check.status == "pass"
        assert not any(item.phase == "consistency" for item in decision.findings)
        return

    assert decision.status == "incomplete"
    assert cross_check.status == "fail"
    conflict = next(
        item
        for item in decision.findings
        if item.category == "cross_chapter_conflict"
    )
    assert conflict.involved_chapter_ids == [TARGET_ID, related_chapter_id]


async def test_deterministic_scope_conflict_deduplicates_model_paraphrase() -> None:
    model_result = consistency(
        cross_chapter=check(
            "cross_chapter_consistency",
            "fail",
            "The two chapters define incompatible project scope.",
        ),
        findings=[
            finding(
                "cross_chapter_conflict",
                "The target includes delivery of the current route while the related "
                "chapter excludes construction works.",
                "Align both chapters on one future residual scope.",
                chapter_ids=[TARGET_ID, OTHER_ID],
            )
        ],
    )
    decision = await service(
        static_passes(consistency_result=model_result)
    ).validate(
        request(
            chapters=[
                chapter(TARGET_ID, position=0, body=INVESTMENT_BODY),
                chapter(OTHER_ID, position=1, body=EUCF_SUPPORT_BODY),
            ]
        )
    )

    conflicts = [
        item
        for item in decision.findings
        if item.category == "cross_chapter_conflict"
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
    decision = await service(static_passes()).validate(
        request(
            chapters=[
                chapter(
                    TARGET_ID,
                    position=0,
                    body=(
                        "This investment concept names the tram route and describes "
                        "sustainable delivery governance. Construction terminology "
                        "is used in a background project title."
                    ),
                ),
                chapter(
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
    assert not any(item.phase == "consistency" for item in decision.findings)


async def test_deduplicates_repeated_internal_findings_across_batches(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_count(parts: list[Any], **_: Any) -> TokenCount:
        compared = parts[1].get("compared_chapters", [])
        return TokenCount(
            tokens=100 if len(compared) <= 1 else 2000,
            tokenizer="test",
        )

    model_result = consistency(
        internal=check(
            "internal_consistency", "warning", "The sequence is ambiguous."
        ),
        findings=[
            finding(
                "logic_error",
                "The delivery sequence is ambiguous.",
                "Clarify which activity occurs first.",
                severity="warning",
            )
        ],
    )
    monkeypatch.setattr(
        "app.services.cnb.chapter_validation.count_prompt_tokens", fake_count
    )
    validation_service = service(
        static_passes(consistency_result=model_result)
    )
    prompt_budget = validation_service._settings.llm.generation.prompt_budget
    prompt_budget.cnb_validation.max_prompt_tokens = 1000

    decision = await validation_service.validate(
        request(
            chapters=[
                chapter(TARGET_ID, position=0),
                chapter(OTHER_ID, position=1),
                chapter(THIRD_ID, position=2),
            ]
        )
    )

    assert decision.status == "needs_review"
    assert len(decision.findings) == 1
