"""Brief: Freeze, resume and compare the original-PDF OCR experiment.

Inputs:
- --stage prepare|round2|held-out|report: operation (default report).
- --output PATH: experiment root (default benchmarks/runs/originals-v2).
- --base-url URL: local API (default http://127.0.0.1:8081).
- --workers 1..3: simultaneous independent jobs (default 3).
- --execute: required for paid round2/held-out execution; otherwise check only.
- Prepared original PDFs/keys and pinned scorer/baseline under benchmarks/.local.
Outputs: frozen plan.json, per-job runner outputs, scores.json, comparison.md/html.
The plan pins inputs/code/prompts/settings; drift blocks further submission.
Held-out automatically uses the condition selected only from Round 2 results.
Existing job IDs are resumed; uncertain submissions stop the experiment.
Usage (from pdf-extraction):
.venv\\Scripts\\python.exe -m examples.experiment --stage prepare
.venv\\Scripts\\python.exe -m examples.experiment --stage round2 --execute
"""

import argparse
import hashlib
import html
import json
import logging
import random
import sys
import time
from contextlib import contextmanager
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean

import httpx

from examples.benchmark import execute, write_json
from examples.extract import get_job
from examples.compare_benchmarks import collect_attempts, run_bridge, verify_sources
from extractor.benchmarks import BenchmarkCatalog, ROOT, read_json
from extractor.config import Settings
from extractor.reproducibility import implementation_hashes, implementation_fingerprint

LOGGER = logging.getLogger(__name__)
ROUND2 = [f"C-{number:03}" for number in range(15, 26)]
HELDOUT = [f"C-{number:03}" for number in range(27, 32)]


@contextmanager
def experiment_lock(output: Path):
    """Prevent simultaneous paid drivers; OS releases the lock after a crash."""
    output.mkdir(parents=True, exist_ok=True)
    with (output / "execution.lock").open("a+b") as handle:
        if handle.tell() == 0:
            handle.write(b"0")
            handle.flush()
        handle.seek(0)
        try:
            if sys.platform == "win32":
                import msvcrt

                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            raise ValueError(
                "Another driver owns this experiment; inspect its existing jobs instead of starting a second copy."
            ) from error
        try:
            yield
        finally:
            handle.seek(0)
            if sys.platform == "win32":
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle, fcntl.LOCK_UN)


