# Evaluation — 2025 real PDF / Gemini 2.5 Pro — response without useful content

- Input: `2025_Annual_CAP_Report_FINAL_06-17-26_web.pdf` (33 pages)
- Mode: OpenRouter Chat Completions with native PDF input via Base64
- Time: 134.202s
- Actual cost: US$0.1680325
- Result: the API returned `finish_reason: stop`, but `message.content` was null; only the reasoning field generically stated that the document had been processed. The Markdown artifact contains only `None`.
- Verdict: operational/contractual failure for the CC-771 objective, despite HTTP 200 and the charged cost. Do not consider this model approved for long PDFs until the empty response is corrected.
