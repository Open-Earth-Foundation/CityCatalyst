"""Brief: Audit the completed original-PDF study and write its overview.

Inputs:
- --experiment PATH: saved experiment directory, default benchmarks/runs/originals-v2.
- Prepared private keys, cached upstream scorer, and existing saved job artifacts.
- No API keys or environment variables are required; no provider calls are made.
- Requires final scores.json, input-audit.json and usage-reconciliation.json.
- Commentary is specific to the 17 November frozen study; --experiment can relocate
  that snapshot, not select an unrelated new study.
Outputs:
- audit.json, overview.md/html, benchmark-table.md and public frozen-source.zip.

Usage (from the pdf-extraction project root):
python -m examples.audit_experiment
"""

import argparse
import hashlib
import json
import logging
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean

from examples.experiment import aggregate, report_html
from extractor.benchmarks import ROOT, read_json

PROJECT = ROOT.parent
LOGGER = logging.getLogger(__name__)


def sha(path):
    """Hash exact bytes, without normalizing PDF or source content."""
    return hashlib.sha256(path.read_bytes()).hexdigest()


def pct(value):
    """Keep unavailable measurements separate from zero."""
    return "N/A" if value is None else f"{value:.1%}"


def baseline(items):
    """Count each historical case's attempts once, retaining failed attempts."""
    seen, records = set(), []
    for item in items:
        if item["canonicalId"] in seen:
            continue
        seen.add(item["canonicalId"])
        records.extend(
            {
                "totalOnly": item["totalOnly"],
                "score": run["rescored"],
                "pipelineAccepted": run["ok"],
                "strictTotalPassed": run["rescored"]["totalMatched"],
            }
            for run in item["baseline"]
        )
    return records


