#!/usr/bin/env python3
"""Generate city policy signals mock for GET /v1/cities/{locode}/policy-signals.

Requires duckdb CLI. Run from hiap-meed directory:
  python scripts/generate_city_policy_signals_mock.py [locode]

Example:
  python scripts/generate_city_policy_signals_mock.py "CL ANF"
  python scripts/generate_city_policy_signals_mock.py "CL IQQ"
"""

import argparse
import csv
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
HIAP_MEED = SCRIPT_DIR.parent
DATA_DIR = HIAP_MEED / "data"
MOCK_DIR = DATA_DIR / "mock"

QUERY = """
WITH
city_lookup AS (
  SELECT * FROM read_csv_auto('{city_csv}')
),
policy_signals AS (
  SELECT * FROM read_csv_auto('{policy_csv}')
),
filtered AS (
  SELECT ps.*
  FROM policy_signals ps
  CROSS JOIN city_lookup c
  WHERE c.locode = '{locode}'
    AND (
      (ps.location_scope = 'National' AND ps.location_name = 'Chile')
      OR (ps.location_scope = 'Regional' AND ps.location_name = c.region_name)
      OR (ps.location_scope = 'Communal' AND ps.location_name = c.comuna_name)
    )
),
action_ids AS (
  SELECT DISTINCT action_id FROM filtered
)
SELECT
  a.action_id,
  to_json((
    SELECT list(struct_pack(
      location_scope := f.location_scope,
      location_name := f.location_name,
      signal_type := f.signal_type,
      signal_relation := f.signal_relation,
      signal_strength := f.signal_strength,
      evidence_ids := f.evidence_ids,
      evidence_count := f.evidence_count
    ))
    FROM filtered f
    WHERE f.action_id = a.action_id
  )) AS policy_signals
FROM action_ids a
ORDER BY a.action_id
"""


RELATION_WEIGHTS = {
    "commits": 1.0,
    "provides": 0.9,
    "assigns": 0.8,
    "establishes": 0.8,
    "supports": 0.6,
    "identifies": 0.4,
    "ceiling": 0.2,
}
STRENGTH_CONFIDENCE = {"high": 0.9, "medium": 0.6, "low": 0.3}
SCOPE_MULTIPLIER = {"Communal": 1.2, "Regional": 1.0, "National": 0.9}
NORMALIZATION_DIVISOR = 3.0


def _evidence_ids_to_array(val: str | None) -> list[str]:
    """Convert pipe-separated evidence_ids string to array."""
    if val is None or (isinstance(val, str) and not val.strip()):
        return []
    return [x.strip() for x in str(val).split("|") if x.strip()]


def compute_policy_support_score(policy_signals: list) -> float:
    """Compute policy support score from signals.

    Formula: sum(relation_weight × strength_confidence × scope_multiplier) / 3.0
    Result capped at 1.0.
    """
    raw = 0.0
    for s in policy_signals:
        rw = RELATION_WEIGHTS.get(s.get("signal_relation"), 0.5)
        sc = STRENGTH_CONFIDENCE.get(s.get("signal_strength"), 0.3)
        sm = SCOPE_MULTIPLIER.get(s.get("location_scope"), 1.0)
        raw += rw * sc * sm
    return round(min(1.0, raw / NORMALIZATION_DIVISOR), 4)


def get_city_info(locode: str) -> dict | None:
    """Get comuna_name and region_name for locode from city.csv."""
    city_path = DATA_DIR / "1_city" / "city.csv"
    with open(city_path, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row.get("locode") == locode:
                return {
                    "comuna_name": row["comuna_name"],
                    "region_name": row["region_name"],
                }
    return None


def main():
    parser = argparse.ArgumentParser(description="Generate city policy signals mock")
    parser.add_argument(
        "locode",
        nargs="?",
        default="CL ANF",
        help="Locode to generate mock for (default: CL ANF)",
    )
    parser.add_argument(
        "-o", "--output",
        help="Output path (default: mock/city_policy_signals_{locode}.json)",
    )
    args = parser.parse_args()
    locode = args.locode.strip()

    city_info = get_city_info(locode)
    if not city_info:
        print(f"Warning: locode {locode} not found in city.csv, using placeholder")
        city_info = {"comuna_name": "Unknown", "region_name": "Unknown"}

    city_csv = DATA_DIR / "1_city" / "city.csv"
    policy_csv = DATA_DIR / "3_policy" / "policy_signals.csv"

    query = QUERY.format(
        city_csv=str(city_csv),
        policy_csv=str(policy_csv),
        locode=locode.replace("'", "''"),  # escape for SQL
    )

    result = subprocess.run(
        ["duckdb", "-json", "-c", query],
        cwd=str(HIAP_MEED),
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(result.stderr)
        raise SystemExit(1)

    rows = json.loads(result.stdout)
    policy_by_action = []
    for row in rows:
        signals = row.get("policy_signals")
        if isinstance(signals, str):
            signals = json.loads(signals) if signals else []
        for s in signals:
            if "evidence_ids" in s:
                s["evidence_ids"] = _evidence_ids_to_array(s.get("evidence_ids"))
        policy_by_action.append({
            "action_id": row["action_id"],
            "policy_signals": signals,
            "policy_support_score": compute_policy_support_score(signals),
        })

    payload = {
        "meta": {
            "generated_at_utc": datetime.now(timezone.utc).isoformat(),
            "backend_consumer": "hiap-meed",
            "upstream_provider": "policy-api",
            "api_context": {
                "endpoint": "GET /v1/cities/{locode}/policy-signals",
                "locode": locode,
                "comuna_name": city_info["comuna_name"],
                "region_name": city_info["region_name"],
                "description": "Policy signals scoped to city (National + Regional + Communal)",
            "policy_support_score_formula": "sum(relation_weight × strength_confidence × scope_multiplier) / 3.0, capped at 1.0",
            },
            "total_actions": len(policy_by_action),
        },
        "policy_signals": policy_by_action,
    }

    if args.output:
        output_path = Path(args.output)
    elif locode == "CL ANF":
        output_path = MOCK_DIR / "city_policy_signals_api_mock.json"
    else:
        safe_locode = locode.replace(" ", "_")
        output_path = MOCK_DIR / f"city_policy_signals_{safe_locode}_api_mock.json"

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    size_kb = output_path.stat().st_size / 1024
    print(f"Wrote {output_path} ({len(policy_by_action)} actions, {size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
