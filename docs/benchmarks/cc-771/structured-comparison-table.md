# CC-771 structured OCR comparison table (Mistral-first PoC)

Date: 2026-09-08  
Model: `mistral-ocr-4-1` (pinned)  
Downstream model for usefulness tests: `openai/gpt-4o-mini` (temperature 0)

## Runs

| Run ID | Input | Pages | Annotate | Status | OCR latency (s) | Total latency (s) | OCR cost est. (USD) |
| --- | --- | ---: | --- | --- | ---: | ---: | ---: |
| `2026-09-08-mistral-ocr-4-1-structured-v2` | fixture v2 | 3 | yes | ok | 4.919 | 6.120 | 0.012 |
| `2026-09-08-mistral-ocr-4-1-sandiego-2025-structure` | San Diego 2025 | 33 | no | ok | 4.536 | 7.641 | 0.132 |
| `2026-09-08-mistral-ocr-4-1-sandiego-2023-structure` | San Diego 2023 | 20 | no | ok | 4.333 | 7.730 | 0.080 |
| `2026-09-08-mistral-ocr-4-1-sandiego-2025-annotate-pages` | San Diego 2025 pages 5,6,7,9 | 4 | yes | ok | 7.008 | 19.525 | 0.016 |
| `2026-09-08-mistral-ocr-4-1-sandiego-2023-annotate-pages` | San Diego 2023 pages 4,5,6 | 3 | yes | ok | 7.838 | 11.129 | 0.012 |

Input hashes:

- fixture v2: `b37febad37c887813ef7b459660a6f3ea7816a292a1693f48a981a9f3a0f4c7d`
- 2025 PDF: `cc1eca34c15afc0fa6fd9d3ed3ccd96098e3ffd588287082d76abd9fa0a75a6e`
- 2023 PDF: `3a9281508afff21de1176c18be8f6026e0cd96e4c4db684f57368597f2f06bbd`

Annotation cost: provider did not return a separate annotation line item; total OCR page estimate only. Annotation increases wall time (fixture 6.1 s vs prior Markdown-only ~2 s; selected real pages 11–20 s).

## Semantic fidelity (fixture v2)

Chart-only ground truth score against downstream answers and annotation content:

| Fact | Expected | `output.md` | `output.enriched.md` | `document.structured.json` / annotation |
| --- | --- | --- | --- | --- |
| Highest 2020 sector | Transport 48 ktCO2e | NOT_FOUND | Transport **50** (wrong) | Transport **50** (wrong) |
| Transport &lt; 35 first year | 2024 | NOT_FOUND | 2024 | 2024 |
| Dashed target | 50 ktCO2e | NOT_FOUND | 50 | target present in annotation; downstream miss on structured-only q3 |
| Combined 2025 | 65 | NOT_FOUND | **60** (wrong) | **60** (wrong) |
| Smallest 2020→2025 reduction | Waste −4 | NOT_FOUND | Waste **−5** (wrong) | Waste **−5** (wrong) |

Verdict: plain Markdown still loses chart semantics (0/5). Enriched/structured recover qualitative facts (sector names, year, target, callout) but **numeric series values from BBox annotation are unreliable** and were incorrectly labeled `value_kind: printed`.

## Structural fidelity

| Criterion | Fixture v2 | Real 2025 structure | Real 2023 structure |
| --- | --- | --- | --- |
| schema_valid | yes | yes | yes |
| headers/footers extracted | yes | present on many pages | present on many pages |
| blocks + reading order | yes | yes | yes |
| coordinates in-bounds | yes | yes | yes |
| derived caption links (`nearest_caption_same_page`) | table + figure linked | n/a (full doc) | n/a |
| sparse selected-page indexes preserved | n/a | annotate run pages 5,6,7,9 | annotate run pages 4,5,6 |

## Visual annotation quality

| Criterion | Fixture chart | Real selected pages |
| --- | --- | --- |
| kind detection | chart | mix of chart/photo (expected for mixed layouts) |
| axes / legend / series present | yes | yes on chart regions |
| exact vs approximate labeling | **failed** (misread values marked printed) | treat numeric readings as provisional |
| targets / callouts | target ~50 and transport callout recovered | chart descriptions present |
| uncertainties field | underused | often empty even when values are approximate |

## Downstream usefulness (same model/prompt/budget)

| Representation | Chart facts usable | Page attribution | Figure↔caption | Header/footer contamination | Context chars |
| --- | --- | --- | --- | --- | ---: |
| `output.md` | no (0/5) | page 2 found | caption found in text | header/footer not quoted | 2,840 |
| `output.enriched.md` | partial (qualitative yes, numbers wrong) | page marker present | caption found | header/footer quoted | 5,560 |
| `document.structured.json` | partial (same number errors) | `page_index: 1` correct | caption via relationship/text | header/footer fields used | 35,918 |

Where structure helped: page attribution, caption association, header/footer separation, recovering chart semantics absent from plain Markdown.  
Where it did not / regressed: trusted-looking wrong numbers from annotations can cause confident incorrect downstream answers (worse than NOT_FOUND).

## Operational notes

- Provider failures: none on these runs (HTTP 200).
- Retry behavior: not triggered.
- Artifact policy: Base64 omitted from persisted `response.raw.json`; image SHA-256 retained.
- Overlays: fixture all pages + annotation-selected real pages only.

## Recommendation

**Create a separate production implementation card**, with constraints:

1. Store structured JSON beside Markdown (blocks, headers/footers, coordinates, relationships).
2. Treat BBox numeric chart values as **untrusted** unless reviewed or explicitly marked approximate.
3. Prefer enriched Markdown for retrieval only after annotation quality gates.
4. Do **not** change Climate Advisor contracts until storage/size/partial-annotation semantics are designed.

Negative evidence is part of the result: structured+annotated Mistral is better than Markdown-only for discoverability, but not yet a safe quantitative chart extractors for inventory math.
