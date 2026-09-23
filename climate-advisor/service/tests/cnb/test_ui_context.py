"""Exercise changing draft/blocker state and unavailable workspace storage."""

from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from app.services.cnb.ui_context import build_ui_state, load_ui_state


def test_only_active_critical_gaps_are_known_export_blockers():
    """Deleted/resolved/warning gaps must not become critical blockers."""
    chapter = SimpleNamespace(
        status="needs_review",
        body_markdown="Current draft",
        gaps=[
            SimpleNamespace(severity="critical", state="open"),
            SimpleNamespace(severity="critical", state="processing"),
            SimpleNamespace(severity="critical", state="resolved"),
            SimpleNamespace(severity="warning", state="open"),
        ],
    )
    deleted = SimpleNamespace(status="deleted", body_markdown="Old", gaps=chapter.gaps)
    state = build_ui_state([chapter, deleted])
    assert state["draft"] == {
        "exists": True,
        "total_sections": 1,
        "sections_with_content": 1,
    }
    assert state["export"]["enabled"] is False
    assert state["export"]["blockers"] == [
        "2 critical gaps; fill through reviewed chat edits"
    ]
    assert state["review"]["failure_blocks_export"] is None
    assert state["pending_proposal"] is None
    assert state["active_tab"] is None

    chapter.gaps = []
    state = build_ui_state([chapter])
    assert state["export"]["blockers"] == []
    assert state["export"]["enabled"] is None  # Browser acknowledgement is unknown.


def test_empty_template_is_not_a_generated_draft():
    """Template chapter metadata alone must not imply generated content."""
    chapter = SimpleNamespace(status="empty", body_markdown="  ", gaps=[])
    state = build_ui_state([chapter])
    assert state["draft"] == {
        "exists": False,
        "total_sections": 1,
        "sections_with_content": 0,
    }
    assert state["export"]["blockers"] == ["No generated draft"]
    assert state["export"]["missing_upload_blocks_export"] is False


def test_partial_draft_separates_template_sections_from_generated_content():
    """Empty template sections must not be reported as drafted chapters."""
    chapters = [
        SimpleNamespace(status="needs_review", body_markdown="Generated", gaps=[]),
        SimpleNamespace(status="empty", body_markdown=None, gaps=[]),
        SimpleNamespace(status="empty", body_markdown=" \n ", gaps=[]),
        SimpleNamespace(status="deleted", body_markdown="Removed", gaps=[]),
    ]
    assert build_ui_state(chapters)["draft"] == {
        "exists": True,
        "total_sections": 3,
        "sections_with_content": 1,
    }


async def test_unavailable_workspace_does_not_become_empty_draft():
    """Failed reads remain unknown instead of supplying fabricated empty state."""
    with patch(
        "app.services.cnb.ui_context.get_cnb_reference_session_factory",
        side_effect=RuntimeError("Unavailable"),
    ):
        assert await load_ui_state(uuid4()) is None
