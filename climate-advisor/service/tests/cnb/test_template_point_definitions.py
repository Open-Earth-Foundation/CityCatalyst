"""Extraction receives the form author's field and section instructions."""

import json
from uuid import UUID

from app.models.cnb.concept_note_application_context import ApplicationContextTemplate
from app.services.document_workspace.catalogue import (
    setup_catalogue,
    template_from_setup,
)
from app.services.document_workspace.requirements import (
    fingerprint,
    template_definitions,
)


def test_registered_fields_identify_the_subject_from_their_own_form_section():
    setup = setup_catalogue()["eucf"]
    definitions = {
        item["key"]: item for item in template_definitions(template_from_setup(setup))
    }
    for chapter in setup["chapters"]:
        for field in chapter["required_fields"]:
            point = definitions[field["key"]]
            assert point["description"] == field["description"]
            assert {
                "chapter_ref": chapter["chapter_ref"],
                "title": chapter["title"],
                "description": chapter["description"],
            } in point["section_context"]


def test_shared_and_legacy_fields_keep_their_own_scope_and_omit_examples():
    template_id = UUID("00000000-0000-0000-0000-000000000001")
    template = ApplicationContextTemplate(
        id=template_id,
        name="Example equipment grant",
        chapter_schema=[
            {
                "title": "Planned purchase",
                "description": "Equipment the applicant proposes to buy.",
                "example_answer": "example-only text",
                "required_fields": [
                    "Budget",
                    {
                        "key": "buyer",
                        "label": "Buyer",
                        "description": "Organisation making the purchase.",
                        "default": "example-only text",
                    },
                ],
            },
            {
                "chapter_ref": " reporting ",
                "title": "Reporting",
                "required_fields": [
                    {
                        "key": "buyer",
                        "label": "Buyer",
                        "description": "Name of that organisation for reporting.",
                    },
                ],
            },
        ],
        required_fields=["Budget", "Language"],
    )
    points = {point["label"]: point for point in template_definitions(template)}
    assert set(points) == {"Buyer", "Budget", "Language"}
    buyer = points["Buyer"]
    assert buyer["key"] == "buyer"
    assert buyer["chapter_refs"] == ["chapter-1", "reporting"]
    assert buyer["description"] == "Organisation making the purchase."
    assert buyer["section_context"] == [
        {
            "chapter_ref": "chapter-1",
            "title": "Planned purchase",
            "description": "Equipment the applicant proposes to buy.",
        },
        {
            "chapter_ref": "reporting",
            "title": "Reporting",
            "field_description": "Name of that organisation for reporting.",
        },
    ]
    budget = points["Budget"]
    assert budget["key"] == (
        f"template_{fingerprint(str(template_id))[:12]}.chapter-1.budget_"
        f"{fingerprint('Budget')[:8]}"
    )
    assert budget["description"] == "Budget"
    assert budget["section_context"] == buyer["section_context"][:1]
    assert "section_context" not in points["Language"]
    assert points["Language"]["chapter_refs"] == ["chapter-1", "reporting"]
    assert "example-only text" not in json.dumps(points)
