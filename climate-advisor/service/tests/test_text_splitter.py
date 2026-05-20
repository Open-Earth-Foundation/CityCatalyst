from __future__ import annotations

import json
import sys
from pathlib import Path
import unittest


TEST_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = Path(__file__).resolve().parents[2]
for extra_path in (TEST_ROOT, PROJECT_ROOT, PROJECT_ROOT / "service"):
    path_str = str(extra_path)
    if path_str not in sys.path:
        sys.path.insert(0, path_str)

from splitter_baseline import build_baseline  # noqa: E402
from vector_db.utils.text_processing import TextSplitter  # noqa: E402


FIXTURE_DIR = TEST_ROOT / "fixtures" / "splitter_baseline"


class TextSplitterTests(unittest.TestCase):
    def test_prefers_paragraph_boundaries_when_paragraphs_fit(self) -> None:
        paragraph_a = "A" * 900
        paragraph_b = "B" * 900
        paragraph_c = "C" * 900
        text = f"{paragraph_a}\n\n{paragraph_b}\n\n{paragraph_c}"

        splitter = TextSplitter(chunk_size=1800, chunk_overlap=0)
        chunks = splitter._split_cleaned_text(splitter._clean_text(text))

        self.assertEqual(chunks, [f"{paragraph_a}\n\n", f"{paragraph_b}\n\n", paragraph_c])

    def test_uses_sentence_fallback_before_word_fallback(self) -> None:
        text = (
            "Sentence one is fairly long indeed. "
            "Sentence two is fairly long indeed. "
            "Sentence three is fairly long indeed."
        )

        splitter = TextSplitter(chunk_size=45, chunk_overlap=0)
        chunks = splitter._split_cleaned_text(splitter._clean_text(text))

        self.assertEqual(
            chunks,
            [
                "Sentence one is fairly long indeed. ",
                "Sentence two is fairly long indeed. ",
                "Sentence three is fairly long indeed.",
            ],
        )

    def test_uses_word_fallback_before_character_fallback(self) -> None:
        text = "alpha beta gamma delta epsilon zeta eta theta iota kappa"

        splitter = TextSplitter(chunk_size=18, chunk_overlap=0)
        chunks = splitter._split_cleaned_text(splitter._clean_text(text))

        self.assertEqual(
            chunks,
            [
                "alpha beta gamma ",
                "delta epsilon ",
                "zeta eta theta ",
                "iota kappa",
            ],
        )

    def test_character_fallback_applies_overlap(self) -> None:
        text = "X" * 23

        splitter = TextSplitter(chunk_size=10, chunk_overlap=3)
        chunks = splitter._split_cleaned_text(splitter._clean_text(text))

        self.assertEqual(chunks, ["X" * 10, "X" * 10, "X" * 9])
        self.assertEqual(chunks[0][-3:], chunks[1][:3])
        self.assertEqual(chunks[1][-3:], chunks[2][:3])

    def test_gpc_fixture_improves_boundary_preservation_without_token_regression(self) -> None:
        fixture_path = FIXTURE_DIR / "gpc_excerpt_multi_paragraph.txt"
        baseline_path = FIXTURE_DIR / "gpc_excerpt_multi_paragraph.baseline.json"

        baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
        current = build_baseline(fixture_path)

        self.assertEqual(current["output_metrics"]["over_limit_chunk_count"], 0)
        self.assertEqual(current["output_metrics"]["filtered_short_chunk_count"], 0)
        self.assertEqual(current["output_metrics"]["mid_word_start_count"], 0)
        self.assertGreater(
            current["output_metrics"]["paragraph_boundary_start_count"],
            baseline["output_metrics"]["paragraph_boundary_start_count"],
        )
        self.assertGreaterEqual(
            current["output_metrics"]["line_boundary_start_count"],
            baseline["output_metrics"]["line_boundary_start_count"],
        )
        self.assertLessEqual(
            current["output_metrics"]["token_max"],
            baseline["output_metrics"]["token_max"] + 64,
        )


if __name__ == "__main__":
    unittest.main()
