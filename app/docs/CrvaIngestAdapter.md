# CRVA ingest adapter v0 (CC-1156)

`CcraIngestPlugin` runs on the shared ingestion pipeline. It reads the text of a CRVA PDF and produces a review draft of CRVA module fields. A person must confirm the draft. No CRVA system of record exists, so the plugin stops at `awaiting_review` and `commit` always throws.

## Flow

1. `detect` accepts PDF only, up to 20 MiB (`CCRA_MAX_PDF_BYTES`). This limit is separate from the inventory limit.
2. `parse` gets a URL from the injected `resolveDocumentUrl` and runs `convertPdfUrlToMarkdown`.
3. `adapt` splits the OCR output by page and heading, then calls the LLM once per field group and chunk. The model is `LLM_EXTRACTION_MODEL`, and `LLM_CHUNK_CONCURRENCY` caps parallel calls.
4. `adapt` drops each value whose quote is not on its cited page, and reports it in `bundle.dropped`.
5. `validate` warns about uncovered fields, source data over 10 years old (X.1) and sources with no year.
6. `approvalPolicy` always returns `review`. `reviewSummary` returns the bundle, coverage counts and warnings.

A truncated LLM response, invalid JSON, or an OCR failure fails the item. The truncation check reads `raw.choices[0].finish_reason`. Replace it with `finishReason` after PR #3364 (CC-1191) merges.

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

## Madrid result

Four runs, 2026-10-30, on the 48-page scan of the Madrid 2015 report (10.5 MiB). OCR `mistral-ocr-latest`, extraction `gpt-5.6-luna`, about 1.7 minutes per run. Token cost was not recorded.

| Measure                                                    | Result on the final code (run 4) |
| ---------------------------------------------------------- | -------------------------------- |
| Final state                                                | `awaiting_review`, no commit     |
| Fields with at least one value                             | 12 of 12                         |
| Values kept / dropped                                      | 96 / 0                           |
| Kept quotes found on the same page of the digital original | 96 of 96                         |
| Figures listed for review                                  | 15, of which 9 have a caption    |
| Warnings                                                   | 16 (14 data age, 2 no year)      |

Output varies between runs. Values kept and dropped were 84/1, 77/18, 90/1 and 96/0. Runs 1 to 3 used an earlier quote check: the 18 drops in run 2 were false negatives, because the LLM removed OCR `**` markup from quotes. The check now ignores that markup.

The hand review is from run 1. Every 4th value (21 values): 15 usable. In the same run, 83 of 84 kept quotes were also on the same page of the digital original. The one drop was correct: the quote is on page 42, not the cited page 43. The one quote not found in the original is a heading on page 24, which the original text layer does not expose.

The hand review counts a value as usable when its quote supports it. The 6 failures were:

- Quote does not support the value: A1.1 "21 distritos"; A2.1a "Comunidad de Madrid".
- Duplicate: A1.2a repeats the report itself with no year.
- Year missed: A1.2a "Madrid Salud", although the quote shows `2009_2013`.
- Wrong kind of factor: two D1 values turn a gap in the study into a governmental factor.

Other limits seen on Madrid:

- "12 of 12 fields" means at least one value, not a complete field. C1 has 2 to 6 cells and E1 has 2 or 3 risks.
- D1 has 41 to 50 values, depending on the run, and many are method indicators from the annex (pages 43 to 48), not factors the report argues.
- B1.2a has overlapping hazards, and one value cites the table of contents.
- Madrid has no projection tables and its sources are old, so it tests warnings better than coverage.

## Proposed thresholds

These are proposals, because the output format is still being defined. They come from one document, and the hand review from one run.

| Measure                              | Proposal          | Madrid     |
| ------------------------------------ | ----------------- | ---------- |
| Kept values with a verified quote    | 100%              | 100%       |
| Quotes dropped                       | Under 5%          | 1.2%       |
| Required v0 fields with a value      | At least 10 of 12 | 12 of 12   |
| Sampled values usable by hand review | At least 80%      | 71%, fails |

## Running locally

The run script is in the Vault task `tasks/CC-1156/artifacts/run-ccra-ingest.jest.ts`. It sends the PDF bytes as a `data:` URL, because Mistral cannot fetch the `madrid.es` link (error 3310).
