"""Brazil (BR) source adapter (scaffold).

No real data source is defined yet. Items come from fictitious JSON fixtures so
the pipelines can run end to end. Real clients (city, action catalog, legal,
policy, feasibility, ...) replace this once sources are approved.
"""

import json
from pathlib import Path
from typing import Any

import yaml

from app.shared.contracts import RankableItem

REGION_DIR = Path(__file__).parent
FIXTURES_DIR = REGION_DIR / "tests" / "fixtures"


def load_items(modality: str) -> list[RankableItem]:
    """Load the fictitious items for `modality`.

    Args:
        modality: `mitigation` or `adaptation`.

    Returns:
        Items whose `metadata["mockScores"]` hold the fictitious pillar scores.

    Raises:
        FileNotFoundError: If there is no fixture for the modality.
    """
    rows = json.loads(
        (FIXTURES_DIR / f"mock_{modality}_items.json").read_text(encoding="utf-8")
    )
    return [
        RankableItem(
            id=row["id"], name=row["name"], metadata={"mockScores": row["mockScores"]}
        )
        for row in rows
    ]


def load_methodology_params(methodology: str, version: str) -> dict[str, Any]:
    """Load the raw region parameters for one methodology version from `config.yaml`.

    The region does not know the methodology's schema: the registry validates
    the returned mapping against the methodology's own config model.

    Args:
        methodology: Methodology identifier, e.g. `ccc`.
        version: Methodology version, e.g. `v1`.

    Returns:
        The unvalidated parameter mapping (placeholders while the methodology is a scaffold).

    Raises:
        KeyError: If the region has no parameters for that methodology version.
    """
    raw = yaml.safe_load((REGION_DIR / "config.yaml").read_text(encoding="utf-8"))
    return raw["methodologies"][methodology][version]
