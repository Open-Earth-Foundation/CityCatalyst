# CC-771 — OCRBench v2 context

Updated 2026-09-03. This note records the official OCRBench v2 results that are useful as external context for the CC-771 PDF benchmark.

## Scope and comparability

OCRBench v2 is a bilingual benchmark for large multimodal models with 10,000 human-verified question-answer pairs across 31 scenarios. Its tasks cover recognition, referring, spotting, extraction, parsing, calculation, understanding, and reasoning over text-rich images.

The official leaderboard is not directly comparable to CC-771: OCRBench v2 evaluates image-level question answering, while CC-771 evaluates end-to-end PDF-to-Markdown extraction on a controlled chart fixture and two long real-world PDF reports. The scores below are therefore external context, not replacements for the CC-771 runs.

## Models tested in CC-771

Scores below are from the official OCRBench v2 leaderboard. The listed period is included because the leaderboard is updated over time.

| CC-771 model | OCRBench v2 entry | English average | Chinese average | Match quality |
| --- | --- | ---: | ---: | --- |
| Gemini 3.1 Pro Preview | Gemini 3 Pro Preview | 63.4 (2026.06) | 63.8 (2026.06) | Closest published entry; version name is not identical |
| Gemini 2.5 Pro | Gemini-2.5-Pro | 59.3 (2026.06) | 62.2 (2026.06) | Exact model match |
| GPT-5.2 | GPT-5.2 | 50.5 (2026.03) | 52.6 (2026.03) | Exact model match |
| Claude Opus 5 | Claude Opus 4.6 | 48.4 (2026.03) | 59.8 (2026.03) | Closest published entry; version mismatch |
| Claude Sonnet 4.5 | Claude-sonnet-4-20250514 | 42.4 (2026.03) | Not listed | Closest published entry; version mismatch |
| Mistral OCR latest | No exact entry | Not listed | Not listed | Do not substitute Ministral-3-14B; it is a different model |

## External ranking signal

Among the exact or explicitly closest matches to the models tested in CC-771, Gemini 2.5 Pro has the strongest published score for an exact match in the current English leaderboard (59.3), followed by GPT-5.2 (50.5). The closest published entries for Gemini 3 Pro Preview and Claude Opus 4.6 score 63.4 and 48.4 respectively, but neither is the exact model ID used in the CC-771 run.

This external ranking differs from the CC-771 result: GPT-5.2 was the best quality/cost candidate in our PDF battery, while Claude Opus 5 produced the strongest visual extraction. That difference is expected because benchmark task mix, input transport, document length, prompting, and evaluation criteria are different.

## Sources

- [OCRBench v2 official leaderboard](https://99franklin.github.io/ocrbench_v2/) — leaderboard periods, language splits, model scores, and task categories.
- [OCRBench v2 paper](https://arxiv.org/abs/2501.00321) — benchmark scope, dataset size, and methodology.
- [Official OCRBench repository](https://github.com/Yuliang-Liu/MultimodalOCR) — benchmark code and data links.

## Recommendation for CC-771

Keep the official OCRBench v2 results as a reference column, but use the CC-771 real-PDF runs as the decision evidence for this card. Before production selection, rerun the leading candidates against sanitized CC PDFs using the same prompt, input transport, and factual evaluation rubric.
