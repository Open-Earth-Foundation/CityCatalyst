"""Every registered combination must satisfy the shared contracts."""

import pytest

from app.registry import REGISTRY
from app.shared.contracts import RankingResult
from app.shared.scoring.weights import validate_weights


@pytest.mark.conformance
@pytest.mark.parametrize("key", sorted(REGISTRY))
def test_combination_produces_valid_ranking(key: tuple[str, str, str]) -> None:
    """Each pipeline of a registered combination returns a consistent, complete ranking."""
    combination = REGISTRY[key]
    config = combination.load_config()
    validate_weights(config.weights)

    for modality, pipeline in combination.pipelines.items():
        items = combination.load_items(modality)
        result = pipeline(items, config)

        assert isinstance(result, RankingResult)
        known_ids = {item.id for item in items}
        ranked_ids = [entry.item_id for entry in result.ranked]
        assert set(ranked_ids) <= known_ids
        assert len(ranked_ids) == len(set(ranked_ids))
        assert [entry.rank for entry in result.ranked] == list(range(1, len(ranked_ids) + 1))
        assert {entry.item_id for entry in result.ranked} | {
            decision.item_id for decision in result.excluded
        } == known_ids
