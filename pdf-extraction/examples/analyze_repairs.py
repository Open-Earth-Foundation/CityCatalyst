"""Brief: Score saved repair trajectories without changing primary results.

Inputs:
- --experiment PATH: saved experiment directory, default benchmarks/runs/originals-v2.
- Prepared private keys, cached upstream scorer, and existing saved job artifacts.
- No API keys or environment variables are required; no provider calls are made.
- Requires all 81 outcomes in the original study plan.
Outputs:
- repair-analysis/scoring-input.json, scores.json, summary.json, report.md/html.

Usage (from the pdf-extraction project root):
python -m examples.analyze_repairs
"""

import argparse
import hashlib
import json
import logging
from collections import Counter
from pathlib import Path
from statistics import mean

from examples.compare_benchmarks import run_bridge, verify_sources
from examples.experiment import report_html
from extractor.benchmarks import ROOT, read_json

LOGGER = logging.getLogger(__name__)


def digest(path):
    """Check that offline evaluation never rewrites a saved result."""
    return hashlib.sha256(path.read_bytes()).hexdigest()


def artifact_metrics(item):
    """Compare candidate artifacts, separately from end-to-end acceptance."""
    score = item.get("score") or {}
    recall, precision = score.get("rowRecall") or 0, score.get("rowPrecision") or 0
    return {
        "recall": None if item["totalOnly"] else recall,
        "precision": None if item["totalOnly"] else precision,
        "f1": (
            None
            if item["totalOnly"]
            else (
                2 * recall * precision / (recall + precision)
                if recall + precision
                else 0
            )
        ),
        "row_total_pass": bool(item.get("strictTotalPassed")),
        "printed_total_match": item.get("reportedTotalMatched"),
        "schema_accepted": item.get("pipelineAccepted"),
    }


