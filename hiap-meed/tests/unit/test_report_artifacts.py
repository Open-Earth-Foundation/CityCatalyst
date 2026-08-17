"""Unit tests for output-plan report artifact helpers."""

from __future__ import annotations

from app.modules.prioritizer.models import (
    CityActionReportApiResponse,
    CityActionReportChapter,
    CityActionReportMetadata,
)
from app.modules.prioritizer.report_artifacts import build_output_plan_markdown


def test_build_output_plan_markdown_concatenates_report_chapters() -> None:
    """Readable report artifact should include metadata and ordered chapter text."""
    response = CityActionReportApiResponse(
        locode="CL IQQ",
        action_id="icare_0040",
        language=["en"],
        chapters=[
            CityActionReportChapter(
                key="snapshot",
                title={"en": "Snapshot"},
                markdown={"en": "This is the snapshot."},
                limitations={"en": []},
            ),
            CityActionReportChapter(
                key="city_fit",
                title={"en": "City Fit"},
                markdown={"en": "## City Fit\n\nThis heading should not be duplicated."},
                limitations={"en": []},
            ),
            CityActionReportChapter(
                key="sources_assumptions",
                title={"en": "Where The Information Comes From"},
                markdown={
                    "en": "### Source references\n\nA subsection still needs its chapter heading."
                },
                limitations={"en": []},
            ),
        ],
        metadata=CityActionReportMetadata(
            frontend_request_id="frontend-1",
            internal_request_id="internal-1",
        ),
    )

    markdown = build_output_plan_markdown(response, "en")

    assert markdown.startswith("# Output Plan: icare_0040")
    assert "- City: CL IQQ" in markdown
    assert "## Snapshot\n\nThis is the snapshot." in markdown
    assert markdown.count("## City Fit") == 1
    assert "## Where The Information Comes From\n\n### Source references" in markdown
