import sys
import argparse
from pathlib import Path

# Ensure Python can import hiap/app modules when running this script directly
# This file lives at hiap/app/prioritizer/utils/shap_explain_pair.py
# We add hiap/app to sys.path so that imports like `from services.get_actions` work
app_root = Path(__file__).resolve().parents[2]  # -> hiap/app
sys.path.insert(0, str(app_root))

from prioritizer.utils.ml_comparator import (  # noqa: E402
    build_transformed_features_for_pair,
    create_shap_waterfall,
    loaded_model,
)
from services.get_actions import get_actions  # noqa: E402


# Default city (same as used in audit_anchor_vs_pairwise.py)
CITY = {
    "locode": "TESTCITY",
    "populationSize": 500000,
    "populationDensity": 1500,
    "elevation": 50,
    "biome": "temperate_forest",
    "stationaryEnergyEmissions": 1000000,
    "transportationEmissions": 500000,
    "wasteEmissions": 300000,
    "ippuEmissions": 150000,
    "afoluEmissions": 20000,
    "ccra": [],
}


def _find_action_by_id(actions: list[dict], action_id: str) -> dict:
    for action in actions:
        if action.get("ActionID") == action_id:
            return action
    raise ValueError(f"Action with ID '{action_id}' not found")


def shap_explain_pair(
    action_id_a: str, action_id_b: str, city: dict = CITY, language: str = "en"
) -> None:
    """
    Load actions catalogue, build transformed features for (A,B) and display SHAP waterfall.
    """
    actions = get_actions(language=language)
    if not actions or len(actions) < 2:
        raise RuntimeError("Could not fetch enough actions for SHAP explanation.")

    action_a = _find_action_by_id(actions, action_id_a)
    action_b = _find_action_by_id(actions, action_id_b)

    df_features = build_transformed_features_for_pair(city, action_a, action_b)
    create_shap_waterfall(df_features, loaded_model)


def main():
    parser = argparse.ArgumentParser(
        description="Display SHAP waterfall for a city-action pair (A vs B)"
    )
    parser.add_argument(
        "--action-a", required=True, help="ActionID for A (e.g., c40_0010)"
    )
    parser.add_argument(
        "--action-b", required=True, help="ActionID for B (e.g., c40_0012)"
    )
    parser.add_argument("--lang", default="en", help="Actions language (default: en)")
    args = parser.parse_args()

    shap_explain_pair(args.action_a, args.action_b, CITY, args.lang)


if __name__ == "__main__":
    main()
