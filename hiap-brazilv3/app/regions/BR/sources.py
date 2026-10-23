"""Brazil (BR) source adapter (scaffold).

No real data source is defined yet. Items come from fictitious JSON fixtures so
the pipelines can run end to end. Real clients (city, action catalog, legal,
policy, feasibility, ...) replace this once sources are approved.
"""

import json
from pathlib import Path

import yaml

from app.methodologies.ccc.v1.config_schema import MethodologyConfig
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


def load_ccc_v1_config() -> MethodologyConfig:
    """Load the placeholder CCC v1 parameters from `config.yaml`.

    Returns:
        Validated methodology configuration for the BR region.
    """
    raw = yaml.safe_load((REGION_DIR / "config.yaml").read_text(encoding="utf-8"))
    return MethodologyConfig(**raw["methodologies"]["ccc"]["v1"])
