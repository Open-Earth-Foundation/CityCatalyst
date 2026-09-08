# Evaluation — 2026-09-08-mistral-ocr-4-1-structured-v2

- Status: `ok`
- Model requested: `mistral-ocr-4-1`
- Model returned: `mistral-ocr-4-1`
- Input SHA-256: `b37febad37c887813ef7b459660a6f3ea7816a292a1693f48a981a9f3a0f4c7d`
- Pages: 3
- Selected annotation pages: all
- OCR latency (s): 4.919
- Annotation latency (s): 4.919 (not separately billed by provider)
- Total latency (s): 6.120
- OCR cost USD (est.): 0.012
- Annotation cost USD (est.): null
- Total cost USD (est.): 0.012

## Validation

- schema_valid: true
- warnings: mostly absent/null block confidence values (recorded, non-fatal)
- relationships derived: table caption on page 0; figure caption on page 1 (`nearest_caption_same_page`)

## Semantic fidelity (expected vs observed)

| # | Expected | Observed in annotation / enriched downstream | Result |
| --- | --- | --- | --- |
| 1 | Transport 48 ktCO2e in 2020 | Transport 50 labeled printed | fail (numeric) |
| 2 | Transport below 35 first in 2024 | 2024 + callout text recovered | pass |
| 3 | Target 50 ktCO2e | target 50 recovered | pass |
| 4 | Combined 2025 = 65 | annotation implies 60 | fail |
| 5 | Waste reduction 4 | annotation implies 5 | fail |

Plain `output.md` downstream answers: 0/5 chart facts (`NOT_FOUND`).

## Structural fidelity

- Headers/footers extracted on all pages.
- Heading hierarchy present (title blocks).
- Split sentence continuity: present across page 1→2 in Markdown.
- Two-column page 3: body text preserved; reading-order fidelity should be reviewed on overlays.
- Coordinates normalized 0–1 and schema-valid.

## Visual annotation quality

- kind=chart: pass
- legend Transport/Buildings/Waste: pass
- callout / target: pass
- numeric series fidelity: **fail** (systematic bias; wrongly marked `printed`)
- uncertainties under-reported: fail/partial

## Downstream usefulness

See `downstream-comparison.md` in this run directory.

- Structure/enrichment helped qualitative recovery and page/caption/header tasks.
- Structure caused regression risk when wrong annotation numbers were treated as facts.

## Verdict

Partial success for the investigation: the Mistral-first pipeline preserves useful structure and recovers chart semantics that Markdown alone loses, but BBox numeric values are not trustworthy enough for inventory arithmetic without additional controls.
