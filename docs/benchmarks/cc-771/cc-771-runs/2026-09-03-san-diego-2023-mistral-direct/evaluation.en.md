# Evaluation — 2023 real PDF / direct Mistral OCR

- Input: `2023_CAP_Annual_Report_9-23-24_AM_FINAL.pdf`
- Pages: 20
- Time: 6.484s
- Cost: approximately US$0.080, estimated from 20 pages at US$4/1,000 pages
- Mode: same integration as CC, `mistral-ocr-latest`, through Files API/signed URL, without `include_image_base64`

## Result

- Running text: good for extractable text content.
- Tables: many structured tables in the main body could not be assessed; there was no evidence of a general text-extraction failure.
- Charts: insufficient. The emissions inventory figure on page 5 was emitted as `![img-4.jpeg](img-4.jpeg)`, without a semantic title, axes, series, or chart values.

## Verdict

`Pass` on the basic text path; `fail` on the core requirement to recover visual information. This is an independent confirmation using a different real chart from the synthetic fixture.
