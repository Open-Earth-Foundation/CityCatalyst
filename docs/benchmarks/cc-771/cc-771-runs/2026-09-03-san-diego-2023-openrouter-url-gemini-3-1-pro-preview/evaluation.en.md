# Evaluation — 2023 real PDF / Gemini 3.1 Pro Preview — ingestion failure

- Input: `2023_CAP_Annual_Report_9-23-24_AM_FINAL.pdf` (20 pages)
- Mode: OpenRouter Chat Completions with native PDF input via a temporary signed URL
- Result: Google returned HTTP 400 with `The document has no pages`; no usable Markdown or inference cost was produced.
- Interpretation: the same input completed with Gemini when sent as Base64, indicating that transport/ingestion mode is a relevant variable for this candidate.
