"""Brief: Submit a report and data definition, wait, and save candidate JSON.

Inputs:
- --city: requested city name.
- --city-pdf: local unencrypted report PDF path.
- --taxonomy-pdf: local taxonomy PDF; mutually exclusive with --schema.
- --schema: local JSON Schema file; mutually exclusive with --taxonomy-pdf.
- --system-prompt-file: optional UTF-8 file replacing the default agent guidance.
- --user-prompt-file: optional UTF-8 file with instructions for this extraction.
- --mistral-ocr: run optional OCR on uploaded PDFs before starting the agent.
- --auto-repair: enable server-side validation/repair turns.
- --max-repairs: maximum repair turns, 1-5, default 2.
- --base-url: extraction server URL, default http://localhost:8080.
- --output: JSON destination, default result.json.
- --timeout: maximum polling time in seconds, default 1800.
- --poll-interval: seconds between polls, default 10.
- Environment: optional EXTRACTION_API_KEY for a token-protected server.
Outputs:
- Progress and job ID on stderr; result JSON at --output.
- Requests remote cancellation if the polling deadline expires or Ctrl+C is used.
Usage (from repository root):
- cd pdf-extraction
- python -m examples.extract --city "Example City" --city-pdf city.pdf
  --taxonomy-pdf taxonomy.pdf
"""

import argparse
import json
import logging
import math
import os
import time
from datetime import datetime, timezone
from typing import Callable
from contextlib import ExitStack
from pathlib import Path

import httpx

LOGGER = logging.getLogger(__name__)


def positive_seconds(value: str) -> float:
    """Reject intervals that would cause an endless wait or busy polling."""
    number = float(value)
    if not math.isfinite(number) or number <= 0:
        raise argparse.ArgumentTypeError("must be greater than zero")
    return number


def parse_args() -> argparse.Namespace:
    """Parse file paths, city label, output destination, and polling limits."""
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--city", required=True, help="City label for the extraction")
    parser.add_argument("--city-pdf", required=True, type=Path, help="City report PDF")
    definition = parser.add_mutually_exclusive_group(required=True)
    definition.add_argument("--taxonomy-pdf", type=Path, help="Taxonomy PDF")
    definition.add_argument("--schema", type=Path, help="JSON Schema file")
    parser.add_argument(
        "--mistral-ocr",
        action="store_true",
        help="Enable server-side Mistral OCR preprocessing",
    )
    parser.add_argument(
        "--auto-repair",
        action="store_true",
        help="Repair validation issues in the same agent session",
    )
    parser.add_argument(
        "--max-repairs",
        type=int,
        choices=range(1, 6),
        default=3,
        help="Maximum repair turns (1-5)",
    )
    parser.add_argument(
        "--system-prompt-file", type=Path, help="UTF-8 system prompt file"
    )
    parser.add_argument(
        "--user-prompt-file", type=Path, help="UTF-8 per-report user prompt file"
    )
    parser.add_argument(
        "--base-url", default="http://localhost:8080", help="Extraction service URL"
    )
    parser.add_argument(
        "--output", type=Path, default=Path("result.json"), help="Output JSON path"
    )
    parser.add_argument(
        "--timeout",
        type=positive_seconds,
        default=1800,
        help="Polling deadline in seconds",
    )
    parser.add_argument(
        "--poll-interval",
        type=positive_seconds,
        default=10,
        help="Seconds between polls",
    )
    return parser.parse_args()


