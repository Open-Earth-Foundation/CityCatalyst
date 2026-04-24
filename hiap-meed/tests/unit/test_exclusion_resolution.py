"""Unit tests for exclusion preview resolution."""

from __future__ import annotations

import pytest

from app.modules.prioritizer.internal_models import Action
from app.modules.prioritizer.models import ExclusionPreviewCityInput
from app.modules.prioritizer.services.exclusion_resolution import (
    FreeTextExclusionMatch,
    _build_catalog_row,
    _drop_count_warnings,
    _validated_llm_matches,
    resolve_exclusion_preview_with_diagnostics,
)
from app.modules.prioritizer.utils.sector_mapping import (
    normalize_sector_tag,
    resolve_action_sector_tags,
)


def test_sector_mapping_resolves_gpc_and_category_metadata() -> None:
    """Sector mapping should use exact canonical tags plus GPC sector numbers."""
    waste_action = Action(
        action_id="A_waste",
        action_name="Waste action",
        emissions={"sector_number": "III"},
    )
    transport_action = Action(
        action_id="A_transport",
        action_name="Transport action",
        action_category="Urban mobility",
    )
    canonical_category_action = Action(
        action_id="A_canonical",
        action_name="Canonical category action",
        action_category="transportation",
    )

    assert normalize_sector_tag("stationary_energy") == "stationary_energy"
    assert normalize_sector_tag("Stationary Energy") is None
    assert resolve_action_sector_tags(waste_action) == {"waste"}
    assert resolve_action_sector_tags(transport_action) == set()
    assert resolve_action_sector_tags(canonical_category_action) == {"transportation"}


def test_exclusion_preview_deterministic_sector_and_co_benefit_resolution() -> None:
    """Preview should merge deterministic sector and co-benefit exclusions."""
    actions = [
        Action(
            action_id="A_waste",
            action_name="Waste action",
            emissions={"sector_number": "III"},
            co_benefits={"air_quality": {"impact_numeric": 1}},
        ),
        Action(
            action_id="A_air",
            action_name="Air impact action",
            emissions={"sector_number": "II"},
            co_benefits={"air_quality": {"impact_numeric": -1}},
        ),
    ]
    city_input = ExclusionPreviewCityInput(
        locode="CL-SCL",
        excludedSectorTags=["waste"],
        excludedCoBenefitKeys=["air_quality"],
    )

    result, diagnostics = resolve_exclusion_preview_with_diagnostics(
        city_input=city_input,
        actions=actions,
    )

    assert [item.actionId for item in result.proposedExcludedActions] == [
        "A_air",
        "A_waste",
    ]
    assert diagnostics["counts"]["proposed_exclusions"] == 2
    summary = result.exclusionSummary.byReasonType
    assert summary["sector"].actionIds == ["A_waste"]
    assert summary["co_benefit"].actionIds == ["A_air"]


def test_exclusion_preview_warns_when_free_text_llm_is_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Free-text preview should fail closed when the LLM resolver is disabled."""
    monkeypatch.setenv("HIAP_MEED_FREE_TEXT_EXCLUSIONS_ENABLED", "false")
    monkeypatch.delenv("HIAP_MEED_FREE_TEXT_EXCLUSIONS_MODEL", raising=False)
    city_input = ExclusionPreviewCityInput(
        locode="CL-SCL",
        excludedActionsFreeText="No fossil fuel infrastructure",
    )

    result, diagnostics = resolve_exclusion_preview_with_diagnostics(
        city_input=city_input,
        actions=[],
    )

    assert result.proposedExcludedActions == []
    assert result.warnings == ["Free-text exclusion resolution is disabled."]
    assert diagnostics["free_text_resolution"]["reason"] == "feature_disabled"


def test_validated_llm_matches_keep_only_clear_catalog_ids() -> None:
    """LLM validation should drop unknown IDs and ambiguous rows."""
    rows = [
        FreeTextExclusionMatch(
            action_id="A_clear",
            reason="Clearly mentions incineration.",
            match_is_clear=True,
        ),
        FreeTextExclusionMatch(
            action_id="A_ambiguous",
            reason="Maybe relevant.",
            match_is_clear=False,
        ),
        FreeTextExclusionMatch(
            action_id="A_unknown",
            reason="Unknown ID.",
            match_is_clear=True,
        ),
        FreeTextExclusionMatch(
            action_id="A_empty",
            reason="   ",
            match_is_clear=True,
        ),
    ]

    result, dropped_rows, drop_counts = _validated_llm_matches(
        rows=rows,
        expected_action_ids={"A_clear", "A_ambiguous", "A_empty"},
    )

    assert result == {"A_clear": "Clearly mentions incineration."}
    assert drop_counts == {
        "unknown_action_id": 1,
        "ambiguous_match": 1,
        "empty_reason": 1,
    }
    assert [row["drop_reason"] for row in dropped_rows] == [
        "ambiguous_match",
        "unknown_action_id",
        "empty_reason",
    ]


def test_drop_count_warnings_returns_frontend_safe_messages() -> None:
    """Drop-count warnings should summarize why LLM rows were ignored."""
    warnings = _drop_count_warnings(
        {
            "unknown_action_id": 1,
            "ambiguous_match": 2,
            "empty_reason": 1,
        }
    )

    assert warnings == [
        "Some free-text matches were ignored because they did not match known actions.",
        "Some free-text matches were ignored because they were ambiguous.",
        "Some free-text matches were ignored because the resolver did not provide a usable reason.",
    ]
def test_build_catalog_row_truncates_long_descriptions() -> None:
    """Catalog rows should trim long descriptions before prompt rendering."""
    row = _build_catalog_row(
        Action(
            action_id="A_long",
            action_name="Long description action",
            description="Very long text " * 40,
            action_category="Projects",
            action_subcategory="Infrastructure",
        )
    )

    assert row["action_id"] == "A_long"
    assert row["action_name"] == "Long description action"
    assert row["action_category"] == "Projects"
    assert row["action_subcategory"] == "Infrastructure"
    assert row["description"].endswith("...")
    assert len(row["description"]) <= 203
