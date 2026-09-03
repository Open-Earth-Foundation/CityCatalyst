# Evaluation — 2025 real PDF / Claude Opus 5 via OpenRouter

- Input: `2025_Annual_CAP_Report_FINAL_06-17-26_web.pdf`
- Pages: 33
- Time: 258.683s
- Actual cost recorded by OpenRouter: US$0.970075
- Mode: Chat Completions with native PDF input via a signed URL

## Result

- Running text: good; content was converted into structured Markdown.
- Tables: good; report tables and values were preserved as Markdown tables.
- Charts: good. The output describes Figures 1–5 with titles, types, axes, series, units, readable values, and trends.
- Images/infographics: described textually, improving downstream ingestion at the cost of substantially more tokens.

## Representative evidence

For Figure 1, the output records the Business as Usual line, the reduction line, 2030/2035 targets, the 10.54 and 8.16 MMT CO2e values, and the real-data trend. For Figure 4, it records both axes, vehicle-miles bars, and the emissions line, explicitly marking values that are only approximate chart readings.

## Verdict

`Pass` on the CC-771 visual objective for this document. The main caveat is cost/latency: about 4.3 minutes and nearly US$1 per PDF for this run.
