# CRVA ingest adapter v0 (CC-1156)

`CcraIngestPlugin` runs on the shared ingestion pipeline. It reads the text of a CRVA PDF and produces a review draft of CRVA module fields. A person must confirm the draft. No CRVA system of record exists, so the plugin stops at `awaiting_review` and `commit` always throws.

## Flow

1. `detect` accepts PDF only, up to 20 MiB (`CCRA_MAX_PDF_BYTES`). This limit is separate from the inventory limit. The file must start with `%PDF-`, and missing bytes fail the item.
2. `parse` gets a URL from the injected `resolveDocumentUrl` and runs `convertPdfUrlToMarkdown`.
3. `adapt` splits the OCR output by page and heading, without running headers and footers, then calls the LLM once per field group and chunk. The model is `LLM_EXTRACTION_MODEL`, and `LLM_CHUNK_CONCURRENCY` caps parallel calls.
4. `adapt` drops each value whose quote is not in the body of its cited page, and reports it in `bundle.dropped`.
5. `validate` warns about uncovered fields, source data over 10 years old (X.1), sources with no year, and years that are in the future or not in the quote.
6. `approvalPolicy` always returns `review`. `reviewSummary` returns the bundle, coverage counts and warnings.

These fail the item: OCR output with no text, any LLM `finish_reason` other than `stop`, invalid JSON, and an OCR failure. The check reads `raw.choices[0].finish_reason`. Replace it with `finishReason` after PR #3364 (CC-1191) merges.

## Covers

Each value has `fieldId`, `value`, `source` (file, page, quote), `origin: "ai_draft"` and `confirmed: false`.

| Field | Content                                        |
| ----- | ---------------------------------------------- |
| A1.1  | Boundary description                           |
| A1.2a | Data sources with year                         |
| A2.1a | Location in country                            |
| A2.1b | Geographical features and natural resources    |
| A2.4a | Key sectors and urban systems                  |
| A2.5a | Vulnerable groups                              |
| B1.2a | Current significant hazards                    |
| C1.1a | Current impact per hazard and vulnerable group |
| C1.2a | Current impact per hazard and sector           |
| D1.1a | Enabling factors per category                  |
| D1.2a | Inhibiting factors per category                |
| E1.1a | Key risks                                      |

Figures, maps and charts are listed in `bundle.figures` with page and caption, for human review.

## Does not cover

- Maps to GeoJSON, and reading values from images, colours or icons.
- Ratings: probability, frequency, intensity, magnitude and degree. The scale is pending C40.
- `OEF` and `Manual` fields, B2, C2, E2, and every other field not listed above.
- Saving to a database, an upload route, a review UI and durable drafts (CC-956).
- PDFs over 20 MiB. Seattle and Buenos Aires do not run in v0.

Code does not enforce the ratings and figures scope. The prompt excludes them and a stray `probability` key is removed, but free text can still hold a rating, and a value can quote a figure caption. Run 4 had neither. The reviewer checks this.

A verified quote proves only that the text is on the page. It does not prove that the quote supports the value.

A crafted PDF can still shift page attribution. A forged `<!-- page: N -->` line for its own page moves earlier text of that page to the page before. Page offsets from the OCR step would close this.

## Madrid result

Four runs, 2026-10-30, on the 48-page scan of the Madrid 2015 report (10.5 MiB). OCR `mistral-ocr-latest`, extraction `gpt-5.6-luna`, about 1.7 minutes per run. Token cost was not recorded.

| Measure                                  | Run 1  | Run 2  | Run 3  | Run 4  |
| ---------------------------------------- | ------ | ------ | ------ | ------ |
| Final state                              | review | review | review | review |
| Fields with at least one value (of 12)   | 12     | 12     | 12     | 12     |
| Values kept                              | 84     | 77     | 90     | 96     |
| Values dropped                           | 1      | 18     | 1      | 0      |
| D1 values                                | 41     | 29     | 50     | 44     |
| C1 values                                | 4      | 2      | 4      | 6      |
| E1 values                                | 2      | 3      | 3      | 3      |
| Figures listed (15 each), with a caption | 8      | 8      | 8      | 9      |
| Warnings                                 | 15     | 15     | 9      | 16     |

"Review" means `awaiting_review`, with no commit.

All four runs predate the final quote check, and output varies a lot between runs. The 18 drops in run 2 were false negatives, because the LLM removed OCR `**` markup from quotes.

The final code was not run on Madrid with the LLM. Its checks were replayed on the run 4 values, using a separate saved OCR of the same scan. That replay kept 94 values and dropped 2, both quoting only the running header on page 24. So A1.1 and A1.2a lost one value each. It raised 15 warnings (14 data age, 1 no year) and no unverified year.

The hand review is from run 1. Every 4th value (21 values): 15 usable. The drop in run 1 was correct: the quote is on page 42, not the cited page 43.

The hand review counts a value as usable when its quote supports it. The 6 failures were:

- Quote does not support the value: A1.1 "21 distritos"; A2.1a "Comunidad de Madrid".
- Duplicate: A1.2a repeats the report itself with no year.
- Year missed: A1.2a "Madrid Salud", although the quote shows `2009_2013`.
- Wrong kind of factor: two D1 values turn a gap in the study into a governmental factor.

Other limits seen on Madrid:

- "12 of 12 fields" means at least one value, not a complete field. C1 and E1 stay thin in every run, and A1.1 has no real boundary description.
- D1 has 29 to 50 values, depending on the run, and many are method indicators from the annex (pages 43 to 48), not factors the report argues.
- B1.2a has overlapping hazards, and one value cites the table of contents.
- Madrid has no projection tables and its sources are old, so it tests warnings better than coverage.

## Proposed thresholds

These are proposals, because the output format is still being defined. They come from one document, and n = 21 for the hand review is too small to separate 71% from 80%.

| Measure                              | Proposal          | Madrid                          |
| ------------------------------------ | ----------------- | ------------------------------- |
| Values dropped by the quote check    | Under 5%          | 0% in run 4, 2.1% in the replay |
| Required v0 fields with a value      | At least 10 of 12 | 12 of 12 in runs 1 to 4         |
| Sampled values usable by hand review | At least 80%      | 71% in run 1, fails             |

The quote check removes every unverified value, so a "verified share" measure would always read 100%. Every value in a draft has a quote on its page by construction.

## Running locally

No run script is committed. A local run needs an `IngestRunner` with `MemoryIngestStore`, `dryRun: true`, and a `resolveDocumentUrl` function. Mistral must be able to read that URL. It cannot fetch the `madrid.es` link (error 3310), so the Madrid runs sent the PDF bytes as a `data:` URL. Do not do that in a server path. Use the document pool URL from CC-955.
