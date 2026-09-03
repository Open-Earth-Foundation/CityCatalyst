# CC-771 OCR benchmark research artifact

> **Draft PR — do not merge.**

This directory contains the research artifacts for [CC-771 — Compare OCR tools](https://linear.app/openearth/issue/CC-771/compare-ocr-tools). It does not change the CityCatalyst production pipeline.

## Purpose

The benchmark compares the current direct Mistral OCR flow with multimodal models accessed through OpenRouter. The test uses one controlled PDF fixture containing narrative text, tables, and a chart with five known visual facts. Two real City of San Diego Climate Action Plan reports were also used as representative long-document validation inputs.

## Start here

- [Final comparison table](comparison-table.md)
- [Controlled benchmark PDF](cc-771-benchmark-fixture-en.pdf)
- [Run artifacts bundle](cc-771-ocr-run-artifacts.zip)

## Artifact layout

- `comparison-table.md` — executive summary, input mode, cost, latency, expected result, observed result, verdict, and visual-fact matrix.
- `cc-771-runs/<run>/run.json` — request metadata, model, input mode, timing, usage, cost, and status.
- `cc-771-runs/<run>/output.md` — final Markdown returned by a successful run.
- `cc-771-runs/<run>/response.raw.json` — raw provider response.
- `cc-771-runs/<run>/evaluation.md` — benchmark evaluation and factual discrepancies.
- `cc-771-ocr-run-artifacts.zip` — downloadable bundle of all non-PDF run artifacts, including failed attempts and retries.

The real source PDFs remain attached to the Linear issue rather than being committed here. This avoids duplicating large input files and keeps the research branch focused on reproducible results.

## Main conclusion

- Direct Mistral remains fast and useful for text and tables, but it does not preserve chart semantics as Markdown.
- GPT-5.2 provides the best quality/cost balance in this battery.
- Claude Opus 5 provides the strongest visual extraction, with higher cost and latency.
- Sonnet 4.5 and Gemini 2.5 Pro remain conditional because of long-document reliability or factual-precision issues.
- No production implementation is proposed in this PR.

## Review checklist

- Confirm that the expected and observed results are explicit for every run attempt.
- Confirm that failed attempts and retries are distinguishable from successful runs.
- Confirm the cost and latency trade-offs before selecting a candidate for validation with sanitized CC documents.
- Do not merge this PR; the next implementation should be a separate card/PR after a candidate is selected.
