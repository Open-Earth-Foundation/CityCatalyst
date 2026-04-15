#!/usr/bin/env python3
"""Generate actions_legal_api_mock.json for GET /v1/actions/legal.

Requires duckdb CLI. Run from hiap-meed directory:
  python scripts/generate_actions_legal_mock.py
"""

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
HIAP_MEED = SCRIPT_DIR.parent
DATA_DIR = HIAP_MEED / "data"
OUTPUT_PATH = DATA_DIR / "mock" / "actions_legal_api_mock.json"


def _evidence_ids_to_array(val: str | None) -> list[str]:
    """Convert pipe-separated evidence_ids string to array."""
    if val is None or (isinstance(val, str) and not val.strip()):
        return []
    return [x.strip() for x in str(val).split("|") if x.strip()]


QUERY = """
WITH
action_legal_requirements AS (
  SELECT * FROM read_csv_auto('{legal_req}')
),
legal_signals AS (
  SELECT * FROM read_csv_auto('{legal_sig}')
),
legal_signal_codes AS (
  SELECT * FROM read_csv_auto('{legal_codes}')
),
req_with_evidence AS (
  SELECT
    alr.action_id,
    alr.signal_code,
    alr.operator,
    alr.required_value,
    alr.strength,
    ls.location_scope,
    ls.location_name,
    ls.signal_value AS legal_signal_value,
    ls.evidence_ids,
    ls.evidence_count,
    lsc.signal_name,
    CASE
      WHEN ls.signal_code IS NULL THEN 'no_evidence'
      WHEN alr.operator = 'equals' AND ls.signal_value = alr.required_value THEN 'aligns'
      WHEN alr.operator = 'equals' AND ls.signal_value != alr.required_value THEN 'not_aligned'
      WHEN alr.operator = 'less_than_or_equal' AND ls.signal_value IS NOT NULL THEN 'aligns'
      ELSE 'not_aligned'
    END AS alignment_status
  FROM action_legal_requirements alr
  LEFT JOIN legal_signals ls ON alr.signal_code = ls.signal_code
  LEFT JOIN legal_signal_codes lsc ON alr.signal_code = lsc.signal_code
),
action_ids AS (
  SELECT DISTINCT action_id FROM action_legal_requirements
)
SELECT
  a.action_id,
  to_json((
    SELECT list(struct_pack(
      signal_code := r.signal_code,
      signal_name := r.signal_name,
      required_value := r.required_value,
      legal_signal_value := r.legal_signal_value,
      strength := r.strength,
      alignment_status := r.alignment_status,
      location_scope := r.location_scope,
      location_name := r.location_name,
      evidence_ids := r.evidence_ids,
      evidence_count := r.evidence_count
    ))
    FROM req_with_evidence r
    WHERE r.action_id = a.action_id
  )) AS requirements
FROM action_ids a
ORDER BY a.action_id
"""


def main():
    legal_req_path = DATA_DIR / "4_legal" / "action_legal_requirements.csv"
    legal_sig_path = DATA_DIR / "4_legal" / "legal_signals.csv"
    legal_codes_path = DATA_DIR / "4_legal" / "legal_signal_codes.csv"

    query = QUERY.format(
        legal_req=str(legal_req_path),
        legal_sig=str(legal_sig_path),
        legal_codes=str(legal_codes_path),
    )

    result = subprocess.run(
        ["duckdb", "-json", "-c", query],
        cwd=str(HIAP_MEED),
        capture_output=True,
        text=True,
    )
    result.check_returncode()

    rows = json.loads(result.stdout)
    legal_requirements = []
    for row in rows:
        reqs = row.get("requirements")
        if isinstance(reqs, str):
            reqs = json.loads(reqs) if reqs else []
        for r in reqs:
            if "evidence_ids" in r:
                r["evidence_ids"] = _evidence_ids_to_array(r.get("evidence_ids"))
        legal_requirements.append({
            "action_id": row["action_id"],
            "requirements": reqs,
        })

    payload = {
        "meta": {
            "generated_at_utc": datetime.now(timezone.utc).isoformat(),
            "backend_consumer": "hiap-meed",
            "upstream_provider": "legal-api",
            "api_context": {
                "endpoint": "GET /v1/actions/legal",
                "description": "Legal requirements and alignment per action. Can optionally filter by locode when city-scoped legal data exists.",
                "locode": None,
            },
            "total_actions": len(legal_requirements),
        },
        "legal_requirements": legal_requirements,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    print(f"Wrote {OUTPUT_PATH} ({len(legal_requirements)} actions)")


if __name__ == "__main__":
    main()
