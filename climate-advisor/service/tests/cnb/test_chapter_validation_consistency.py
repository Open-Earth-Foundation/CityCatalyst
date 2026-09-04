import pytest
from tests.cnb.chapter_validation_helpers import (
    OTHER_ID,
    TARGET_ID,
    chapter,
    consistency,
    finding,
    request,
    service,
    static_passes,
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
    ("target_body", "related_body", "expected_status"),
    [
        ("The project supports sustainable mobility.", INVESTMENT_BODY, "ready"),
        (INVESTMENT_BODY, EUCF_SUPPORT_BODY, "incomplete"),
    ],
)
async def test_scope_guard_requires_explicit_incompatible_claims(
    target_body: str,
    related_body: str,
    expected_status: str,
) -> None:
    decision = await service(static_passes()).validate(
        request(
            chapters=[
                chapter(TARGET_ID, position=0, body=target_body),
                chapter(OTHER_ID, position=1, body=related_body),
            ]
        )
    )

    assert decision.status == expected_status


async def test_deterministic_scope_conflict_deduplicates_model_paraphrase() -> None:
    model_result = consistency(
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
    decision = await service(static_passes(consistency_result=model_result)).validate(
        request(
            chapters=[
                chapter(TARGET_ID, position=0, body=INVESTMENT_BODY),
                chapter(OTHER_ID, position=1, body=EUCF_SUPPORT_BODY),
            ]
        )
    )

    conflicts = [
        item for item in decision.findings if item.category == "cross_chapter_conflict"
    ]
    assert len(conflicts) == 1
    assert conflicts[0].excerpts
