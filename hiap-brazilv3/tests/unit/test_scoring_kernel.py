"""Unit tests for the minimal scoring kernel."""

import pytest

from app.shared.contracts import ScoreVector
from app.shared.scoring.aggregation import rank_items, weighted_sum
from app.shared.scoring.weights import validate_weights

WEIGHTS = {"a": 0.5, "b": 0.5}


@pytest.mark.unit
def test_validate_weights_accepts_valid_set() -> None:
    assert validate_weights(WEIGHTS) == WEIGHTS


@pytest.mark.unit
@pytest.mark.parametrize(
    "weights",
    [{}, {"a": -0.5, "b": 1.5}, {"a": 0.5, "b": 0.6}, {"a": float("nan"), "b": 1.0}],
)
def test_validate_weights_rejects_invalid_sets(weights: dict[str, float]) -> None:
    with pytest.raises(ValueError):
        validate_weights(weights)


@pytest.mark.unit
def test_weighted_sum_combines_scores() -> None:
    vector = ScoreVector(scores={"a": 1.0, "b": 0.0})
    assert weighted_sum(vector, WEIGHTS) == pytest.approx(0.5)


@pytest.mark.unit
def test_weighted_sum_rejects_missing_pillar() -> None:
    with pytest.raises(ValueError):
        weighted_sum(ScoreVector(scores={"a": 1.0}), WEIGHTS)


@pytest.mark.unit
def test_rank_items_orders_by_score_then_id() -> None:
    vectors = {
        "z": ScoreVector(scores={"a": 0.5, "b": 0.5}),
        "m": ScoreVector(scores={"a": 0.5, "b": 0.5}),
        "top": ScoreVector(scores={"a": 1.0, "b": 1.0}),
    }

    ranked = rank_items(vectors, WEIGHTS)

    assert [item.item_id for item in ranked] == ["top", "m", "z"]
    assert [item.rank for item in ranked] == [1, 2, 3]


@pytest.mark.unit
def test_rank_items_applies_top_n() -> None:
    vectors = {
        "x": ScoreVector(scores={"a": 1.0, "b": 1.0}),
        "y": ScoreVector(scores={"a": 0.1, "b": 0.1}),
    }
    assert [item.item_id for item in rank_items(vectors, WEIGHTS, top_n=1)] == ["x"]


@pytest.mark.unit
def test_rank_items_rejects_non_positive_top_n() -> None:
    with pytest.raises(ValueError):
        rank_items({}, WEIGHTS, top_n=0)
