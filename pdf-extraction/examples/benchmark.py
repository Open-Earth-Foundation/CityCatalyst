"""Brief: Exercise the standalone extraction demo against installed benchmark cases.

Inputs:
- --list: show all case IDs, blocks, PDF and key readiness; no paid calls.
- --cases IDs: comma-separated case IDs, in requested order.
- --group fixture|public|real: select a group instead of explicit case IDs.
- --run: execute selected cases against the demo; otherwise validate inputs only.
- --mistral-ocr, --auto-repair, --max-repairs 1-5: extraction options.
- --base-url URL: demo server, default http://127.0.0.1:8080.
- --output PATH: new output directory (default benchmarks/runs/<UTC timestamp>).
- --resume PATH: resume an existing run directory using saved job IDs/options.
- --timeout SECONDS, --poll-interval SECONDS: per-job wait limits (3600 and 3).
- Environment: EXTRACTION_API_KEY, or the standalone .env's service token.
Outputs: ignored per-case result.json/activity.json/job.json and report.md/run.json.
Expected answers remain on the server; they are not included in submissions.
One attempt per case. This runner does not call the CityCatalyst import/database.
Usage (from repository root):
- cd pdf-extraction
- .venv\\Scripts\\python.exe -m examples.benchmark --cases small-ghgi --run
"""

import argparse
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import httpx

from examples.extract import extract, positive_seconds, wait_result
from extractor.benchmarks import BenchmarkCatalog, ROOT, read_json
from extractor.config import Settings

LOGGER = logging.getLogger(__name__)


def parse_args() -> argparse.Namespace:
    """Parse selection, explicit execution, and repeatable experiment settings."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    selection = parser.add_mutually_exclusive_group()
    selection.add_argument("--cases", help="Comma-separated case IDs")
    selection.add_argument(
        "--group",
        choices=["fixture", "public", "real"],
        help="Select every case in a group",
    )
    selection.add_argument(
        "--resume", type=Path, help="Resume saved run.json in this directory"
    )
    parser.add_argument(
        "--list", action="store_true", help="List readiness without execution"
    )
    parser.add_argument(
        "--run", action="store_true", help="Execute selected cases; uses API billing"
    )
    parser.add_argument(
        "--mistral-ocr", action="store_true", help="Enable optional OCR"
    )
    parser.add_argument(
        "--auto-repair", action="store_true", help="Enable validation/repair turns"
    )
    parser.add_argument("--max-repairs", type=int, choices=range(1, 6), default=3)
    parser.add_argument("--base-url", default="http://127.0.0.1:8080")
    parser.add_argument("--output", type=Path, help="New directory for this run")
    parser.add_argument("--timeout", type=positive_seconds, default=3600)
    parser.add_argument("--poll-interval", type=positive_seconds, default=3)
    args = parser.parse_args()
    if args.run and not (args.cases or args.group or args.resume):
        parser.error("--run requires --cases, --group or --resume")
    if args.resume and args.output:
        parser.error("--resume and --output cannot be combined")
    return args


def write_json(path: Path, value) -> None:
    """Replace a checkpoint atomically to preserve IDs after an interrupted client."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    temporary.replace(path)


def report(output: Path, run: dict) -> None:
    """Write a small self-contained comparison with explicit missing/failed cases."""
    lines = [
        "# Standalone PDF extraction benchmark",
        "",
        f"Started: {run['started_at']}",
        f"Options: `{json.dumps(run['options'])}`",
        "",
        "One attempt per case. Demo checks, not CityCatalyst production benchmark scores.",
        "",
        "| Case | Execution | Expected checks | Job |",
        "| --- | --- | --- | --- |",
    ]
    for case_id in run["cases"]:
        item = run["results"].get(case_id, {})
        score = item.get("benchmark", {})
        check = (
            f"{score.get('passed', 0)}/{score['total']} ({score['status']})"
            if score.get("total")
            else score.get("status", "not scored")
        )
        lines.append(
            f"| {case_id} | {item.get('status', 'not started')} | {check} | {item.get('job_id', '')} |"
        )
        if item.get("error"):
            lines.append(f"\n{case_id}: {item['error']}\n")
    lines += [
        "",
        "Expected answers are checked only after extraction/repair has finished. They never enter the agent context or repair feedback.",
        "Review result.json for values/evidence, activity.json for public tool records, and job.json for the resumable session ID.",
    ]
    (output / "report.md").write_text("\n".join(lines), encoding="utf-8")


