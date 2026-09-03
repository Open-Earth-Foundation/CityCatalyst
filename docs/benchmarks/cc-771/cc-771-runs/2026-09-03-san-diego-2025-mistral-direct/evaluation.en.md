# Evaluation — 2025 real PDF / direct Mistral OCR

- Input: `2025_Annual_CAP_Report_FINAL_06-17-26_web.pdf`
- Pages: 33
- Time: 7.161s
- Cost: approximately US$0.132, estimated from 33 pages at US$4/1,000 pages
- Mode: same integration as CC, `mistral-ocr-latest`, through Files API/signed URL, without `include_image_base64`

## Result

- Running text: good; narrative content and section structure were preserved.
- Tables: good; Table 2 was converted to Markdown with the main values preserved.
- Charts: insufficient for the CC-771 objective. Figures 1–5 appear as image references (`img-*.jpeg`), without a complete semantic representation of axes, series, and trends.
- Textual context around charts: partially preserved. Text near the figures contains some values, but it does not replace the visual data.

## Representative evidence

For Figure 1, the output preserves the title, legend, and notes, then emits `![img-9.jpeg](img-9.jpeg)`. Figure 2 includes a textual list of sectors and percentages, partly derived from page content, but the figure itself remains only an image.

## Verdict

`Pass` for text/tables; `fail` for chart interpretation. The real PDF confirms the issue observed in the synthetic fixture: the current Markdown path does not reliably carry information that exists only in visual elements.
