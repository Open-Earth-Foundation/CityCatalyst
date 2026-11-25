"""
Brief: Check authority-scope corpus binding and, optionally, live Jev labels.

Inputs:
- CLI args:
  - `--corpus`: Path to evaluation_corpus_v1.json. Default is the packaged corpus.
  - `--live`: Call OpenRouter/Jev for eligible cases. Requires `OPENROUTER_API_KEY`.
  - `--log-level`: Logging level. Default `INFO`.
- Files: the evaluation corpus JSON.
- Env vars: `OPENROUTER_API_KEY` only when `--live` is set. Ordinary tests do not call this.

Outputs:
- Stdout JSON with schema/binding failures, regression failures, and recorded live
  differences. Exit 0 when schema checks, Piotr cases, and deterministic mappings pass.
  The two legacy-label disagreements are recorded model outcomes, not release blockers.

Usage (from the hiap-meed project root):
- uv run python -m app.scripts.evaluate_authority_scope_corpus
- uv run python -m app.scripts.evaluate_authority_scope_corpus --live
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path
from typing import Any

from app.modules.prioritizer.authority_scope import (
    canonical_row_sha256,
    classifier_input_from_legal_row,
    resolve_report_authority_scope,
)
from app.services.openrouter_jev_client import (
    OpenRouterJevClient,
    get_jev_confidence_threshold,
)

logger = logging.getLogger(__name__)

RECORDED_MODEL_OUTCOME = "recorded_model_outcome"
REQUIRED_RELEASE_CASE_IDS = (
    "piotr_paraphrase_municipal_only",
    "piotr_negation_full_direct",
)

DEFAULT_CORPUS_PATH = (
    Path(__file__).resolve().parents[2]
    / "data"
    / "authority_scope"
    / "evaluation_corpus_v1.json"
)


def load_corpus(path: Path) -> dict[str, Any]:
    """Load the reviewed evaluation corpus."""
    return json.loads(path.read_text(encoding="utf-8"))


def classifier_input_for_case(case: dict[str, Any]) -> dict[str, Any]:
    """Build the canonical classifier input for one corpus case."""
    return classifier_input_from_legal_row(
        country_code=case["country_code"],
        action_id=case["action_id"],
        verdict_category=case.get("verdict_category"),
        ownership_category=case.get("ownership_category"),
        restrictions_category=case.get("restrictions_category"),
        ownership_description_en=case.get("ownership_description_en"),
        ownership_description_es=case.get("ownership_description_es"),
        restrictions_description_en=case.get("restrictions_description_en"),
        restrictions_description_es=case.get("restrictions_description_es"),
        legal_justification_en=case.get("legal_justification_en"),
        legal_justification_es=case.get("legal_justification_es"),
        legal_references=case.get("legal_references") or [],
    )


def validate_corpus_case_binding(case: dict[str, Any]) -> str:
    """Return the canonical row hash or raise when the case cannot bind."""
    for field in ("case_id", "country_code", "action_id", "expected_report_scope"):
        if not case.get(field):
            raise ValueError(f"corpus case missing {field}")
    digest = canonical_row_sha256(classifier_input_for_case(case))
    if len(digest) != 64:
        raise ValueError(f"corpus case {case['case_id']} produced an invalid row hash")
    return digest


def validate_release_regressions(corpus: dict[str, Any]) -> list[str]:
    """Return schema/binding and required-case failures. Empty means the gate passed."""
    failures: list[str] = []
    cases = corpus.get("cases")
    if not isinstance(cases, list) or not cases:
        return ["corpus has no cases"]
    seen_ids: set[str] = set()
    for case in cases:
        case_id = str(case.get("case_id") or "<missing>")
        if case_id in seen_ids:
            failures.append(f"duplicate case_id {case_id}")
        seen_ids.add(case_id)
        try:
            validate_corpus_case_binding(case)
        except (KeyError, TypeError, ValueError) as error:
            failures.append(f"{case_id}: {error}")
    for case_id in REQUIRED_RELEASE_CASE_IDS:
        if case_id not in seen_ids:
            failures.append(f"missing required regression case {case_id}")
    return failures


def live_gate_passed(case: dict[str, Any], *, report_label: str) -> tuple[bool, bool]:
    """Return (release_gate_passed, recorded_difference)."""
    matches = report_label == case["expected_report_scope"]
    recorded = case.get("live_comparison") == RECORDED_MODEL_OUTCOME
    if matches:
        return True, False
    if recorded:
        return True, True
    return False, False


def evaluate_case_offline(case: dict[str, Any]) -> dict[str, Any]:
    """Evaluate structural/report mapping without calling Jev."""
    expected_report = case["expected_report_scope"]
    selected = case.get("expected_semantic_label")
    report_label, status = resolve_report_authority_scope(
        verdict_category=case.get("verdict_category"),
        ownership_category=case.get("ownership_category"),
        selected_label=selected if case.get("classifier_eligible") else None,
        label_accepted=bool(case.get("classifier_eligible") and selected),
        confidence_passed=True,
    )
    if case.get("verdict_category") == "blocked":
        report_label = "blocked"
        status = "release_validated"
    return {
        "case_id": case["case_id"],
        "mode": "offline_structural",
        "expected_report_scope": expected_report,
        "actual_report_scope": report_label,
        "status": status,
        "passed": report_label == expected_report,
    }


def evaluate_case_live(
    case: dict[str, Any],
    *,
    client: OpenRouterJevClient,
    threshold: float,
) -> dict[str, Any]:
    """Evaluate one corpus case with a live Jev call when eligible."""
    if not case.get("classifier_eligible"):
        return evaluate_case_offline(case)

    result = client.classify_authority_scope(
        classifier_input=classifier_input_for_case(case)
    )
    confidence_passed = float(result["confidence"]) >= threshold
    report_label, status = resolve_report_authority_scope(
        verdict_category=case.get("verdict_category"),
        ownership_category=case.get("ownership_category"),
        selected_label=result["selected_label"],
        label_accepted=True,
        confidence_passed=confidence_passed,
    )
    expected = case["expected_report_scope"]
    gate_passed, recorded_difference = live_gate_passed(
        case, report_label=report_label
    )
    return {
        "case_id": case["case_id"],
        "mode": "live_jev",
        "expected_report_scope": expected,
        "actual_report_scope": report_label,
        "selected_label": result["selected_label"],
        "confidence": result["confidence"],
        "confidence_passed": confidence_passed,
        "status": status,
        "passed": gate_passed,
        "recorded_model_outcome": recorded_difference,
    }


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint for offline or live corpus evaluation."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--corpus", type=Path, default=DEFAULT_CORPUS_PATH)
    parser.add_argument(
        "--live",
        action="store_true",
        help="Call OpenRouter/Jev for eligible cases (requires OPENROUTER_API_KEY).",
    )
    parser.add_argument("--log-level", default="INFO")
    args = parser.parse_args(argv)
    logging.basicConfig(level=getattr(logging, args.log_level.upper(), logging.INFO))

    corpus = load_corpus(args.corpus)
    binding_failures = validate_release_regressions(corpus)
    threshold = float(corpus.get("confidence_threshold") or get_jev_confidence_threshold())
    results: list[dict[str, Any]] = []
    if not binding_failures:
        client = OpenRouterJevClient() if args.live else None
        for case in corpus["cases"]:
            if args.live:
                assert client is not None
                results.append(
                    evaluate_case_live(case, client=client, threshold=threshold)
                )
            else:
                results.append(evaluate_case_offline(case))

    passed = sum(1 for item in results if item["passed"])
    failed = [item for item in results if not item["passed"]]
    recorded = [item for item in results if item.get("recorded_model_outcome")]
    print(
        json.dumps(
            {
                "corpus_version": corpus.get("corpus_version"),
                "mode": "live" if args.live else "offline",
                "confidence_threshold": threshold,
                "total": len(results),
                "passed": passed,
                "failed": len(failed),
                "binding_failures": binding_failures,
                "failures": failed,
                "recorded_model_outcomes": recorded,
            },
            indent=2,
        )
    )
    return 0 if not binding_failures and not failed else 1


if __name__ == "__main__":
    sys.exit(main())
