"""Shared builders for the golden-set tests; no model calls."""

from __future__ import annotations

from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from app.models.cnb.context_bundle import SelectedSource

from benchmark.cnb.golden_set.core import LoadedFixture, load_golden_fixtures

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures"
HARBOR_POINT = "harbor-point-heat-and-stormwater-resilience-plan"


def load_all() -> dict[str, LoadedFixture]:
    """Load every checked-in fixture through the production source contract."""
    return {item.fixture.fixture_id: item for item in load_golden_fixtures(FIXTURES_DIR)}


def selected_source(loaded: LoadedFixture, **values) -> SelectedSource:
    """Build an analysis result with the fixture's identity fields."""
    source = loaded.fixture.source
    is_pdf = source.source_format == "pdf"
    return SelectedSource.model_validate(
        {
            "upload_id": uuid5(NAMESPACE_URL, loaded.fixture.fixture_id),
            "source_label": source.source_label,
            "filename": source.filename,
            "sha256": source.sha256,
            "source_format": source.source_format,
            "page_count": len(loaded.units) if is_pdf else None,
            "block_count": None if is_pdf else len(loaded.units),
            "topics": [],
            **values,
        }
    )


def reviewed_source(loaded: LoadedFixture) -> SelectedSource:
    """The reviewed extraction stored with the fixture's reference draft."""
    return selected_source(loaded, **loaded.reference_draft.selected_source)