def benchmark_table(items: list[dict]) -> str:
    """Compare identical report IDs with the historical scorer's named metrics."""
    lines = [
        "# Benchmark comparison table · 17 November 2026",
        "",
        "This table compares the recorded old pipeline with the agent on the same report IDs and Product keys, using the cached, unchanged upstream PDF scorer. Each row summarizes three attempts. The old reference is the 12 November run from PR #3424; see ORIGINAL_PDF_RESULTS.md for its source and limitations.",
        "",
        "Recall, precision and F1 include failed attempts as zero. Total-only reports have no row metrics. Value accuracy is conditional on located references; classification is conditional on value matches. Their cells show the number of attempts with a defined metric (n/3), not row coverage. Failures remain visible in the last column. F1 is a derived comparison metric, not a claim about the old report's published headline recall.",
        "",
        "| Report / year | Pipeline | Recall | Precision | Row F1 | Value accuracy (defined) | Classification (defined) | Row-total passes | Failures |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for case in sorted({item["canonicalId"] for item in items}):
        attempts = [item for item in items if item["canonicalId"] == case]
        first = attempts[0]
        groups = [("Recorded old", baseline(attempts))] + [
            (
                "Agent / Mistral " + mode,
                [item for item in attempts if item["condition"] == mode],
            )
            for mode in ["off", "on"]
        ]
        for label, group in groups:
            if not group:
                continue
            stats = aggregate(group)
            values = [
                item["score"]["valueAccuracy"]
                for item in group
                if not item["totalOnly"]
                and item.get("pipelineAccepted")
                and item.get("score")
                and item["score"].get("valueAccuracy") is not None
            ]
            value = pct(mean(values)) if values else "N/A"
            lines.append(
                f"| {case} {first['city']} {first['year']} | {label} | {pct(stats['recall'])} | {pct(stats['precision'])} | {pct(stats['f1'])} | {value} ({len(values)}/{len(group)}) | {pct(stats['classification'])} ({stats['classification_defined_attempts']}/{len(group)}) | {stats['total_passes']}/{len(group)} | {stats['failures']} |"
            )
    lines.extend(
        [
            "",
            "Row-total passes use the same numeric target and tolerance, with failed attempts unable to pass. New outputs also require an unambiguous inclusion boundary. Reported source totals are a separate diagnostic; they can differ from the key's normalized row sum. The parent-to-.x representation adapter applies equally to both pipelines and never invents a scope.",
            "",
            "The old reference has no per-PDF hashes, different extraction models/prompts, and unreliable historical cost labels. This is a comparison with saved historical outputs, not a fresh current-production A/B run. Long Beach C-028 and Dunedin C-031 were already marked not fully held out. Published headline-eligibility gates are not reconstructed here because the source table-eligibility metadata is unavailable.",
            "",
            "Reproduce from prepared artifacts: python -m examples.audit_experiment. The generated table is benchmarks/runs/originals-v2/benchmark-table.md. This public file is a copy for branch review; private PDFs, keys and full traces remain ignored.",
        ]
    )
    return "\n".join(lines) + "\n"


def audit(output):
    """Verify frozen inputs and actual session metadata before summarizing outcomes."""
    plan = read_json(output / "plan.json")
    if plan["created_at"] != "2026-11-17T21:44:03.831221+00:00":
        raise ValueError(
            "This audit commentary belongs to the frozen 17 November study; use examples.experiment for a new study's report."
        )
    items = read_json(output / "scores.json")["comparisons"]
    expected = {job["id"] for job in plan["jobs"]}
    if (
        len(expected) != 81
        or len(plan["results"]) != 81
        or {item["experimentJob"] for item in items} != expected
        or len(items) != 81
    ):
        raise ValueError(
            "All 81 unique planned outcomes must be present before final audit."
        )
    ids = [item["jobId"] for item in items if item.get("jobId")]
    if len(ids) != len(set(ids)):
        raise ValueError("An extraction session appears in more than one attempt.")
    prompt_hashes = {}
    for item in items:
        name = item["canonicalId"]
        value = sha(Path(item["resultPath"]).parent / "user-prompt.md")
        if name in prompt_hashes and prompt_hashes[name] != value:
            raise ValueError(
                "Operator prompt differs across conditions/repeats: " + name
            )
        prompt_hashes[name] = value
    for name, expected_hash in plan["hashes"].items():
        if sha(PROJECT / name) != expected_hash:
            raise ValueError("Frozen file drift: " + name)
    inputs = read_json(output / "input-audit.json")
    provenance = read_json(ROOT / ".local/provenance.json")
    for name, info in provenance.items():
        if sha(ROOT / ".local/pdfs" / name) != info["sha256"]:
            raise ValueError("Original PDF drift: " + name)
    usage = read_json(output / "usage-reconciliation.json")["jobs"]
    for item in items:
        record = usage.get(item["experimentJob"])
        if item.get("jobId") and not record:
            raise ValueError(
                "Missing accounting/session audit: " + item["experimentJob"]
            )
        if record and (
            record["actual_model"] != "gpt-6.1-sol"
            or record["actual_reasoning"]["effort"] != "medium"
            or not 1 <= record["root_turns"] <= 4
        ):
            raise ValueError(
                "Session settings or repair cap drift: " + item["experimentJob"]
            )
        if (item.get("repair", {}).get("repairs") or 0) > 3:
            raise ValueError("Repair cap exceeded: " + item["experimentJob"])
    groups = []
    lines = [
        "# Benchmark overview",
        "",
        "Completed 66 Round 2 attempts (11 reports × Mistral OCR off/on × 3) and 15 held-out attempts (5 reports × 3 with the selected setting). Paris is excluded. The five held-out reports represent four cities: Chicago has two inventory years. All input PDFs are the supplied originals.",
        "",
        f"Model: gpt-6.1-sol; reasoning: medium; maximum three repairs after the initial turn. Held-out OCR setting selected from Round 2 only: {plan['selected_condition']}.",
        "",
        "Row F1 balances row recall and precision. Means include failed row-scored attempts as zero; total-only cases have no row score. Row totals and printed totals are different checks.",
        "",
        "| Set | Pipeline / OCR | Attempts (row-scored) | Recall | Precision | Row F1 | Row total passes | Execution/contract failures |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for stage in ["round2", "held-out"]:
        stage_items = [item for item in items if item["stage"] == stage]
        grouped = [("recorded old", baseline(stage_items))] + [
            (
                "agent / " + condition,
                [item for item in stage_items if item["condition"] == condition],
            )
            for condition in ["off", "on"]
        ]
        for label, group in grouped:
            if not group:
                continue
            stats = aggregate(group)
            groups.append({"stage": stage, "pipeline": label, **stats})
            lines.append(
                f"| {stage} | {label} | {stats['attempts']} ({stats['row_attempts']}) | {pct(stats['recall'])} | {pct(stats['precision'])} | {pct(stats['f1'])} | {stats['total_passes']}/{stats['attempts']} | {stats['failures']} |"
            )
    lines.extend(
        [
            "",
            "The agent pipeline improves the measured row F1 and row-total pass counts on both sets compared with the recorded old outputs. This is a comparison of complete pipelines, not proof that the agent harness alone caused the gain. Long Beach and Dunedin remain weak cases.",
            "Mistral did not improve average row F1 in this study: OCR off scored 85.8%, OCR on 84.1%. It added one row-total pass (25/33 versus 24/33), processed 1,281 pages, and used more agent input/output tokens. This does not show a reliable overall benefit on these reports; keep it optional. OCR off was selected before held-out evaluation.",
            "Automatic repair improved row-total passes but did not improve average row F1. Without Mistral, Round 2 artifact F1 moved from 86.8% initially to 85.8% finally, while row-total passes increased from 19/33 to 24/33. With Mistral, F1 moved from 86.1% to 84.1% and totals from 19/33 to 25/33. Held-out F1 moved from 61.5% to 61.2%, and totals from 4/15 to 7/15. Across 57 row-scored trajectories, two improved, 44 were unchanged and 11 regressed. Do not interpret more repair turns as a guaranteed accuracy improvement.",
            "The 81 attempts used 237 repair turns. Six stopped after two repairs; 75 reached all three and retained review flags. Final issue instances were 935 ambiguity flags and 21 consistency flags. The demo's flag-only default remains useful: many flags describe missing or combined source information that another identical check cannot resolve. No answer-key feedback or best-round selection was used.",
            "The next development work should make reporting periods and source-reported versus GPC-normalized boundaries explicit, support aggregates spanning multiple GPC subsectors, and stop repeated checks of confirmed source ambiguities. Dunedin interpreted requested year 2021 as 2020/21 and selected gross emissions; the key targets the report's 2021/22 net inventory (verified against physical PDF pages 5 and 30). Long Beach correctly found the printed gross 3,311,673, but its row total failed to exclude the key's 60,179 waste-to-energy and 608 imported-wastewater amounts: the key target is 3,250,886. These are retained held-out failures, not corrected by tuning prompts after evaluation. Münster's printed total is correct but no detailed 2022 rows are returned, so its row-total score fails. A matching year label alone does not prove the correct source period was selected.",
        ]
    )
    lines.extend(
        [
            "",
            "## Held-out history",
            "",
            "The cases previously marked not fully held out are kept visible, rather than treating all five reports as unseen.",
            "",
            "| Reports | Pipeline | Attempts | Row F1 | Row total passes | Failures |",
            "| --- | --- | --- | --- | --- | --- |",
        ]
    )
    for label, cases in [
        (
            "C-027 Chicago 2019, C-029 Chicago 2017, C-030 Porto Alegre",
            {"C-027", "C-029", "C-030"},
        ),
        ("Previously used: C-028 Long Beach, C-031 Dunedin", {"C-028", "C-031"}),
    ]:
        group = [
            item
            for item in items
            if item["stage"] == "held-out" and item["canonicalId"] in cases
        ]
        for pipeline, records in [
            ("recorded old", baseline(group)),
            ("agent / " + plan["selected_condition"], group),
        ]:
            stats = aggregate(records)
            groups.append(
                {
                    "stage": "held-out subset",
                    "reports": sorted(cases),
                    "pipeline": pipeline,
                    **stats,
                }
            )
            lines.append(
                f"| {label} | {pipeline} | {len(records)} | {pct(stats['f1'])} | {stats['total_passes']}/{len(records)} | {stats['failures']} |"
            )
    lines.extend(
        [
            "",
            "## Reported facts, repair use and resources",
            "",
            "Usage is the provider's best-effort session accounting, not a bill. Cached input is a subset of total input. Turn totals are never added to session totals. Collected time includes polling/collection delay; controller time runs from the original submission start through the server's final validation, including OCR and repairs. Timing comparisons remain limited by the documented early concurrency/reconnection incident. Year-label matching compares the integer reporting_year only; it does not independently establish the correct financial-year period or source column. The reported-total diagnostic compares the candidate with key.expectedTotal, which can be a selected GPC row sum rather than a printed gross headline. It is not independent verification that the candidate copied the headline correctly.",
            "",
            "| Set / OCR | Year label matches | Reported total matches key | Repair counts 0 / 1 / 2 / 3 | Still flagged | Mean collected / controller seconds | Mistral pages | Input / cached / output tokens |",
            "| --- | --- | --- | --- | --- | --- | --- | --- |",
        ]
    )
    resources = []
    for stage in ["round2", "held-out"]:
        for condition in ["off", "on"]:
            group = [
                item
                for item in items
                if item["stage"] == stage and item["condition"] == condition
            ]
            if not group:
                continue
            years = 0
            for item in group:
                result = read_json(Path(item["resultPath"]))
                years += (result.get("result") or {}).get("data", {}).get(
                    "reporting_year"
                ) == item["year"] and item["pipelineAccepted"]
            histogram = [
                sum(item.get("repair", {}).get("repairs") == number for item in group)
                for number in range(4)
            ]
            available_usage = [
                item["usage"]
                for item in group
                if item.get("usage")
                and usage.get(item["experimentJob"], {}).get("complete_usage")
            ]
            controller_seconds = []
            for item in group:
                folder = Path(item["resultPath"]).parent
                progress, run = read_json(folder / "progress.json"), read_json(
                    folder.parent / "run.json"
                )
                if progress.get("finished_at") and run.get("started_at"):
                    controller_seconds.append(
                        (
                            datetime.fromisoformat(progress["finished_at"])
                            - datetime.fromisoformat(run["started_at"])
                        ).total_seconds()
                    )
            resource = {
                "stage": stage,
                "ocr": condition,
                "attempts": len(group),
                "year_label_matches": years,
                "printed_total_matches": sum(
                    item.get("reportedTotalMatched") is True
                    and item["pipelineAccepted"]
                    for item in group
                ),
                "repair_histogram": histogram,
                "still_flagged": sum(
                    bool(item.get("repair", {}).get("repair_still_needed"))
                    for item in group
                ),
                "mean_seconds": mean(
                    item["execution"]["elapsed_seconds"] for item in group
                ),
                "mean_controller_seconds": (
                    mean(controller_seconds) if controller_seconds else None
                ),
                "controller_timing_known_jobs": len(controller_seconds),
                "mistral_pages": sum(
                    (document.get("usage_info") or {}).get("pages_processed", 0)
                    for item in group
                    for document in item.get("preprocessing", {}).get(
                        "ocr_documents", []
                    )
                ),
                "usage_known_jobs": len(available_usage),
                "input_tokens": (
                    sum(value.get("input_tokens") or 0 for value in available_usage)
                    if available_usage
                    else None
                ),
                "cached_input_tokens": (
                    sum(
                        (value.get("input_tokens_details") or {}).get("cached_tokens")
                        or 0
                        for value in available_usage
                    )
                    if available_usage
                    else None
                ),
                "output_tokens": (
                    sum(value.get("output_tokens") or 0 for value in available_usage)
                    if available_usage
                    else None
                ),
            }
            resources.append(resource)
            tokens = (
                " / ".join(
                    f"{resource[field]:,}" if resource[field] is not None else "unknown"
                    for field in [
                        "input_tokens",
                        "cached_input_tokens",
                        "output_tokens",
                    ]
                )
                + f" ({len(available_usage)}/{len(group)} jobs known)"
            )
            controller_time = (
                f"{resource['mean_controller_seconds']:.1f} ({len(controller_seconds)}/{len(group)} known)"
                if controller_seconds
                else "unknown"
            )
            lines.append(
                f"| {stage} / {condition} | {years}/{len(group)} | {resource['printed_total_matches']}/{len(group)} | {' / '.join(map(str, histogram))} | {resource['still_flagged']} | {resource['mean_seconds']:.1f} / {controller_time} | {resource['mistral_pages']} | {tokens} |"
            )
    lines.extend(
        [
            "",
            "## Limits and evidence",
            "",
            "- The recorded old results are historical, not a fresh run of current production. Their PDFs have no recorded per-file hashes; byte identity with the new originals cannot be checked. Both sets of saved row arrays are rescored with the same frozen Product keys and unchanged upstream scorer.",
            "- Different models, prompts and environments mean old/new compares complete pipelines. The new on/off comparison tests adding Mistral within the same agent pipeline. Three repeats and this small report set do not establish statistical significance.",
            "- Accepted output may still contain honest uncertainty. Still flagged means review/repair issues remain; it does not prove another turn can solve them. Source quotes and claimed page inspection are not independently verified.",
            "- Matching a printed total does not establish row coverage, row classification or source accuracy. Shared legacy scorer rules include parent-reference matching and treating absent expected-zero rows as matches.",
            "- The evaluator-only adapter amendment represents unsplit subsectors as nonnumeric .x references for the legacy all-scopes matcher. Scope and amounts never change; exact scoped keys still cannot match an unknown child/scope. The mapping applies to both pipelines. All 73 available historical scores replay exactly, across 81 recorded attempts. Preliminary scores and the old adapter are preserved. The corrected Round 2 scores still selected OCR off before inspecting new held-out outputs; the same first three hosted sessions were retained. Their collection time may include the evaluator pause.",
            "- Historical token/cost labels are not used for a quantitative resource comparison. New counts are reconciled from session metadata after completion. Original collected JSON is retained beside refreshed JSON; extraction fields and candidates are unchanged.",
            "- OCR off disables Mistral preprocessing. The agent still has original PDFs, image inspection and its configured local PDF/OCR tools. OCR on adds structured page/block/table context; it does not replace the original PDFs.",
            "- Early client reconnect recovery briefly overlapped six hosted jobs instead of three. The same sessions were resumed; no extraction attempts were replaced. Full old/new client hashes and affected jobs are recorded in plan.json.",
            "",
            "Detailed evidence: comparison.html / comparison.md; repair-analysis/report.md and summary.json; scores.json; plan.json; input-audit.json; usage-reconciliation.json; environment.json. Raw Mistral context is retained in hosted input files, not cached locally. Final evidence currently uses PDF pages and quotes, not exported bounding boxes.",
        ]
    )
    snapshot = output / "frozen-source.zip"
    with zipfile.ZipFile(snapshot, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in sorted(plan["hashes"]):
            if "/.local/" not in name and not name.startswith(".local/"):
                archive.write(PROJECT / name, arcname=name)
    result = {
        "audited_at": datetime.now(timezone.utc).isoformat(),
        "attempts": len(items),
        "unique_sessions": len(ids),
        "frozen_files_verified": len(plan["hashes"]),
        "original_pdfs_verified": len(provenance),
        "actual_models": dict(
            Counter(value["actual_model"] for value in usage.values())
        ),
        "reasoning_efforts": dict(
            Counter(value["actual_reasoning"]["effort"] for value in usage.values())
        ),
        "root_turn_counts": dict(
            Counter(value["root_turns"] for value in usage.values())
        ),
        "complete_usage_jobs": sum(
            value.get("complete_usage", False) for value in usage.values()
        ),
        "operator_prompt_hashes_verified_identical_per_case": prompt_hashes,
        "selected_condition": plan["selected_condition"],
        "groups": groups,
        "resources": resources,
        "public_source_snapshot_sha256": sha(snapshot),
        "original_zip_hashes": inputs["source_zip_sha256"],
    }
    (output / "audit.json").write_text(
        json.dumps(result, indent=2) + "\n", encoding="utf-8"
    )
    (output / "benchmark-table.md").write_text(benchmark_table(items), encoding="utf-8")
    markdown = "\n".join(lines) + "\n"
    (output / "overview.md").write_text(markdown, encoding="utf-8")
    (output / "overview.html").write_text(
        "<!doctype html><meta charset=utf-8><title>PDF extraction benchmark overview</title><style>body{font:16px/1.5 system-ui;max-width:1400px;margin:40px auto;padding:0 24px;color:#17232b}table{border-collapse:collapse;width:100%;margin:24px 0}th,td{border:1px solid #ccd6db;padding:9px;text-align:left}th{background:#edf3f4}h2{margin-top:44px}</style>"
        + report_html(markdown),
        encoding="utf-8",
    )
    LOGGER.info(
        "Audited %s attempts, %s unique sessions and %s frozen files",
        len(items),
        len(ids),
        len(plan["hashes"]),
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
    audit(args.experiment)


if __name__ == "__main__":
    main()
