from typing import Any

from tests.cnb.chapter_validation_helpers import (
    OTHER_ID,
    TARGET_ID,
    chapter,
    completeness,
    consistency,
    finding,
    request,
    service,
    static_passes,
)

OUTPUT_BODY = "The total project cost is EUR 4 million."
DOCUMENT_BODY = "Total eligible expenditure: EUR 5 million."


async def test_consistency_pass_verifies_output_against_document() -> None:
    observed: dict[str, Any] = {}

    async def run_pass(phase: str, payload: dict[str, Any]) -> Any:
        if phase == "completeness":
            return completeness()
        observed.update(payload)
        return consistency(
            findings=[
                finding(
                    "cross_chapter_conflict",
                    "The output total conflicts with the document budget.",
                    "Confirm and use one approved total.",
                    chapter_ids=[TARGET_ID, OTHER_ID],
                )
            ]
        )

    decision = await service(run_pass).validate(
        request(
            chapters=[
                chapter(TARGET_ID, position=0, body=OUTPUT_BODY),
                chapter(OTHER_ID, position=1, body=DOCUMENT_BODY),
            ]
        )
    )

    assert observed["output"]["body_markdown"] == OUTPUT_BODY
    assert observed["document"]["chapters"][0]["body_markdown"] == DOCUMENT_BODY
    assert decision.status == "incomplete"


async def test_service_does_not_apply_program_specific_scope_rules() -> None:
    decision = await service(static_passes()).validate(
        request(
            chapters=[
                chapter(
                    TARGET_ID,
                    position=0,
                    body=(
                        "The proposed measure is delivery of the route. Construction "
                        "is 97% complete and commissioning is underway."
                    ),
                ),
                chapter(
                    OTHER_ID,
                    position=1,
                    body=(
                        "The programme document excludes ongoing construction and "
                        "commissioning."
                    ),
                ),
            ]
        )
    )

    assert decision.status == "ready"
    assert decision.findings == []
