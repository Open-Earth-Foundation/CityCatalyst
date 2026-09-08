# Evaluation — 2025 real PDF / Claude Sonnet 4.5 — operational failure

- Input: `2025_Annual_CAP_Report_FINAL_06-17-26_web.pdf` (33 pages)
- Time: 362.348s
- Result: the provider ended the operation with HTTP 504 and message `The operation was aborted`; no usable Markdown was produced.
- Cost: not returned in run metadata.
- Verdict: reliability failure for this long PDF attempt. Sonnet remains promising on the smaller document, but should not advance as a primary candidate until the operational limit is resolved.
