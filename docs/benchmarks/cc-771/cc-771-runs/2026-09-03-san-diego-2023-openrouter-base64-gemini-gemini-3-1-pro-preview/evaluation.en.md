# Evaluation — 2023 real PDF / Gemini 3.1 Pro Preview via OpenRouter

- Input: `2023_CAP_Annual_Report_9-23-24_AM_FINAL.pdf`
- Pages: 20
- Time: 85.757s
- Actual cost recorded by OpenRouter: US$0.160164
- Mode: Chat Completions with native PDF input via Base64

## Result

- Running text: good for extracted content.
- Chart: partially good. The model identified the type, axes, legend, 2020–2022 points, and targets. However, it made a relevant factual error: it described the Business as Usual line as declining to approximately 4 MMTCO2e by 2035, while the figure shows that projection increasing slightly to approximately 11 MMTCO2e.
- Other visual elements: the flowchart and infographic received textual descriptions.

## Verdict

`Partial`: recovers visual information, but requires factual validation before production use. The test also shows that transport matters: with a signed URL Google returned “The document has no pages”; with Base64 on the same smaller PDF, the run completed.
