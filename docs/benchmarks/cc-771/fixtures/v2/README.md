# CC-771 structured benchmark v2 fixture

Synthetic English A4 PDF for layout and chart-fact OCR evaluation. Not real city data.

## Files

| File | Purpose |
| --- | --- |
| `generate_fixture.py` | Builds `cc-771-structured-benchmark-v2.pdf` with ReportLab + Pillow |
| `cc-771-structured-benchmark-v2.pdf` | Generated benchmark input |
| `layout-ground-truth.json` | Expected pages, block roles, reading order, relationships |
| `chart-ground-truth.md` | Chart data and five chart-only evaluation answers |

## Regenerate

```bash
/home/david/work/projects/open-earth/CityCatalyst-cc-771/.venv/bin/python generate_fixture.py
```

The script prints SHA-256 and pymupdf page count.

## Layout cases covered

- Repeated header and footer on every page
- Sentence split across pages 1 and 2
- Heading hierarchy (H1, H2, H3)
- Table with title above, caption below, and note
- Image-based line chart with target line and callout
- Figure caption plus non-duplicative surrounding text
- Two-column content on page 3 (Column A before Column B)

## Chart evaluation

Use the five expected answers in `chart-ground-truth.md`. Narrative text intentionally avoids stating those facts in plain text so they remain chart-only checks.
