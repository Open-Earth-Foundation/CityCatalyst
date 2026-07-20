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
        language="en",
        chapters=[
            CityActionReportChapter(
                key="snapshot",
                title="Snapshot",
                markdown="This is the snapshot.",
            ),
            CityActionReportChapter(
                key="city_fit",
                title="City Fit",
                markdown="## Existing Heading\n\nThis heading should not be duplicated.",
            ),
        ],
        metadata=CityActionReportMetadata(
            frontend_request_id="frontend-1",
            internal_request_id="internal-1",
        ),
    )

    markdown = build_output_plan_markdown(response)

    assert markdown.startswith("# Output Plan: icare_0040")
    assert "- City: CL IQQ" in markdown
    assert "## Snapshot\n\nThis is the snapshot." in markdown
    assert markdown.count("## City Fit") == 0
    assert "## Existing Heading\n\nThis heading should not be duplicated." in markdown
