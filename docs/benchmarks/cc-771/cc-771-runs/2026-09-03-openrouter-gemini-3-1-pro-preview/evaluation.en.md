# CC-771 — Gemini 3.1 Pro Preview evaluation via OpenRouter

- Run: `2026-09-03-openrouter-gemini-3-1-pro-preview`
- Model: `google/gemini-3.1-pro-preview`
- Returned provider: Google
- Input: same PDF as the baseline, SHA-256 `d00d2d6f9161f3def691f7778e39de9acd18005bd569dd9be04ba39a7b3cbf41`
- Mode: OpenRouter Chat Completions with native PDF input
- Pages: 3
- Time: 29.319s
- Actual cost reported by OpenRouter: US$0.051632
- Tokens: 5,746 total

## Result

The model preserved the text and tables and created a textual representation of the chart with series, values, units, target line, callout, and trends. It recovered all five visual facts from the ground truth.

## Visual-fact matrix

| ID | Result | Notes |
| --- | --- | --- |
| CHART-01 | ✅ correct | Identified Transport as largest in 2020 and approximately 48 ktCO2e. |
| CHART-02 | ✅ correct | Identified 2024 and approximately 34 ktCO2e. |
| CHART-03 | ✅ correct | Identified the 50 ktCO2e target and dashed line. |
| CHART-04 | ✅ correct | Recorded 2025 as 65 ktCO2e and explained the component sum. |
| CHART-05 | ✅ correct | Identified Waste and the approximate 4 ktCO2e reduction. |

**Visual-fact preservation score:** 5/5 (100%).

## Observed risks

- The output calls Transport's 2025 value “exactly 30”, although the chart has no numeric labels; production wording should indicate that the value was visually estimated.
- It also describes the callout line as dashed. This is secondary and does not change the main facts.

## Conclusion

This was a strong and cheaper result than Claude in this round, with slightly higher latency. It should advance to validation on sanitized real PDFs together with Claude.
