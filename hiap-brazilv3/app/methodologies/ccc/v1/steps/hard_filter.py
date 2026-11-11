"""Hard-filter step (scaffold stub: every item is eligible)."""

from app.shared.contracts import FilterDecision, RankableItem


def apply_hard_filter(items: list[RankableItem]) -> list[FilterDecision]:
    """Decide eligibility for each item.

    Scaffold stub: no approved filter rules exist, so every item is eligible.

    Args:
        items: Candidate items.

    Returns:
        One eligible decision per item, in input order.
    """
    return [FilterDecision(item_id=item.id, eligible=True) for item in items]
