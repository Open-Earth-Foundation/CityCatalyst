"""
Brief: Run local CNB against either provider and record summary delivery evidence.

Inputs:
- --provider: openrouter or openai (required); existing .env API credentials.
- --output: local JSON evidence file (required).
- --port: loopback HTTP port (default 8081).
- Uses the same configured model roles and prompts; OpenAI model prefixes are
  stripped for direct requests. Provider selection is in-memory only.

Outputs:
- Serves the normal app on loopback and records per-call timings, event counts,
  readable final summaries, and delta text. Never records prompts, documents,
  answers, credentials, or encrypted reasoning. Evidence stays in the chosen file.
- No extra model calls; use fresh seeded conversations for controlled comparisons.

Usage (from climate-advisor/service):
- python -m scripts.serve_cnb_provider_probe --provider openrouter --output ../../artifacts/cc827-krakow/openrouter-probe.json
"""

from __future__ import annotations

import argparse
import json
import logging
from collections import Counter
from collections.abc import AsyncIterator
from pathlib import Path
from time import perf_counter
from typing import Any
from uuid import uuid4

import uvicorn
from openai import AsyncStream

from app.config import get_settings

logger = logging.getLogger(__name__)


def parse_args() -> argparse.Namespace:
    """Parse a provider and a local evidence destination."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--provider", choices=["openrouter", "openai"], required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--port", type=int, default=8081)
    return parser.parse_args()


def main() -> None:
    """Override only this process's routing and observe its streamed summaries."""
    args = parse_args()
    logging.basicConfig(level=logging.INFO)
    settings = get_settings()
    if args.provider == "openai":
        if not settings.openai_api_key:
            raise ValueError("OPENAI_API_KEY is required for direct comparison")
        settings.openrouter_api_key = settings.openai_api_key
        settings.openrouter_base_url = "https://api.openai.com/v1"
        for role in ("cnb_chat", "cnb_source_reader", "cnb_source_synthesizer"):
            model = getattr(settings.llm.models, role)
            model.name = model.name.removeprefix("openai/")
    from app.main import app

    records: list[dict[str, Any]] = []
    original_iter = AsyncStream.__stream__
    args.output.parent.mkdir(parents=True, exist_ok=True)

    def save() -> None:
        """Persist only explicitly selected local comparison evidence."""
        args.output.write_text(
            json.dumps({"provider": args.provider, "calls": records}, indent=2),
            encoding="utf-8",
        )

    async def iterate(stream: Any) -> AsyncIterator[Any]:
        """Observe the live SDK stream without changing or delaying its events."""
        started = perf_counter()
        record = {
            "id": str(uuid4()),
            "model": None,
            "timing_origin": "provider_stream_iteration_start",
            "first_summary_seconds": None,
            "final_summaries": {},
            "delta_text": {},
            "completed": False,
        }
        counts: Counter[str] = Counter()
        records.append(record)
        try:
            async for event in original_iter(stream):
                kind = getattr(event, "type", "")
                if kind == "response.created":
                    record["model"] = getattr(event.response, "model", record["model"])
                counts[kind] += 1
                if kind in {
                    "response.reasoning_summary_text.delta",
                    "response.reasoning_text.delta",
                }:
                    text = getattr(event, "delta", "")
                    if text:
                        if record["first_summary_seconds"] is None:
                            record["first_summary_seconds"] = round(
                                perf_counter() - started, 3
                            )
                        part = f"{getattr(event, 'item_id', '')}:{getattr(event, 'summary_index', 0)}"
                        record["delta_text"][part] = (
                            record["delta_text"].get(part, "") + text
                        )
                if kind in {"response.output_item.done", "response.completed"}:
                    items = (
                        [event.item]
                        if kind == "response.output_item.done"
                        else event.response.output
                    )
                    for item in items:
                        if getattr(item, "type", "") == "reasoning":
                            for index, part in enumerate(item.summary or []):
                                if part.text:
                                    if record["first_summary_seconds"] is None:
                                        record["first_summary_seconds"] = round(
                                            perf_counter() - started, 3
                                        )
                                    record["final_summaries"][f"{item.id}:{index}"] = (
                                        part.text
                                    )
                if kind == "response.completed":
                    record["completed"] = True
                yield event
        finally:
            record["elapsed_seconds"] = round(perf_counter() - started, 3)
            record["event_counts"] = dict(counts)
            save()

    AsyncStream.__stream__ = iterate
    try:
        logger.info("Serving local CNB comparison with provider %s", args.provider)
        uvicorn.run(app, host="127.0.0.1", port=args.port)
    finally:
        AsyncStream.__stream__ = original_iter
        save()


if __name__ == "__main__":
    main()
