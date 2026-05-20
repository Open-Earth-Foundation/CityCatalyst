from __future__ import annotations

import argparse
import hashlib
import json
import statistics
import sys
from pathlib import Path
from typing import Any, Dict, List

import tiktoken


PROJECT_ROOT = Path(__file__).resolve().parents[2]
for extra_path in (PROJECT_ROOT, PROJECT_ROOT / "service"):
    path_str = str(extra_path)
    if path_str not in sys.path:
        sys.path.insert(0, path_str)

from vector_db.config_loader import get_embedding_config  # noqa: E402
from vector_db.utils.text_processing import TextSplitter  # noqa: E402


EMBEDDING_MODEL = "text-embedding-3-large"
FALLBACK_ENCODING = "cl100k_base"


def _percentile(values: List[int], percentile: int) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return float(ordered[0])
    index = (len(ordered) - 1) * (percentile / 100.0)
    lower = int(index)
    upper = min(lower + 1, len(ordered) - 1)
    weight = index - lower
    return float(ordered[lower] * (1.0 - weight) + ordered[upper] * weight)


def _mean(values: List[int]) -> float:
    return float(statistics.fmean(values)) if values else 0.0


def _load_tokenizer(model: str):
    try:
        return tiktoken.encoding_for_model(model)
    except KeyError:
        return tiktoken.get_encoding(FALLBACK_ENCODING)


def _longest_shared_suffix_prefix(left: str, right: str) -> int:
    max_len = min(len(left), len(right))
    for size in range(max_len, 0, -1):
        if left[-size:] == right[:size]:
            return size
    return 0


def _sequential_positions(chunks: List[str], cleaned_text: str) -> List[int]:
    positions: List[int] = []
    search_start = 0
    for chunk in chunks:
        position = cleaned_text.find(chunk, search_start)
        if position == -1 and positions:
            position = cleaned_text.find(chunk, positions[-1] + 1)
        if position == -1:
            position = cleaned_text.find(chunk)
        positions.append(position)
        search_start = max(position + 1, search_start)
    return positions


def _classify_chunk_start(cleaned_text: str, start_index: int) -> Dict[str, bool]:
    if start_index <= 0:
        return {
            "starts_at_paragraph_boundary": True,
            "starts_at_line_boundary": True,
            "starts_mid_sentence": False,
            "starts_mid_word": False,
        }

    current = cleaned_text[start_index]
    previous = cleaned_text[start_index - 1]
    previous_two = cleaned_text[max(0, start_index - 2):start_index]

    starts_at_paragraph_boundary = previous_two == "\n\n"
    starts_at_line_boundary = previous == "\n" or starts_at_paragraph_boundary
    starts_mid_word = previous.isalnum() and current.isalnum()
    starts_mid_sentence = (
        not starts_at_paragraph_boundary
        and not starts_at_line_boundary
        and current.isalpha()
        and previous not in ".!?"
        and not starts_mid_word
    )

    return {
        "starts_at_paragraph_boundary": starts_at_paragraph_boundary,
        "starts_at_line_boundary": starts_at_line_boundary,
        "starts_mid_sentence": starts_mid_sentence,
        "starts_mid_word": starts_mid_word,
    }


