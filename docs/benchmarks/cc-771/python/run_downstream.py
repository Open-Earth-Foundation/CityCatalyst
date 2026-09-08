#!/usr/bin/env python3
"""Downstream usefulness comparison for CC-771 representations.

Uses the same OpenAI-compatible chat endpoint already configured for CityCatalyst
(LLM_BASE_URL / OPENAI_API_KEY / LLM_MODEL) for all three representations.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.request
from pathlib import Path


QUESTIONS = [
    {
        "id": "q1",
        "text": "Which sector had the highest emissions in 2020, and what was the value with unit?",
    },
    {
        "id": "q2",
        "text": "In which year did transport first fall below 35 ktCO2e?",
    },
    {
        "id": "q3",
        "text": "What is the dashed-line target value?",
    },
    {
        "id": "q4",
        "text": "What is the combined 2025 emissions value across Transport, Buildings, and Waste?",
    },
    {
        "id": "q5",
        "text": "Which sector had the smallest absolute reduction from 2020 to 2025, and by how much?",
    },
    {
        "id": "q6",
        "text": "On which page is the emissions chart located? Reply with a page number only if present.",
    },
    {
        "id": "q7",
        "text": "What caption text is associated with the emissions chart, if any?",
    },
    {
        "id": "q8",
        "text": "Quote any repeated header or footer text that appears in the provided context.",
    },
]


SYSTEM_PROMPT = (
    "You answer factual questions using only the provided document excerpt. "
    "If the answer is not present, say NOT_FOUND. "
    "Do not invent numbers. Distinguish approximate visual readings when labeled. "
    "When asked for a page, use page markers or structured page_index fields."
)


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def chat_complete(prompt: str, context: str, model: str, base_url: str, api_key: str) -> dict:
    url = base_url.rstrip("/") + "/chat/completions"
    payload = {
        "model": model,
        "temperature": 0,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Document representation:\n{context}\n\nQuestion:\n{prompt}\n"
                ),
            },
        ],
    }
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    started = time.perf_counter()
    with urllib.request.urlopen(request, timeout=180) as response:
        body = json.loads(response.read().decode("utf-8"))
    elapsed = time.perf_counter() - started
    content = body["choices"][0]["message"]["content"]
    usage = body.get("usage") or {}
    return {
        "answer": content,
        "elapsed_s": round(elapsed, 3),
        "usage": usage,
        "model": body.get("model") or model,
    }


def truncate(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 20] + "\n\n/* truncated */\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-dir", type=Path, required=True)
    parser.add_argument("--max-chars", type=int, default=120_000)
    parser.add_argument(
        "--env-file",
        type=Path,
        default=Path("/home/david/work/projects/open-earth/CityCatalyst/app/.env"),
    )
    args = parser.parse_args()

    load_env_file(args.env_file)
    api_key = os.environ.get("OPENAI_API_KEY")
    base_url = os.environ.get("LLM_BASE_URL") or "https://api.openai.com/v1"
    model = os.environ.get("LLM_MODEL") or os.environ.get("OPEN_AI_MODEL")
    if not api_key or not model:
        print("BLOCKED: OPENAI_API_KEY / LLM_MODEL not configured", file=sys.stderr)
        return 2

    representations = {
        "output.md": (args.run_dir / "output.md").read_text(encoding="utf-8"),
        "output.enriched.md": (args.run_dir / "output.enriched.md").read_text(
            encoding="utf-8"
        ),
        "document.structured.json": (args.run_dir / "document.structured.json").read_text(
            encoding="utf-8"
        ),
    }

    results = {
        "run_dir": str(args.run_dir),
        "downstream_model": model,
        "downstream_base_url": base_url,
        "temperature": 0,
        "max_chars": args.max_chars,
        "questions": QUESTIONS,
        "representations": {},
    }

    for name, text in representations.items():
        context = truncate(text, args.max_chars)
        rep_results = {
            "context_chars": len(context),
            "source_chars": len(text),
            "answers": [],
        }
        for question in QUESTIONS:
            try:
                answer = chat_complete(
                    question["text"], context, model, base_url, api_key
                )
                rep_results["answers"].append(
                    {
                        "id": question["id"],
                        "question": question["text"],
                        "answer": answer["answer"],
                        "elapsed_s": answer["elapsed_s"],
                        "usage": answer["usage"],
                        "model_returned": answer["model"],
                    }
                )
            except Exception as exc:  # noqa: BLE001
                rep_results["answers"].append(
                    {
                        "id": question["id"],
                        "question": question["text"],
                        "error": str(exc),
                    }
                )
        results["representations"][name] = rep_results

    out = args.run_dir / "downstream-comparison.json"
    out.write_text(json.dumps(results, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    md_lines = [
        "# Downstream comparison",
        "",
        f"- Model: `{model}`",
        f"- Temperature: 0",
        f"- Max chars: {args.max_chars}",
        "",
    ]
    for name, rep in results["representations"].items():
        md_lines.append(f"## {name}")
        md_lines.append("")
        md_lines.append(
            f"- context_chars: {rep['context_chars']} (source {rep['source_chars']})"
        )
        md_lines.append("")
        for answer in rep["answers"]:
            md_lines.append(f"### {answer['id']}")
            md_lines.append(answer["question"])
            md_lines.append("")
            if "error" in answer:
                md_lines.append(f"ERROR: {answer['error']}")
            else:
                md_lines.append(answer["answer"])
            md_lines.append("")
    (args.run_dir / "downstream-comparison.md").write_text(
        "\n".join(md_lines), encoding="utf-8"
    )
    print(json.dumps({"wrote": str(out), "model": model}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
