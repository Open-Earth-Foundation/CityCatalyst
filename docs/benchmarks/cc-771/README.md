# CC-771 OCR benchmark research artifact

> **Draft PR — do not merge.**

This directory contains the research artifacts for [CC-771 — Compare OCR tools](https://linear.app/openearth/issue/CC-771/compare-ocr-tools). It does not change the CityCatalyst production pipeline.

## Structured OCR PoC (Mistral-first)

The approved follow-up validates pinned `mistral-ocr-4-1` with blocks, headers/footers, tables, BBox visual annotations, normalized JSON, enriched Markdown, and overlays.

### Start here (structured track)

1. Schemas: [schemas/](schemas/)
2. Controlled fixture v2: [fixtures/v2/](fixtures/v2/)
3. Structured comparison table: [structured-comparison-table.md](structured-comparison-table.md)
4. Runner: [python/run_structured_ocr.py](python/run_structured_ocr.py)
5. Batch: [python/run_all.sh](python/run_all.sh)
6. Unit tests: [tests/test_normalize.py](tests/test_normalize.py)
7. Latest structured runs: [cc-771-runs/](cc-771-runs/) (`2026-09-08-mistral-ocr-4-1-*`)

### Required configuration

```bash
export MISTRAL_API_KEY="..."   # never commit; see vault mistral-key-setup.md
```

Then:

```bash
# from CityCatalyst worktree root
.venv/bin/python -m pytest docs/benchmarks/cc-771/tests -v
docs/benchmarks/cc-771/python/run_all.sh
```

Each run writes:

```text
cc-771-runs/<run-id>/
  input.pdf | input.sha256.txt
  run.json
  response.raw.json
  output.md
  output.enriched.md
  document.structured.json
  evaluation.md
  overlays/
```

### Fixture v2 hash

- File: `fixtures/v2/cc-771-structured-benchmark-v2.pdf`
- SHA-256: `b37febad37c887813ef7b459660a6f3ea7816a292a1693f48a981a9f3a0f4c7d`
- Pages: 3

### Production boundary

This PoC must not modify:

- `PdfOcrJob`
- `PdfOcrService`
- `MistralOcrService`
- `PdfOcrDeliveryService`
- Climate Advisor contracts
- database migrations

## Prior Markdown-only battery (2026-09-03)

- [Final comparison table](comparison-table.md)
- [Controlled benchmark PDF (v1)](cc-771-benchmark-fixture-en.pdf)
- [Run artifacts bundle](cc-771-ocr-run-artifacts.zip)

### Prior conclusion

- Direct Mistral remains fast and useful for text and tables, but Markdown alone does not preserve chart semantics.
- GPT-5.2 and Claude Opus 5 were the strongest multimodal candidates in the earlier battery.
- No production implementation is proposed until the structured PoC recommendation is written.

## Review checklist

- Confirm expected versus observed results for every structured run.
- Confirm overlays are inspectable against the source PDF.
- Confirm secrets and signed URLs are absent from artifacts.
- Do not merge this PR; production changes require a separate approved card.