def build_baseline(text_path: Path) -> Dict[str, Any]:
    raw_text = text_path.read_text(encoding="utf-8")
    config = get_embedding_config()
    splitter = TextSplitter()
    tokenizer = _load_tokenizer(EMBEDDING_MODEL)

    cleaned_text = splitter._clean_text(raw_text)
    raw_chunks = splitter._split_cleaned_text(cleaned_text)
    chunks = [chunk for chunk in raw_chunks if len(chunk.strip()) >= splitter.MIN_CHUNK_CHARS]

    positions = _sequential_positions(chunks, cleaned_text)
    token_counts = [len(tokenizer.encode(chunk)) for chunk in chunks]
    char_counts = [len(chunk) for chunk in chunks]
    overlap_counts = [
        _longest_shared_suffix_prefix(chunks[index], chunks[index + 1])
        for index in range(len(chunks) - 1)
    ]

    chunk_entries: List[Dict[str, Any]] = []
    paragraph_boundary_start_count = 0
    line_boundary_start_count = 0
    mid_sentence_start_count = 0
    mid_word_start_count = 0

    for index, (chunk, start_index, token_count) in enumerate(zip(chunks, positions, token_counts)):
        flags = _classify_chunk_start(cleaned_text, start_index)
        paragraph_boundary_start_count += int(flags["starts_at_paragraph_boundary"])
        line_boundary_start_count += int(flags["starts_at_line_boundary"])
        mid_sentence_start_count += int(flags["starts_mid_sentence"])
        mid_word_start_count += int(flags["starts_mid_word"])

        chunk_entries.append(
            {
                "index": index,
                "start_index": start_index,
                "char_count": len(chunk),
                "token_count": token_count,
                "sha256": hashlib.sha256(chunk.encode("utf-8")).hexdigest(),
                "starts_at_paragraph_boundary": flags["starts_at_paragraph_boundary"],
                "starts_at_line_boundary": flags["starts_at_line_boundary"],
                "starts_mid_sentence": flags["starts_mid_sentence"],
                "starts_mid_word": flags["starts_mid_word"],
                "preview": chunk[:160],
            }
        )

    return {
        "fixture_name": text_path.stem,
        "chunk_size": splitter.chunk_size,
        "chunk_overlap": splitter.chunk_overlap,
        "min_chunk_chars": splitter.MIN_CHUNK_CHARS,
        "tokenizer": {
            "model": EMBEDDING_MODEL,
            "fallback_encoding": FALLBACK_ENCODING,
        },
        "input_metrics": {
            "char_count": len(raw_text),
            "cleaned_char_count": len(cleaned_text),
            "paragraph_count": len([block for block in raw_text.split("\n\n") if block.strip()]),
            "line_count": len(raw_text.splitlines()),
        },
        "output_metrics": {
            "chunk_count": len(chunks),
            "char_min": min(char_counts) if char_counts else 0,
            "char_max": max(char_counts) if char_counts else 0,
            "char_mean": _mean(char_counts),
            "char_p50": _percentile(char_counts, 50),
            "char_p95": _percentile(char_counts, 95),
            "token_min": min(token_counts) if token_counts else 0,
            "token_max": max(token_counts) if token_counts else 0,
            "token_mean": _mean(token_counts),
            "token_p50": _percentile(token_counts, 50),
            "token_p95": _percentile(token_counts, 95),
            "over_limit_chunk_count": sum(1 for count in token_counts if count > config.max_token_limit),
            "filtered_short_chunk_count": len(raw_chunks) - len(chunks),
            "mid_word_start_count": mid_word_start_count,
            "mid_sentence_start_count": mid_sentence_start_count,
            "paragraph_boundary_start_count": paragraph_boundary_start_count,
            "line_boundary_start_count": line_boundary_start_count,
        },
        "overlap_metrics": {
            "pair_count": len(overlap_counts),
            "shared_prefix_suffix_char_min": min(overlap_counts) if overlap_counts else 0,
            "shared_prefix_suffix_char_max": max(overlap_counts) if overlap_counts else 0,
            "shared_prefix_suffix_char_mean": _mean(overlap_counts),
        },
        "chunks": chunk_entries,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate a splitter baseline artifact for a text fixture.")
    parser.add_argument(
        "--fixture",
        default=str(Path(__file__).parent / "fixtures" / "splitter_baseline" / "gpc_excerpt_multi_paragraph.txt"),
        help="Path to the input text fixture.",
    )
    parser.add_argument(
        "--output",
        default="",
        help="Optional path to write the generated baseline JSON.",
    )
    args = parser.parse_args()

    fixture_path = Path(args.fixture)
    payload = build_baseline(fixture_path)
    encoded = json.dumps(payload, indent=2, ensure_ascii=True)

    if args.output:
        Path(args.output).write_text(encoded, encoding="utf-8")
    else:
        print(encoded)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
