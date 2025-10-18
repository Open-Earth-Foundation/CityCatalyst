import sys
import os
import json
import argparse
from pathlib import Path

# Ensure Python can import hiap/app modules when running from within the hiap/ folder
# This file lives at hiap/audit_anchor_vs_pairwise.py
# We add hiap/app to sys.path so that imports like `from services.get_actions` work
app_root = Path(__file__).resolve().parent / "app"  # -> hiap/app
sys.path.insert(0, str(app_root))

from prioritizer.utils.ml_comparator import audit_compare_strategies  # noqa: E402
from services.get_actions import get_actions  # noqa: E402

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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pairs", type=int, default=200, help="Number of random pairs")
    parser.add_argument("--seed", type=int, default=42, help="RNG seed")
    parser.add_argument("--lang", type=str, default="en", help="Actions language")
    parser.add_argument(
        "--out",
        type=str,
        default="audit_anchor_vs_pairwise.json",
        help="Path to write JSON summary",
    )
    args = parser.parse_args()

    # Optional: ensure default strategy (anchor) globally (not required for audit)
    os.environ.setdefault("ML_COMPARE_STRATEGY", "anchor")

    actions = get_actions(language=args.lang)
    if not actions or len(actions) < 2:
        raise RuntimeError("Could not fetch enough actions for the audit.")

    summary = audit_compare_strategies(
        CITY, actions, num_pairs=args.pairs, seed=args.seed
    )
    print(json.dumps(summary, indent=2))

    # Write output JSON
    out_path = Path(args.out)
    try:
        out_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
        print(f"\nWrote audit summary to: {out_path.resolve()}")
    except Exception as e:
        print(f"Failed to write audit JSON to {out_path}: {e}")


if __name__ == "__main__":
    main()
