"""Opt-in credentialed evaluation of the authority-scope corpus against Jev.

Ordinary unit tests must not call this. Run explicitly when OPENROUTER_API_KEY
is available and a legal owner is ready to inspect low-confidence rows.

  uv run python -m app.scripts.evaluate_authority_scope_corpus
  uv run python -m app.scripts.evaluate_authority_scope_corpus --live
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path
from typing import Any

from app.modules.prioritizer.authority_scope import (
    classifier_input_from_legal_row,
    resolve_report_authority_scope,
)
from app.services.openrouter_jev_client import (
    OpenRouterJevClient,
    get_jev_confidence_threshold,
)

logger = logging.getLogger(__name__)

DEFAULT_CORPUS_PATH = (
    Path(__file__).resolve().parents[2]
    / "data"
    / "authority_scope"
    / "evaluation_corpus_v1.json"
)


def load_corpus(path: Path) -> dict[str, Any]:
    """Load the reviewed evaluation corpus."""
    return json.loads(path.read_text(encoding="utf-8"))


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

    classifier_input = classifier_input_from_legal_row(
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
    result = client.classify_authority_scope(classifier_input=classifier_input)
    confidence_passed = float(result["confidence"]) >= threshold
    report_label, status = resolve_report_authority_scope(
        verdict_category=case.get("verdict_category"),
        ownership_category=case.get("ownership_category"),
        selected_label=result["selected_label"],
        label_accepted=True,
        confidence_passed=confidence_passed,
    )
    expected = case["expected_report_scope"]
    return {
        "case_id": case["case_id"],
        "mode": "live_jev",
        "expected_report_scope": expected,
        "actual_report_scope": report_label,
        "selected_label": result["selected_label"],
        "confidence": result["confidence"],
        "confidence_passed": confidence_passed,
        "status": status,
        "passed": report_label == expected,
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
    threshold = float(corpus.get("confidence_threshold") or get_jev_confidence_threshold())
    results: list[dict[str, Any]] = []
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
    print(
        json.dumps(
            {
                "corpus_version": corpus.get("corpus_version"),
                "mode": "live" if args.live else "offline",
                "confidence_threshold": threshold,
                "total": len(results),
                "passed": passed,
                "failed": len(failed),
                "failures": failed,
            },
            indent=2,
        )
    )
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
