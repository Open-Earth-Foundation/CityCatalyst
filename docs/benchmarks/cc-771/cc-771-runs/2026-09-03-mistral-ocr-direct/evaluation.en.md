# CC-771 — direct Mistral baseline evaluation

## Identification

- Run: `2026-09-03-mistral-ocr-direct`
- Model: `mistral-ocr-latest`
- Input: `cc-771-ocr-benchmark-v1.pdf`
- Pages processed: 3
- Measured time: 1.954s (1,954 ms reported by the runner)
- Estimated cost: US$0.012 (3 pages × US$4 / 1,000 pages, standard OCR rate)
- API status: HTTP 200

## Result

The baseline preserved the running text and both tables well. However, on page 2 it returned only a Markdown image reference:

```markdown
![img-0.jpeg](img-0.jpeg)
```

Because `include_image_base64` was disabled, the Markdown contains no textual representation of the chart data. A downstream consumer receiving only this Markdown cannot recover the values and relationships present in the figure.

## Visual-fact matrix

| ID | Expected fact | Preserved in Markdown? | Notes |
| --- | --- | --- | --- |
| CHART-01 | In 2020, Transport had the highest value, 48 ktCO2e | No | The image was referenced but not interpreted. |
| CHART-02 | Transport fell below 35 ktCO2e for the first time in 2024 | No | The year and value do not appear in the output. |
| CHART-03 | The dashed line represents the 50 ktCO2e target | Not as a chart fact | The number 50 appears in the page 1 table, but the dashed-line semantics were lost. |
| CHART-04 | The sum of the three sectors in 2025 is 65 ktCO2e | Not as a sector sum | The total 65 appears in the narrative, but the three components were not extracted. |
| CHART-05 | Waste had the smallest absolute reduction, 4 ktCO2e | No | No sector series or changes appear in the output. |

**Visual-fact preservation score:** 0/5 (0%).

## Card conclusion

The test confirms the CC-771 hypothesis: the current model is suitable for text and tables, but it does not independently meet the requirement to turn charts into textual context. The next benchmark should compare this baseline with tools that analyze page images and record text/table preservation, visual-fact recovery, cost per page, execution time, and raw/normalized artifacts separately.

## Artifacts

- [Input PDF](../../cc-771-ocr-benchmark-v1.pdf)
- [Generated Markdown](output.md)
- [Raw API response](response.raw.json)
- [Execution metadata](run.json)
