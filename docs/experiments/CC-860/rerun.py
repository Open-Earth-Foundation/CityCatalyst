"""Replay archived CC-860 UI-context experiments with real model calls.

Requires httpx and an existing OPENROUTER_API_KEY environment variable. Reads
only archived prompts/inputs; writes answers and usage to --output. No product
or browser mutations. API calls incur provider charges.
Example: python rerun.py --approach selected --output replay.json
"""

import argparse
import asyncio
import base64
import json
import os
from pathlib import Path

import httpx

HERE = Path(__file__).resolve().parent


async def replay(approach: str, output: Path) -> None:
    """Run five isolated questions against the archived model/prompt contract."""
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise SystemExit(
            "Set OPENROUTER_API_KEY in your environment; do not paste it into artifacts."
        )
    comparison = json.loads((HERE / "results.json").read_text(encoding="utf-8"))
    questions = sorted(
        (row for row in comparison["results"] if row["representation"] == "tree"),
        key=lambda row: row["question"],
    )
    system = (HERE / "experiment-system-prompt.txt").read_text(encoding="utf-8")
    if approach == "runtime":
        recorded = json.loads(
            (HERE / "runtime-results.json").read_text(encoding="utf-8")
        )
        system = recorded["system_prompt"]
        context = "CONCEPT_NOTE_CONTEXT_BUNDLE_JSON\n" + json.dumps(recorded["context"])
    elif approach == "screenshot":
        image = base64.b64encode((HERE / "screenshot.png").read_bytes()).decode()
        context = [
            {"type": "text", "text": "UI_CONTEXT"},
            {
                "type": "image_url",
                "image_url": {
                    "url": "data:image/png;base64," + image,
                    "detail": "high",
                },
            },
        ]
    else:
        name = "selected-context.txt" if approach == "selected" else approach + ".txt"
        context = "UI_CONTEXT\n" + (HERE / name).read_text(encoding="utf-8")
    results = {"approach": approach, "model": comparison["model"], "results": []}
    async with httpx.AsyncClient(timeout=150) as client:
        for question in questions:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": "Bearer " + key},
                json={
                    "model": comparison["model"],
                    "reasoning": {"effort": "high"},
                    "max_tokens": 2400,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": context},
                        {"role": "user", "content": question["prompt"]},
                    ],
                },
            )
            response.raise_for_status()
            data = response.json()
            results["results"].append(
                {
                    "question": question["question"],
                    "prompt": question["prompt"],
                    "answer": data["choices"][0]["message"]["content"],
                    "usage": data["usage"],
                }
            )
            output.write_text(
                json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            print(f"Completed question {question['question']}")


def main() -> None:
    """Parse replay scope and output path without reading credentials into logs."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--approach",
        choices=[
            "screenshot",
            "html",
            "mermaid",
            "tree",
            "action_map",
            "selected",
            "runtime",
        ],
        required=True,
    )
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        parser.error(
            "Output already exists; choose a new file to preserve earlier evidence."
        )
    asyncio.run(replay(args.approach, args.output))


if __name__ == "__main__":
    main()
