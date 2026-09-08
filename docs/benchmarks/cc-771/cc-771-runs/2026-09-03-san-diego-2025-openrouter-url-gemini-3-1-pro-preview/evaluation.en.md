# Evaluation — 2025 real PDF / Gemini 3.1 Pro Preview — ingestion failure

- Input: `2025_Annual_CAP_Report_FINAL_06-17-26_web.pdf` (33 pages)
- Mode: OpenRouter Chat Completions with native PDF input via a temporary signed URL
- Result: Google returned a content error equivalent to `The document has no pages`; no usable Markdown or inference cost was produced.
- Interpretation: parser/transport compatibility failure for this document and input mode. The earlier Base64 attempt ended with `IncompleteRead`, so this model was not approved for the 2025 PDF.