def execute(
    args: argparse.Namespace, catalog: BenchmarkCatalog, client: httpx.Client
) -> int:
    """Run selected cases sequentially, checkpoint IDs, and never resubmit unknown sends."""
    if args.resume:
        output = args.resume.resolve()
        run = read_json(output / "run.json")
        options = run["options"]
        for key in ("mistral_ocr", "auto_repair", "max_repairs", "base_url"):
            setattr(args, key, options[key])
        if str(client.base_url).rstrip("/") != args.base_url.rstrip("/"):
            raise ValueError(
                "Resume requires --base-url matching the saved server URL."
            )
    else:
        selected = (
            list(dict.fromkeys(args.cases.split(",")))
            if args.cases
            else [c["id"] for c in catalog.listing() if c["group"] == args.group]
        )
        for case_id in selected:
            case = catalog.get(case_id.strip())
            if not catalog.path(case["pdf"]).is_file():
                raise ValueError(
                    f"PDF missing for {case_id}; import it with examples.prepare_benchmarks. No jobs submitted."
                )
        output = (
            args.output
            or ROOT / "runs" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        ).resolve()
        output.mkdir(parents=True, exist_ok=False)
        run = {
            "started_at": datetime.now(timezone.utc).isoformat(),
            "cases": [id.strip() for id in selected],
            "options": {
                key: getattr(args, key)
                for key in ("mistral_ocr", "auto_repair", "max_repairs", "base_url")
            },
            "results": {},
        }
        write_json(output / "run.json", run)
    LOGGER.info("Run directory: %s", output)
    for case_id in run["cases"]:
        case = catalog.get(case_id)
        directory = output / case_id
        directory.mkdir(parents=True, exist_ok=True)
        prior = run["results"].get(case_id, {})
        if prior.get("status") == "completed":
            prior.pop("error", None)
            continue
        if prior.get("status") == "submission_uncertain":
            raise ValueError(
                f"{case_id}: previous submission outcome is unknown. Reconcile OpenAI logs before starting another job."
            )
        job = dict(prior)

        def poll_retry(event):
            """Persist transport interruptions without changing the paid attempt."""
            with (directory / "poll-retries.jsonl").open(
                "a", encoding="utf-8"
            ) as stream:
                stream.write(json.dumps(event) + "\n")

        args.on_poll_retry = poll_retry

        def checkpoint(job_id):
            """Persist acceptance before polling so a disconnected run can resume."""
            job.update(job_id=job_id, status="running")
            run["results"][case_id] = job
            write_json(directory / "job.json", job)
            write_json(output / "run.json", run)

        try:
            if job.get("job_id"):
                envelope = wait_result(
                    client, job["job_id"], args.timeout, args.poll_interval, poll_retry
                )
            else:
                definition = catalog.load(case_id)
                prompt_path = directory / "user-prompt.md"
                prompt_path.write_text(definition["user_prompt"], encoding="utf-8")
                submission = argparse.Namespace(
                    city=definition["report_label"],
                    city_pdf=catalog.path(case["pdf"]),
                    taxonomy_pdf=None,
                    schema=catalog.path(case["schema"]),
                    system_prompt_file=None,
                    user_prompt_file=prompt_path,
                    mistral_ocr=args.mistral_ocr,
                    auto_repair=args.auto_repair,
                    max_repairs=args.max_repairs,
                    timeout=args.timeout,
                    poll_interval=args.poll_interval,
                    benchmark_case=case_id,
                    on_poll_retry=poll_retry,
                )
                # Persist before sending: a crash here is uncertain, never an excuse
                # to automatically create a second paid extraction on resume.
                job["status"] = "submission_uncertain"
                run["results"][case_id] = job
                write_json(output / "run.json", run)
                envelope = extract(client, submission, on_submitted=checkpoint)
            write_json(directory / "result.json", envelope)
            job.pop("error", None)
            job.update(status="completed", benchmark=envelope.get("benchmark", {}))
            try:
                response = client.get(
                    f"/v1/extractions/{job['job_id']}/activity", params={"full": "true"}
                )
                response.raise_for_status()
                write_json(directory / "activity.json", response.json())
            except httpx.HTTPError as exc:
                job["activity_error"] = str(exc)
        except KeyboardInterrupt:
            job["status"] = (
                "interrupted" if job.get("job_id") else "submission_uncertain"
            )
            run["results"][case_id] = job
            write_json(output / "run.json", run)
            report(output, run)
            raise
        except (httpx.HTTPError, RuntimeError, TimeoutError) as exc:
            definite_rejection = False
            if isinstance(exc, httpx.HTTPStatusError) and not job.get("job_id"):
                try:
                    failure = exc.response.json()
                    definite_rejection = (
                        failure.get("submission_uncertain") is False
                        or 400 <= exc.response.status_code < 500
                    )
                    job["upstream_status"] = failure.get("upstream_status")
                except ValueError:
                    definite_rejection = 400 <= exc.response.status_code < 500
            job.update(
                status=(
                    "failed"
                    if job.get("job_id") or definite_rejection
                    else "submission_uncertain"
                ),
                error=str(exc),
            )
            LOGGER.error("%s: %s", case_id, exc)
        run["results"][case_id] = job
        write_json(output / "run.json", run)
        write_json(directory / "job.json", job)
        report(output, run)
    write_json(output / "run.json", run)
    report(output, run)
    return int(
        any(
            item.get("status") != "completed"
            or item.get("benchmark", {}).get("status") != "passed"
            for item in run["results"].values()
        )
    )


def main() -> None:
    """List/check locally by default, execute only when --run is requested."""
    args = parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    catalog = BenchmarkCatalog()
    if args.list or not args.run:
        for case in catalog.listing():
            if args.cases and case["id"] not in args.cases.split(","):
                continue
            if args.group and case["group"] != args.group:
                continue
            LOGGER.info(
                "%-24s %-8s PDF=%-7s keys=%-7s %s",
                case["id"],
                case["group"],
                "ready" if case["pdf_ready"] else "missing",
                "ready" if case["answers_ready"] else "missing",
                case["label"],
            )
        return
    settings = Settings.from_env()
    if args.resume:
        args.base_url = read_json(args.resume / "run.json")["options"]["base_url"]
    with httpx.Client(
        base_url=args.base_url.rstrip("/"),
        headers=(
            {"Authorization": f"Bearer {settings.service_api_key}"}
            if settings.service_api_key
            else {}
        ),
        timeout=180,
    ) as client:
        try:
            code = execute(args, catalog, client)
        except (ValueError, OSError) as exc:
            LOGGER.error("%s", exc)
            code = 2
    raise SystemExit(code)


if __name__ == "__main__":
    main()