def analyze(output):
    """Evaluate all collected candidates using exactly the frozen Product keys."""
    plan = read_json(output / "plan.json")
    if len(plan["results"]) != len(plan["jobs"]) or len(plan["jobs"]) != 81:
        raise ValueError(
            "Wait for all 66 Round 2 and 15 held-out outcomes before this analysis."
        )
    verify_sources(ROOT, read_json(ROOT / ".local/comparison-source.json"))
    canonical = {
        item["id"]: item for item in read_json(ROOT / "references/real-cases.json")
    }
    keys = read_json(ROOT / ".local/answer-keys.json")["files"]
    candidates, records, hashes = [], [], {}
    for job in plan["jobs"]:
        path = output / "jobs" / job["id"] / job["case"] / "result.json"
        if not path.exists():
            records.append(
                {
                    **job,
                    "trajectory_available": False,
                    "reason": "No saved result artifact",
                    "outcome": plan["results"][job["id"]],
                }
            )
            continue
        hashes[str(path)] = digest(path)
        envelope = read_json(path)
        rounds = envelope.get("repair", {}).get("rounds", [])
        record = {
            **job,
            "trajectory_available": bool(rounds),
            "job_id": envelope.get("job_id"),
            "execution_status": envelope.get("execution_status"),
            "repairs": envelope.get("repair", {}).get("repairs"),
            "repair_still_needed": envelope.get("repair", {}).get(
                "repair_still_needed"
            ),
            "rounds": [],
        }
        for turn in rounds:
            candidate = turn.get("candidate")
            categories = Counter(
                issue.get("category", "unknown")
                for issue in turn.get("issue_details", [])
            )
            record["rounds"].append(
                {
                    "round": turn["round"],
                    "turn_id": turn.get("turn_id"),
                    "issues": sum(categories.values()),
                    "issue_categories": dict(categories),
                    "resolved_issue_keys": turn.get("resolved_issue_keys", []),
                    "new_issue_keys": turn.get("new_issue_keys", []),
                    "changed_data_paths": turn.get("changed_data_paths", []),
                    "reporting_year_match": (
                        candidate.get("data", {}).get("reporting_year")
                        == canonical[job["case"]]["year"]
                        if candidate
                        else False
                    ),
                }
            )
            candidates.append(
                {
                    "attemptId": job["id"],
                    "round": turn["round"],
                    "canonicalId": job["case"],
                    "totalOnly": canonical[job["case"]]["totalOnly"],
                    "envelope": {
                        "result": candidate,
                        "validation": {
                            "data_schema": (
                                "failed" if categories.get("schema") else "passed"
                            )
                        },
                        "execution_status": "completed",
                    },
                }
            )
        records.append(record)
    evaluated = run_bridge(
        {"demo": candidates, "keys": keys, "baseline": {"results": []}},
        output / "repair-analysis",
    )
    indexed = {
        (item["attemptId"], item["round"]): item for item in evaluated["comparisons"]
    }
    for record in records:
        for turn in record.get("rounds", []):
            turn["metrics"] = artifact_metrics(indexed[(record["id"], turn["round"])])
        if record.get("rounds"):
            before, after = record["rounds"][0], record["rounds"][-1]
            initial, final = before["metrics"], after["metrics"]
            record["initial"] = initial
            record["final"] = final
            record["f1_change"] = (
                final["f1"] - initial["f1"] if initial["f1"] is not None else None
            )
            record["issues_change"] = after["issues"] - before["issues"]
    for path, before in hashes.items():
        if digest(Path(path)) != before:
            raise ValueError("Saved result changed during offline analysis: " + path)
    groups = []
    lines = [
        "# Repair trajectory analysis",
        "",
        "All scoring is retrospective and offline. Answer keys were never provided to the agents or repair loop. Primary benchmark scores use the actual final output, never a best-scoring intermediate round. Candidate scores below describe artifacts, not end-to-end pipeline acceptance. An issue can disappear because rows change; stable issue keys use JSON paths, not logical fact identities.",
        "",
        "| Set / OCR | Jobs / trajectories | Initial → final mean row F1 | F1 improved / unchanged / worse | Initial → final row total passes | Initial → final issue count | Still flagged |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for stage in ["round2", "held-out"]:
        for condition in ["off", "on"]:
            jobs = [
                item
                for item in records
                if item["stage"] == stage and item["ocr"] == condition
            ]
            if not jobs:
                continue
            trajectories = [item for item in jobs if item.get("rounds")]
            rows = [item for item in trajectories if item["f1_change"] is not None]
            changes = Counter(
                (
                    "improved"
                    if item["f1_change"] > 1e-12
                    else "worse" if item["f1_change"] < -1e-12 else "unchanged"
                )
                for item in rows
            )
            group = {
                "stage": stage,
                "ocr": condition,
                "jobs": len(jobs),
                "trajectories": len(trajectories),
                "row_trajectories": len(rows),
                "initial_f1": (
                    mean(item["initial"]["f1"] for item in rows) if rows else None
                ),
                "final_f1": (
                    mean(item["final"]["f1"] for item in rows) if rows else None
                ),
                "f1_changes": dict(changes),
                "initial_total_passes": sum(
                    item["initial"]["row_total_pass"] for item in trajectories
                ),
                "final_total_passes": sum(
                    item["final"]["row_total_pass"] for item in trajectories
                ),
                "initial_issues": sum(
                    item["rounds"][0]["issues"] for item in trajectories
                ),
                "final_issues": sum(
                    item["rounds"][-1]["issues"] for item in trajectories
                ),
                "still_flagged": sum(
                    bool(item.get("repair_still_needed")) for item in trajectories
                ),
            }
            groups.append(group)
            lines.append(
                f"| {stage} / {condition} | {len(jobs)} / {len(trajectories)} | {group['initial_f1']:.1%} → {group['final_f1']:.1%} | {changes['improved']} / {changes['unchanged']} / {changes['worse']} | {group['initial_total_passes']} → {group['final_total_passes']} | {group['initial_issues']} → {group['final_issues']} | {group['still_flagged']} |"
            )
    lines.extend(
        [
            "",
            "## Per attempt",
            "",
            "| Attempt | Repairs | Initial → final row F1 | Initial → final total pass | Initial → final issues | Still flagged |",
            "| --- | --- | --- | --- | --- | --- |",
        ]
    )
    for item in records:
        if not item.get("rounds"):
            lines.append(
                f"| {item['id']} | N/A | No trajectory | N/A | N/A | See execution outcome |"
            )
            continue
        initial, final = item["initial"], item["final"]
        f1 = (
            f"{initial['f1']:.1%} → {final['f1']:.1%}"
            if initial["f1"] is not None
            else "N/A (total-only)"
        )
        lines.append(
            f"| {item['id']} | {item['repairs']} | {f1} | {initial['row_total_pass']} → {final['row_total_pass']} | {item['rounds'][0]['issues']} → {item['rounds'][-1]['issues']} | {item.get('repair_still_needed')} |"
        )
    destination = output / "repair-analysis"
    (destination / "summary.json").write_text(
        json.dumps(
            {"groups": groups, "attempts": records, "verified_result_hashes": hashes},
            indent=2,
        ),
        encoding="utf-8",
    )
    markdown = "\n".join(lines) + "\n"
    (destination / "report.md").write_text(markdown, encoding="utf-8")
    (destination / "report.html").write_text(
        "<!doctype html><meta charset=utf-8><title>Repair trajectory analysis</title><style>body{font:16px/1.5 system-ui;max-width:1400px;margin:40px auto;padding:0 24px;color:#17232b}table{border-collapse:collapse;display:block;overflow-x:auto;margin:24px 0}th,td{border:1px solid #ccd6db;padding:9px;text-align:left}th{background:#edf3f4}</style><nav><a href='../overview.html'>Benchmark overview</a> · <a href='../comparison.html'>Full comparison</a></nav>"
        + report_html(markdown),
        encoding="utf-8",
    )
    LOGGER.info(
        "Saved %s candidate scores across %s attempt trajectories",
        len(candidates),
        len(records),
    )


def parse_args() -> argparse.Namespace:
    """Select the saved experiment directory without starting provider work."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--experiment",
        type=Path,
        default=ROOT / "runs/originals-v2",
        help="Saved experiment directory (default benchmarks/runs/originals-v2)",
    )
    return parser.parse_args()


def main() -> None:
    """Run the offline report against existing local artifacts."""
    args = parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    analyze(args.experiment)


if __name__ == "__main__":
    main()
