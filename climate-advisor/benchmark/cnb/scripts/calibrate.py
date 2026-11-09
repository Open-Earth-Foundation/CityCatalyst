"""Check the extraction judge against separately human-approved candidates.

Inputs: --cases JSON candidate/label set, --fixtures-dir reference corpus,
--output-dir new report directory. OPENROUTER_API_KEY and llm_config.yaml are
used only for approved cases. Pending/stale approvals produce no provider call.
Outputs: calibration.json, calibration.md with confusion matrix, denominators,
serious false passes and unavailable/pending cases. Never replaces approvals.
Usage (from climate-advisor/): python -m benchmark.cnb.scripts.calibrate
"""

from __future__ import annotations

import argparse
import asyncio
import logging
from pathlib import Path

from app.config import get_settings

from benchmark.cnb.golden_set.calibration import (
    VERDICTS,
    evaluate_calibration,
    load_calibration_cases,
)
from benchmark.cnb.golden_set.core import load_golden_fixtures

SUITE = Path(__file__).resolve().parents[1]
logger = logging.getLogger(__name__)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Select private labels, fixed reference corpus and new report location."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", type=Path, default=SUITE / "calibration/cases.json")
    parser.add_argument("--fixtures-dir", type=Path, default=SUITE / "fixtures")
    parser.add_argument(
        "--output-dir", type=Path, default=SUITE.parents[1] / "output/cnb_calibration"
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    """Write judge calibration evidence; unavailable approvals cannot pass."""
    args = parse_args(argv)
    logging.basicConfig(level=logging.INFO)
    if (args.output_dir / "calibration.json").exists():
        logger.error("Calibration report already exists; select a new --output-dir")
        return 2
    settings = get_settings()
    fixtures = {
        item.fixture.fixture_id: item
        for item in load_golden_fixtures(args.fixtures_dir)
    }
    prompt = settings.llm.prompts.get_prompt("cnb_golden_set_extraction_judge")
    cases = load_calibration_cases(args.cases, fixtures, prompt)
    report = asyncio.run(
        evaluate_calibration(cases, fixtures, settings, args.output_dir)
    )
    lines = [
        "# Judge calibration",
        "",
        f"Agreement: {report['agree']}/{report['evaluated']}",
        f"Pending approval: {report['pending']}; unavailable: {report['unavailable']}",
        f"Serious false passes: {len(report['serious_false_passes'])}",
        "",
        "| Human / Judge | " + " | ".join(VERDICTS) + " |",
        "|---|" + "---|" * len(VERDICTS),
    ]
    for verdict, counts in report["confusion_matrix"].items():
        lines.append(
            "| " + verdict + " | " + " | ".join(str(counts[v]) for v in VERDICTS) + " |"
        )
    lines.extend(
        [
            "",
            "## Serious false passes",
            *[f"- {case}" for case in report["serious_false_passes"]],
        ]
    )
    (args.output_dir / "calibration.md").write_text(
        "\n".join(lines) + "\n", encoding="utf-8"
    )
    if report["pending"] or report["unavailable"] or not report["evaluated"]:
        return 3
    return int(report["agree"] != report["evaluated"])


if __name__ == "__main__":
    raise SystemExit(main())