def parse_args() -> argparse.Namespace:
    """Select a frozen experiment operation; paid work requires an explicit flag."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--stage", choices=["prepare", "round2", "held-out", "report"], default="report"
    )
    parser.add_argument("--output", type=Path, default=ROOT / "runs/originals-v2")
    parser.add_argument("--base-url", default="http://127.0.0.1:8081")
    parser.add_argument("--workers", type=int, choices=range(1, 4), default=3)
    parser.add_argument(
        "--execute", action="store_true", help="Authorize the selected paid stage"
    )
    return parser.parse_args()


def now() -> str:
    """Return an unambiguous UTC timestamp for experiment checkpoints."""
    return datetime.now(timezone.utc).isoformat()


def file_hash(path: Path) -> str:
    """Hash exact input bytes; never normalize PDFs or schema text."""
    return hashlib.sha256(path.read_bytes()).hexdigest()


def workload(stage: str, condition: str | None = None) -> list[dict]:
    """Balance and reproducibly shuffle independent case/condition repetitions."""
    cases = ROUND2 if stage == "round2" else HELDOUT
    conditions = ["off", "on"] if stage == "round2" else [condition]
    if any(value not in {"off", "on"} for value in conditions):
        raise ValueError("Held-out requires the Round 2 selected condition.")
    jobs = [
        {
            "id": f"{stage}-{case}-{ocr}-{repeat}",
            "stage": stage,
            "case": case,
            "ocr": ocr,
            "repeat": repeat,
        }
        for repeat in range(1, 4)
        for case in cases
        for ocr in conditions
    ]
    random.Random(20261117).shuffle(jobs)
    return jobs


def headers() -> dict:
    """Load only the local service token; it never enters plan or agent context."""
    token = Settings.from_env().service_api_key
    return {"Authorization": "Bearer " + token} if token else {}


def server_configuration(base_url: str) -> dict:
    """Read the running API settings without starting a provider request."""
    with httpx.Client(base_url=base_url, headers=headers(), timeout=30) as client:
        response = client.get("/v1/config")
        response.raise_for_status()
        config = response.json()
    if not config.get("ready") or not config.get("mistral_ocr_ready"):
        raise ValueError(
            "Both OpenAI and Mistral must be configured for the paired experiment."
        )
    return {
        key: config[key]
        for key in [
            "model",
            "reasoning_effort",
            "mistral_ocr_model",
            "implementation_fingerprint",
        ]
    }


def freeze(output: Path, base_url: str) -> dict:
    """Pin original inputs and all implementation settings before paid evaluation."""
    if (output / "plan.json").exists():
        raise ValueError(
            "Plan already exists; use its execution/report stages. Do not overwrite a frozen experiment."
        )
    catalog = BenchmarkCatalog()
    provenance = read_json(ROOT / ".local/provenance.json")
    hashes = implementation_hashes()
    for case_id in ROUND2 + HELDOUT + ["C-032"]:
        case = catalog.get(case_id)
        path = catalog.path(case["pdf"])
        digest = file_hash(path)
        record = provenance.get(path.name, {})
        if (
            record.get("sha256") != digest
            or ".zip:" not in record.get("source", "").lower()
        ):
            raise ValueError(
                f"{case_id}: expected the hashed original imported from the supplied Drive ZIP."
            )
        hashes[str(path.relative_to(ROOT.parent)).replace("\\", "/")] = digest
    for path in [
        ROOT / ".local/answer-keys.json",
        ROOT / ".local/recorded-benchmark.json",
        ROOT / ".local/comparison-source.json",
        ROOT / ".local/upstream/tsconfig.json",
    ]:
        hashes[str(path.relative_to(ROOT.parent)).replace("\\", "/")] = file_hash(path)
    verify_sources(ROOT, read_json(ROOT / ".local/comparison-source.json"))
    config = server_configuration(base_url)
    if config["model"] != "gpt-6.1-sol" or config["reasoning_effort"] != "medium":
        raise ValueError(
            "The agreed experiment requires gpt-6.1-sol with medium reasoning."
        )
    if config["implementation_fingerprint"] != implementation_fingerprint():
        raise ValueError("Restart the API after code changes before freezing.")
    plan = {
        "created_at": now(),
        "base_url": base_url,
        "settings": config,
        "max_repairs": 3,
        "auto_repair": True,
        "hashes": hashes,
        "jobs": workload("round2"),
        "results": {},
        "selection_rule": "lexicographic: mean per-attempt row F1 (failed=0), strict row-total pass share, mean row recall, mean row precision; exact tie selects OCR off. Total-only cases excluded from row means.",
        "heldout_notes": "Long Beach C-028 and Dunedin C-031 were previously marked not fully held out; report separately. No tuning on held-out answers.",
    }
    output.mkdir(parents=True, exist_ok=True)
    write_json(output / "plan.json", plan)
    return plan


def check_frozen(plan: dict) -> None:
    """Block code/input/settings drift before starting or resuming paid jobs."""
    for relative, expected in plan["hashes"].items():
        if file_hash(ROOT.parent / relative) != expected:
            raise ValueError("Frozen input/implementation changed: " + relative)
    verify_sources(ROOT, read_json(ROOT / ".local/comparison-source.json"))
    if server_configuration(plan["base_url"]) != plan["settings"]:
        raise ValueError("Running API differs from the frozen configuration.")


def run_one(job: dict, output: Path, plan: dict) -> dict:
    """Run/resume one job using the durable runner; never retry an unknown send."""
    directory = output / "jobs" / job["id"]
    started = time.monotonic()
    args = argparse.Namespace(
        resume=directory if (directory / "run.json").exists() else None,
        cases=job["case"],
        group=None,
        output=directory,
        mistral_ocr=job["ocr"] == "on",
        auto_repair=True,
        max_repairs=3,
        base_url=plan["base_url"],
        timeout=5400,
        poll_interval=5,
    )
    with httpx.Client(
        base_url=plan["base_url"],
        headers=headers(),
        timeout=180,
        limits=httpx.Limits(keepalive_expiry=1),
    ) as client:
        code = execute(args, BenchmarkCatalog(), client)
        run = read_json(directory / "run.json")
        state = run["results"][job["case"]]
        if state.get("job_id"):
            response = get_job(
                client, f"/v1/extractions/{state['job_id']}", time.monotonic() + 120
            )
            write_json(directory / job["case"] / "progress.json", response.json())
        return {
            "status": state["status"],
            "job_id": state.get("job_id"),
            "runner_exit": code,
            "elapsed_seconds": (
                datetime.now(timezone.utc) - datetime.fromisoformat(run["started_at"])
            ).total_seconds(),
            "polling_seconds_this_process": time.monotonic() - started,
            "finished_at": now(),
            "error": state.get("error"),
            "poll_retry_count": (
                len(
                    (directory / job["case"] / "poll-retries.jsonl")
                    .read_text(encoding="utf-8")
                    .splitlines()
                )
                if (directory / job["case"] / "poll-retries.jsonl").exists()
                else 0
            ),
        }


def score_saved(output: Path, plan: dict) -> dict:
    """Score all attempted original jobs, preserving failures and per-turn data."""
    directories = [
        output / "jobs" / job["id"]
        for job in plan["jobs"]
        if (output / "jobs" / job["id"] / "run.json").exists()
    ]
    if not directories:
        return {"comparisons": []}
    attempts, _ = collect_attempts(ROOT, directories)
    mapping = {
        str((output / "jobs" / job["id"] / job["case"]).resolve()): job
        for job in plan["jobs"]
    }
    for attempt in attempts:
        job = mapping[str(Path(attempt["resultPath"]).parent)]
        attempt.update(
            condition=job["ocr"],
            repeat=job["repeat"],
            stage=job["stage"],
            experimentJob=job["id"],
            execution=plan["results"].get(job["id"], {}),
        )
    payload = {
        "demo": attempts,
        "keys": read_json(ROOT / ".local/answer-keys.json")["files"],
        "baseline": read_json(ROOT / ".local/recorded-benchmark.json"),
    }
    result = run_bridge(payload, output / "scoring")
    write_json(output / "scores.json", result)
    return result


def aggregate(attempts: list[dict]) -> dict:
    """Count failed attempts as zero recall/precision; retain total-only separation."""
    row_attempts = [item for item in attempts if not item["totalOnly"]]

    def accepted(item):
        """Use end-to-end acceptance separately from raw artifact scoring."""
        return item.get("pipelineAccepted", item.get("score") is not None)

    def metric(field):
        """Average one row metric with explicit end-to-end failure zeros."""
        return (
            mean(
                (item.get("score") or {}).get(field) or 0 if accepted(item) else 0
                for item in row_attempts
            )
            if row_attempts
            else None
        )

    class_values = [
        (item.get("score") or {}).get("classificationAccuracy")
        for item in row_attempts
        if accepted(item)
    ]
    class_values = [value for value in class_values if value is not None]
    f1_values = []
    for item in row_attempts:
        score = item.get("score") or {}
        recall, precision = score.get("rowRecall") or 0, score.get("rowPrecision") or 0
        f1_values.append(
            2 * recall * precision / (recall + precision)
            if accepted(item) and recall + precision
            else 0
        )
    return {
        "attempts": len(attempts),
        "row_attempts": len(row_attempts),
        "recall": metric("rowRecall"),
        "precision": metric("rowPrecision"),
        "f1": mean(f1_values) if f1_values else None,
        "classification": mean(class_values) if class_values else None,
        "classification_defined_attempts": len(class_values),
        "total_passes": sum(
            bool(item.get("strictTotalPassed")) and accepted(item) for item in attempts
        ),
        "failures": sum(not accepted(item) for item in attempts),
        "repairs": sum(item.get("repair", {}).get("repairs") or 0 for item in attempts),
        "still_needing_repair": sum(
            bool(item.get("repair", {}).get("repair_still_needed")) for item in attempts
        ),
    }


def choose_condition(comparisons: list[dict]) -> str:
    """Apply the selection rule using complete Round 2 data only."""
    groups = {
        condition: [
            item
            for item in comparisons
            if item["stage"] == "round2" and item["condition"] == condition
        ]
        for condition in ["off", "on"]
    }
    if any(len(items) != 33 for items in groups.values()):
        raise ValueError(
            "Both OCR conditions require 33 recorded Round 2 attempts before selecting held-out settings."
        )

    def rank(condition):
        """Use the predeclared order; exact tie prefers less preprocessing."""
        stats = aggregate(groups[condition])
        return (
            stats["f1"],
            stats["total_passes"] / stats["attempts"],
            stats["recall"],
            stats["precision"],
            condition == "off",
        )

    return max(groups, key=rank)


def render(output: Path, plan: dict, scores: dict) -> None:
    """Write readable overall/per-city metrics, failures and full repair summaries."""
    comparisons = scores["comparisons"]
    source = read_json(ROOT / ".local/comparison-source.json")
    lines = [
        "# Original-PDF agent benchmark",
        "",
        f"Frozen: {plan['created_at']}; model `{plan['settings']['model']}`, reasoning `{plan['settings']['reasoning_effort']}`, Mistral `{plan['settings']['mistral_ocr_model']}`, maximum **3 repairs after initial extraction**.",
        f"Recorded old pipeline: [{source['recorded_run']}]({source['recorded_report_url']}) (Mistral OCR + gpt-5.6-luna; three attempts).",
        "",
        f"Recorded jobs: **{len(comparisons)}/{len(plan['jobs'])}**. Settings/inputs/scorer hashes are in plan.json. New PDF inputs come only from the supplied Drive ZIPs; Paris is excluded.",
        "",
        "| Set / condition | Attempts (row-scored) | Row recall | Row precision | Row F1 | Row total passes | Pipeline failures | Repair turns | Still needing review/repair |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]

    def pct(value):
        """Keep unavailable rates visibly distinct from zero."""
        return "N/A" if value is None else f"{value:.1%}"

    for stage in ["round2", "held-out"]:
        stage_items = [item for item in comparisons if item["stage"] == stage]
        seen_cases, baseline_items = set(), []
        for item in stage_items:
            if item["canonicalId"] not in seen_cases:
                seen_cases.add(item["canonicalId"])
                baseline_items.extend(
                    {
                        "totalOnly": item["totalOnly"],
                        "score": run["rescored"],
                        "pipelineAccepted": run["ok"],
                        "strictTotalPassed": run["rescored"]["totalMatched"],
                    }
                    for run in item["baseline"]
                )
        if baseline_items:
            a = aggregate(baseline_items)
            lines.append(
                f"| {stage} / recorded old (rescored) | {a['attempts']} ({a['row_attempts']}) | {pct(a['recall'])} | {pct(a['precision'])} | {pct(a['f1'])} | {a['total_passes']}/{a['attempts']} | {a['failures']} | N/A | N/A |"
            )
        for condition in ["off", "on"]:
            attempts = [
                item
                for item in comparisons
                if item["stage"] == stage and item["condition"] == condition
            ]
            if not attempts:
                continue
            a = aggregate(attempts)
            lines.append(
                f"| {stage} / OCR {condition} | {a['attempts']} ({a['row_attempts']}) | {pct(a['recall'])} | {pct(a['precision'])} | {pct(a['f1'])} | {a['total_passes']}/{a['attempts']} | {a['failures']} | {a['repairs']} | {a['still_needing_repair']} |"
            )
    lines.extend(
        [
            "",
            "## Per-report comparison",
            "",
            "| Case | Output | Attempts | Recall | Precision | Conditional classification | Row total passes | Failures |",
            "| --- | --- | --- | --- | --- | --- | --- | --- |",
        ]
    )
    for case in ROUND2 + HELDOUT:
        items = [item for item in comparisons if item["canonicalId"] == case]
        if not items:
            continue
        first = items[0]
        old = first["baseline"]
        # Rescore the recorded stored rows using the same frozen keys/profile.
        old_items = [
            {
                "totalOnly": first["totalOnly"],
                "score": run["rescored"],
                "pipelineAccepted": run["ok"],
                "strictTotalPassed": run["rescored"]["totalMatched"],
            }
            for run in old
        ]
        for label, group in [("Recorded old pipeline", old_items)] + [
            (
                "Agent OCR " + condition,
                [item for item in items if item["condition"] == condition],
            )
            for condition in ["off", "on"]
        ]:
            if not group:
                continue
            a = aggregate(group)
            lines.append(
                f"| {case} {first['city']} | {label} | {a['attempts']} | {pct(a['recall'])} | {pct(a['precision'])} | {pct(a['classification'])} ({a['classification_defined_attempts']} defined) | {a['total_passes']}/{a['attempts']} | {a['failures']} |"
            )
    lines.extend(
        [
            "",
            "## Agent resources and repair use",
            "",
            "These compare new OCR conditions only. Token counts are best-effort session totals; known-count coverage is shown. Job latency includes preprocessing and all repairs. Historical pipeline timing also includes different import/environment work.",
            "",
            "| Group | Attempts | Mean job seconds | Input tokens (known jobs) | Output tokens (known jobs) | Repair distribution 0 / 1 / 2 / 3 |",
            "| --- | --- | --- | --- | --- | --- |",
        ]
    )
    resource_groups = [
        (
            stage + " / OCR " + condition,
            [
                item
                for item in comparisons
                if item["stage"] == stage and item["condition"] == condition
            ],
        )
        for stage in ["round2", "held-out"]
        for condition in ["off", "on"]
    ]
    resource_groups += [
        (
            case + " / OCR " + condition,
            [
                item
                for item in comparisons
                if item["canonicalId"] == case and item["condition"] == condition
            ],
        )
        for case in ROUND2 + HELDOUT
        for condition in ["off", "on"]
    ]
    for label, items in resource_groups:
        if not items:
            continue
        latencies = [item.get("execution", {}).get("elapsed_seconds") for item in items]
        latencies = [value for value in latencies if isinstance(value, (int, float))]
        tokens = []
        for field in ["input_tokens", "output_tokens"]:
            values = [(item.get("usage") or {}).get(field) for item in items]
            values = [value for value in values if isinstance(value, (int, float))]
            tokens.append(
                f"{sum(values):,.0f} ({len(values)}/{len(items)})"
                if values
                else "unknown"
            )
        histogram = [
            sum(item.get("repair", {}).get("repairs") == number for item in items)
            for number in range(4)
        ]
        latency = f"{mean(latencies):.1f}" if latencies else "unknown"
        lines.append(
            f"| {label} | {len(items)} | {latency} | {tokens[0]} | {tokens[1]} | "
            + " / ".join(map(str, histogram))
            + " |"
        )
    lines.extend(
        [
            "",
            "## Interpretation",
            "",
            "- Primary row means include every attempted row-scored case, with execution/contract/schema failures as zero. Total-only cases have no row metrics. Raw scorer metrics remain in scores.json.",
            "- Row F1 is the harmonic mean of recall and precision for each attempt, averaged with failed attempts as zero. It is the predeclared selection metric; three repetitions show variability but do not establish statistical significance.",
            "- An accepted artifact may still need source review. Ambiguities, unresolved mappings and repair exhaustion are reported separately; they are not automatically execution failures.",
            "- Value accuracy is conditional on located references; it is not overall numeric coverage. Classification among value matches can also have a small denominator. Inspect per-attempt raw metrics rather than interpreting a high conditional rate as complete extraction.",
            "- Totals use the agent's explicit source-supported inclusion flags plus fixed GPC exclusions. All numeric rows, including excluded/removal and unmapped rows, remain available to row precision/classification scoring. Unclear inclusion prevents a strict total pass.",
            "- Notation recovery and distractor candidates are in each score. Distractor matching follows the upstream free-text numeric parser; matches are diagnostic and may include unrelated equal numbers, not proven source mistakes or extra precision penalties.",
            "- Original baseline outputs are historical: no fresh run of the old deployed pipeline was performed. Different extraction models/prompts mean the old-vs-new comparison measures complete pipelines, not the isolated effect of agent loops.",
            "- Held-out C-028 and C-031 were previously marked not fully held out. The final stage does not tune against any held-out answer; it is not a claim that the legacy set is wholly unseen.",
            "- Usage is best-effort provider accounting, not a final bill. Cached tokens are a subset of input; reasoning tokens a subset of output. Session totals are not added again to turn totals. Missing usage is unknown, not zero.",
            f"- Selection rule fixed before evaluation: {plan['selection_rule']}",
        ]
    )
    if plan.get("selected_condition"):
        lines.extend(
            ["", f"**Selected using Round 2 only: OCR {plan['selected_condition']}.**"]
        )
    if plan.get("harness_amendments"):
        lines.extend(
            ["", "Client harness amendments (extraction inputs unchanged):", ""]
            + ["- " + amendment["reason"] for amendment in plan["harness_amendments"]]
        )
    lines.extend(["", "## Per-attempt repair and execution details", ""])
    for item in comparisons:
        repair = item.get("repair", {})
        lines.extend(
            [
                f"### {item['experimentJob']}",
                "",
                f"Pipeline accepted: {item.get('pipelineAccepted')}; repairs: {repair.get('repairs', 0)}/3; remaining issues: {repair.get('remaining_issue_count', len(repair.get('issues', [])))}; outcome: {repair.get('repair_outcome')}; elapsed: {item.get('execution', {}).get('elapsed_seconds', 'unknown')} seconds.",
                f"Unresolved mappings: {item.get('unresolvedMappings')}; ambiguous field outcomes: {item['ambiguousFields']}; final usage: `{json.dumps(item.get('usage'))}`.",
                "",
            ]
        )
        lines.append(
            "Mistral preprocessing summary: `"
            + json.dumps(item.get("preprocessing", {}), ensure_ascii=False)
            + "`."
        )
        for turn in repair.get("rounds", []):
            lines.append(
                f"- Round {turn['round']} ({'initial' if turn['round'] == 0 else 'repair'}), turn `{turn['turn_id']}`: {len(turn['issue_details'])} issues; {len(turn['resolved_issue_keys'])} issue groups resolved; {len(turn['new_issue_keys'])} new; {len(turn['changed_data_paths'])} data paths changed. Usage: `{json.dumps(turn.get('usage'))}`."
            )
            lines.extend(
                "  - " + issue["message"].replace("\n", " ")
                for issue in turn["issue_details"]
            )
        raw = item.get("score") or {}
        lines.append(
            f"Notation recovery: {raw.get('notationRecovered', 'N/A')}/{raw.get('notationScored', 'N/A')}; distractor diagnostic matches: {len(raw.get('distractorsStored', []))}; missing rows: {len(raw.get('missingRows', []))}; unexpected stored groups: {len(raw.get('unexpectedStored', []))}."
        )
        if item.get("execution", {}).get("error"):
            lines.append("Execution error: " + item["execution"]["error"])
        lines.append("")
    text = "\n".join(lines) + "\n"
    (output / "comparison.md").write_text(text, encoding="utf-8")
    # A standalone readable HTML artifact, no network requests or external assets.
    body = report_html(text)
    (output / "comparison.html").write_text(
        "<!doctype html><meta charset=utf-8><title>Original-PDF benchmark comparison</title><style>body{font:16px/1.5 system-ui;max-width:1400px;margin:40px auto;padding:0 24px;color:#17232b}table{border-collapse:collapse;width:100%;margin:24px 0}th,td{border:1px solid #ccd6db;padding:9px;text-align:left}th{background:#edf3f4}h2{margin-top:44px}code{overflow-wrap:anywhere}li{margin:8px 0}</style>"
        + body,
        encoding="utf-8",
    )


def report_html(text: str) -> str:
    """Render our small fixed report format using only escaped local content."""
    parts, in_table = [], False
    for line in text.splitlines():
        if line.startswith("|"):
            cells = [value.strip() for value in line.strip("|").split("|")]
            if all(value and set(value) <= {"-", ":", " "} for value in cells):
                continue
            tag = "td" if in_table else "th"
            if not in_table:
                parts.append("<table>")
                in_table = True
            parts.append(
                "<tr>"
                + "".join(f"<{tag}>{html.escape(value)}</{tag}>" for value in cells)
                + "</tr>"
            )
        else:
            if in_table:
                parts.append("</table>")
                in_table = False
            if line.startswith("#"):
                level = min(len(line) - len(line.lstrip("#")), 6)
                parts.append(
                    f"<h{level}>" + html.escape(line.lstrip("# ")) + f"</h{level}>"
                )
            elif line.strip():
                parts.append("<p>" + html.escape(line) + "</p>")
    if in_table:
        parts.append("</table>")
    return "\n".join(parts)


def run_stage(plan: dict, output: Path, stage: str, workers: int) -> None:
    """Run a bounded queue, checkpoint each result, stop new sends on uncertainty."""
    check_frozen(plan)
    queue = iter(
        job
        for job in plan["jobs"]
        if job["stage"] == stage and job["id"] not in plan["results"]
    )
    stop = False
    with ThreadPoolExecutor(max_workers=workers) as pool:
        active = {}

        def launch():
            """Submit the next independent job only after checking frozen inputs."""
            job = next(queue, None)
            if job is not None:
                check_frozen(plan)
                active[pool.submit(run_one, job, output, plan)] = job

        for _ in range(workers):
            launch()
        while active:
            finished, _ = wait(active, timeout=30, return_when=FIRST_COMPLETED)
            for future in finished:
                job = active.pop(future)
                try:
                    result = future.result()
                except Exception as error:
                    result = {
                        "status": "blocked",
                        "error": str(error),
                        "finished_at": now(),
                    }
                plan["results"][job["id"]] = result
                stop |= result["status"] in {"submission_uncertain", "blocked"}
                write_json(output / "plan.json", plan)
                LOGGER.info(
                    "Finished %s: %s (%s saved results)",
                    job["id"],
                    result["status"],
                    len(plan["results"]),
                )
                if not stop:
                    launch()
            if not finished:
                LOGGER.info(
                    "Waiting: %s running, %s saved results",
                    len(active),
                    len(plan["results"]),
                )
    scores = score_saved(output, plan)
    render(output, plan, scores)
    if stop:
        raise ValueError(
            "Experiment stopped new submissions after an uncertain/blocked job. Inspect plan.json and reconcile existing jobs before resuming."
        )


def main() -> None:
    """Prepare or continue one frozen experiment, then refresh its comparison."""
    args = parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    output = args.output.resolve()
    try:
        if args.stage == "prepare":
            plan = freeze(output, args.base_url)
            LOGGER.info("Frozen %s Round 2 jobs at %s", len(plan["jobs"]), output)
            return
        plan = read_json(output / "plan.json")
        if args.stage == "held-out" and not plan.get("selected_condition"):
            round2_jobs = [job for job in plan["jobs"] if job["stage"] == "round2"]
            if any(
                plan["results"].get(job["id"], {}).get("status")
                not in {"completed", "failed"}
                for job in round2_jobs
            ):
                raise ValueError(
                    "Finish and reconcile every Round 2 job before selecting or running held-out settings."
                )
            scores = score_saved(output, plan)
            plan["selected_condition"] = choose_condition(scores["comparisons"])
            plan["selected_at"] = now()
            plan["jobs"].extend(workload("held-out", plan["selected_condition"]))
            write_json(output / "plan.json", plan)
        if args.stage in {"round2", "held-out"}:
            check_frozen(plan)
            if not args.execute:
                LOGGER.info(
                    "Frozen inputs match. Add --execute to run the selected paid stage."
                )
                return
            with experiment_lock(output):
                # Reload after locking so a second process cannot use a stale queue.
                plan = read_json(output / "plan.json")
                run_stage(plan, output, args.stage, args.workers)
        else:
            scores = score_saved(output, plan)
            render(output, plan, scores)
        LOGGER.info("Comparison: %s", output / "comparison.html")
    except (ValueError, OSError, KeyError, httpx.HTTPError) as error:
        LOGGER.error("%s", error)
        raise SystemExit(2) from error


if __name__ == "__main__":
    main()
