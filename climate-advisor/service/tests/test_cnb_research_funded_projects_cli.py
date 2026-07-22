"""Tests for funded-project research manifest loading."""

import json
from pathlib import Path
import sys
from uuid import uuid4

import pytest

from app.models.cnb_similar_projects import CnbSimilarProjectSearchRequest
from tests.cnb_research_helpers import build_request

CLIMATE_ADVISOR_ROOT = Path(__file__).resolve().parents[2]
if str(CLIMATE_ADVISOR_ROOT) not in sys.path:
    sys.path.insert(0, str(CLIMATE_ADVISOR_ROOT))

from scripts.cnb_research import research_funded_projects  # noqa: E402


def _target_project() -> CnbSimilarProjectSearchRequest:
    return CnbSimilarProjectSearchRequest(
        run_id=uuid4(),
        funder_scope="cross_funder",
        project_name="Nicosia municipal energy project",
        interventions=["Municipal solar", "Battery storage"],
        project_tags=["municipal-solar", "battery-storage"],
        limit=50,
    )


def test_cli_requires_a_target_project(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        sys,
        "argv",
        ["research_funded_projects", "--input", "request.json"],
    )

    with pytest.raises(SystemExit) as exc_info:
        research_funded_projects.parse_args()

    assert exc_info.value.code == 2


def test_single_manifest_receives_project_context_and_default_turns(
    tmp_path: Path,
) -> None:
    target_project = _target_project()
    project_path = tmp_path / "project.json"
    project_path.write_text(target_project.model_dump_json(), encoding="utf-8")
    request_path = tmp_path / "request.json"
    request_path.write_text(
        json.dumps(build_request().model_dump(mode="json", exclude={"max_turns"})),
        encoding="utf-8",
    )

    loaded_project = research_funded_projects.load_target_project(project_path)
    loaded_request = research_funded_projects.load_request(
        request_path,
        target_project=loaded_project,
    )

    assert loaded_request.target_project == target_project
    assert loaded_request.max_turns == 20


def test_batch_manifest_applies_defaults_per_request(tmp_path: Path) -> None:
    request = build_request(max_turns=7)
    batch_path = tmp_path / "batch.json"
    batch_path.write_text(
        json.dumps(
            {
                "batch_name": "Award portfolios",
                "requests": [
                    request.model_dump(mode="json", exclude={"max_turns"}),
                    request.model_dump(mode="json"),
                ],
            }
        ),
        encoding="utf-8",
    )

    loaded = research_funded_projects.load_request(
        batch_path,
        target_project=_target_project(),
    )

    assert loaded.batch_name == "Award portfolios"
    assert [item.max_turns for item in loaded.requests] == [20, 7]
    assert all(item.target_project is not None for item in loaded.requests)