def extract(
    client: httpx.Client, args: argparse.Namespace, on_submitted: Callable | None = None
) -> dict:
    """Submit once, poll the durable job, and request cancellation on timeout."""
    with ExitStack() as stack:
        city_pdf = stack.enter_context(args.city_pdf.open("rb"))
        files = {"city_pdf": ("city.pdf", city_pdf, "application/pdf")}
        data = {"city": args.city}
        data["use_mistral_ocr"] = str(args.mistral_ocr).lower()
        data["auto_repair"] = str(args.auto_repair).lower()
        data["max_repairs"] = str(args.max_repairs)
        if getattr(args, "benchmark_case", None):
            data["benchmark_case"] = args.benchmark_case
        for field, path in (
            ("system_prompt", args.system_prompt_file),
            ("user_prompt", args.user_prompt_file),
        ):
            if path is not None:
                data[field] = path.read_text(encoding="utf-8")
        if args.taxonomy_pdf is not None:
            taxonomy_pdf = stack.enter_context(args.taxonomy_pdf.open("rb"))
            files["taxonomy_pdf"] = ("taxonomy.pdf", taxonomy_pdf, "application/pdf")
        else:
            data["data_schema"] = args.schema.read_text(encoding="utf-8")
        response = client.post(
            "/v1/extractions",
            data=data,
            files=files,
            timeout=600,
        )
    response.raise_for_status()
    job_id = response.json()["job_id"]
    if on_submitted:
        on_submitted(job_id)
    LOGGER.info(
        "Accepted job %s; save this ID to resume polling after a disconnect.", job_id
    )
    return wait_result(
        client,
        job_id,
        args.timeout,
        args.poll_interval,
        getattr(args, "on_poll_retry", None),
    )


def get_job(
    client: httpx.Client, path: str, deadline: float, on_retry: Callable | None = None
) -> httpx.Response:
    """Retry only read-only GETs after disconnects/transient server responses."""
    retries = 0
    while time.monotonic() < deadline:
        try:
            response = client.get(path)
            response.raise_for_status()
            return response
        except httpx.HTTPStatusError as error:
            if error.response.status_code not in {408, 429, 500, 502, 503, 504}:
                raise
            message = f"HTTP {error.response.status_code}"
        except httpx.RequestError as error:
            message = str(error)
        retries += 1
        event = {
            "time": datetime.now(timezone.utc).isoformat(),
            "path": path,
            "retry": retries,
            "error": message,
        }
        if on_retry:
            on_retry(event)
        LOGGER.warning(
            "Read-only polling interrupted; retrying existing job, no new submission: %s",
            message,
        )
        time.sleep(min(2 ** min(retries, 4), 30, max(0, deadline - time.monotonic())))
    raise TimeoutError("Polling recovery deadline reached for the existing job.")


def wait_result(
    client: httpx.Client,
    job_id: str,
    timeout: float,
    poll_interval: float,
    on_retry: Callable | None = None,
) -> dict:
    """Poll an existing job without resubmitting its input; cancel on deadline/Ctrl+C."""
    deadline = time.monotonic() + timeout
    last_progress = None
    try:
        while time.monotonic() < deadline:
            response = get_job(client, f"/v1/extractions/{job_id}", deadline, on_retry)
            progress = response.json()
            state = progress["status"]
            current = (
                state,
                progress.get("repairs", 0),
                len(progress.get("issues", [])),
            )
            if current != last_progress:
                LOGGER.info(
                    "Job %s: %s; repairs %s/%s; issues %s",
                    job_id,
                    state,
                    current[1],
                    progress.get("max_repairs", 0),
                    current[2],
                )
                last_progress = current
            if state in {"completed", "repair_error"}:
                response = get_job(
                    client, f"/v1/extractions/{job_id}/result", deadline, on_retry
                )
                return response.json()
            if state in {"failed", "cancelled", "needs_input"}:
                raise RuntimeError(
                    f"Job {job_id} is {state}; inspect its OpenAI session logs."
                )
            time.sleep(min(poll_interval, max(0, deadline - time.monotonic())))
        raise TimeoutError(f"Polling deadline reached for {job_id}.")
    except (TimeoutError, KeyboardInterrupt):
        response = client.post(f"/v1/extractions/{job_id}/cancel")
        response.raise_for_status()
        LOGGER.warning(
            "Cancellation requested for %s; poll to confirm it has stopped.", job_id
        )
        raise


def main() -> None:
    """Run the client without importing secrets or starting work at import time."""
    args = parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    token = os.environ.get("EXTRACTION_API_KEY", "")
    with httpx.Client(
        base_url=args.base_url.rstrip("/"),
        headers={"Authorization": f"Bearer {token}"} if token else {},
        timeout=180,
    ) as client:
        result = extract(client, args)
    args.output.write_text(
        json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    LOGGER.info(
        "Saved candidate data to %s. Review its evidence and warnings.", args.output
    )


if __name__ == "__main__":
    main()
