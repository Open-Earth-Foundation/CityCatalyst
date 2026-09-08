# CC-771 — Claude Opus 5 evaluation via OpenRouter

- Run: `2026-09-03-openrouter-claude-opus-5`
- Model: `anthropic/claude-opus-5`
- Returned provider: Claude Platform on AWS
- Input: same PDF as the baseline, SHA-256 `d00d2d6f9161f3def691f7778e39de9acd18005bd569dd9be04ba39a7b3cbf41`
- Mode: OpenRouter Chat Completions with native PDF input
- Pages: 3
- Time: 27.041s
- Actual cost reported by OpenRouter: US$0.093260
- Tokens: 8,540 total

## Result

The model preserved the text and tables and created a detailed textual representation of the chart. It recovered all five visual facts from the ground truth, including series, years, units, target line, and callout.

## Visual-fact matrix

| ID | Result | Notes |
| --- | --- | --- |
| CHART-01 | ✅ correct | Identified Transport as largest in 2020 and recorded approximately 48 ktCO2e. |
| CHART-02 | ✅ correct | Identified 2024 and approximately 34 ktCO2e. |
| CHART-03 | ✅ correct | Identified the 50 ktCO2e target and dashed line. |
| CHART-04 | ✅ correct | Recorded 2025 as approximately 65 ktCO2e and the component sum. |
| CHART-05 | ✅ correct | Identified Waste and the approximate 4 ktCO2e reduction. |

**Visual-fact preservation score:** 5/5 (100%).

## Observed risks

- The values were read correctly but qualified as approximate, which is appropriate for a chart without numeric labels.
- The model added an interpretation that the target line functions as a citywide target. Treat this as a model observation, not an OCR requirement.

## Conclusion

This was a strong result for CC-771: the model turns the figure into usable Markdown text. The trade-off is higher cost and latency than the direct Mistral baseline.
