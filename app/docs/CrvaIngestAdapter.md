# CRVA ingest adapter v0 (CC-1156)

`CcraIngestPlugin` runs on the shared ingestion pipeline. It reads the text of a CRVA PDF and produces a review draft of CRVA module fields. A person must confirm the draft. No CRVA system of record exists, so the plugin stops at `awaiting_review` and `commit` always throws.

## Flow

1. `detect` accepts PDF only, up to 20 MiB (`CCRA_MAX_PDF_BYTES`). This limit is separate from the inventory limit. The file must start with `%PDF-`, and missing bytes fail the item.
2. `parse` sends the item bytes to `convertPdfUrlToMarkdown` as a `data:` URL. An optional `resolveDocumentUrl` replaces that URL.
3. `adapt` splits the OCR output by page and heading, without running headers and footers, then calls the LLM once per field group and chunk. The model is the `crva_extraction` role of `app/llm_config.yaml`, and `LLM_CHUNK_CONCURRENCY` caps parallel calls.
4. `adapt` drops each value whose quote is not in the body of its cited page, and reports it in `bundle.dropped`.
5. `validate` warns about uncovered fields, source data over 10 years old (X.1), sources with no year, and years that are in the future or not in the quote.
6. `approvalPolicy` always returns `review`. `reviewSummary` returns the bundle, coverage counts and warnings. `serializeReviewDraft` and `hydrateReviewDraft` return a JSON clone of the bundle. The bundle stays in `reviewSummary` until #3370 gives it another home.

These fail the item: OCR output with no text or with more page markers than pages, any LLM `finish_reason` other than `stop`, invalid JSON, and an OCR failure. The check reads `result.finishReason`. Provider failures keep the core code `validation_failed`, and their `errorLog` starts with `ocr_failed:` or `llm_failed:`.

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

The adapter's `A2.4a` corresponds to field `A2.4` in the CC-1227 answer keys. The eval harness maps it.

## Does not cover

- Maps to GeoJSON, and reading values from images, colours or icons.
- Ratings: probability, frequency, intensity, magnitude and degree. The scale is pending C40.
- `OEF` and `Manual` fields, B2, C2, E2, and every other field not listed above.
- Saving to a database, an upload route, a review UI and durable drafts (CC-956).
- PDFs over 20 MiB. The plugin rejects them in v0. The eval harness splits them by page range (parts of at most 15 MiB, pages mapped back to the original); see [`../scripts/crva-eval/README.md`](../scripts/crva-eval/README.md).

Code does not enforce the ratings and figures scope. The prompt excludes them and a stray `probability` key is removed, but free text can still hold a rating, and a value can quote a figure caption. Runs 4 and 5 had neither. The reviewer checks this.

A verified quote proves only that the text is on the page. It does not prove that the quote supports the value.

Document text can forge a `<!-- page: N -->` marker. A crafted last page holding markers 1 to N would replace every real page, with no error. So the item fails when the OCR output has more markers than pages. This also fails a document that only mentions such a marker. Page offsets from the OCR step would remove the need for this check.

## Madrid result

Five runs, 2026-10-30, on the 48-page scan of the Madrid 2015 report (10.5 MiB). OCR `mistral-ocr-latest`, extraction `gpt-5.6-luna`, 1.4 to 1.7 minutes per run. Run 5 is the final code.

| Measure                                  | Run 1  | Run 2  | Run 3  | Run 4  | Run 5  |
| ---------------------------------------- | ------ | ------ | ------ | ------ | ------ |
| Final state                              | review | review | review | review | review |
| Fields with at least one value (of 12)   | 12     | 12     | 12     | 12     | 12     |
| Values kept                              | 84     | 77     | 90     | 96     | 83     |
| Values dropped                           | 1      | 18     | 1      | 0      | 1      |
| D1 values                                | 41     | 29     | 50     | 44     | 39     |
| C1 values                                | 4      | 2      | 4      | 6      | 4      |
| E1 values                                | 2      | 3      | 3      | 3      | 3      |
| Figures listed (15 each), with a caption | 8      | 8      | 8      | 9      | 8      |
| Warnings                                 | 15     | 15     | 9      | 16     | 10     |

"Review" means `awaiting_review`, with no commit.

Runs 1 to 4 predate the final quote check, and output varies a lot between runs. The 18 drops in run 2 were false negatives, because the LLM removed OCR `**` markup from quotes.

Run 5 ran on the final code. It made 18 LLM calls, and each returned `finish_reason` `stop`. It used 106,137 prompt tokens and 19,234 completion tokens. Dropped values were 1 of 84 (1.2%): the quote joined two table rows of page 45. No quote came from a page header or footer. Warnings were 4 for data age and 6 for no year. Data-age warnings per run were 13, 7, 8, 14 and 4. The LLM reads years inconsistently, so a "no year" warning can hide an old source, and 4 is a lower bound for run 5. The run used `dryRun: true`, so the runner stops at review, and `commit` was not called.

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

## Buenos Aires and Seattle results (CC-1285)

Five runs per city, 2026-11-17, against the CC-1227 gold keys. Both PDFs are scans over 20 MiB, so the eval harness split them into 3 parts. Adapter code from `d9ce767`, with no plugin changes. Extraction used `gpt-5.6-luna` (role `crva_extraction`, no temperature set). The judge was `gpt-5.6-sol`. Scoring used the harness at the CC-1285 branch head.

| Measure                                         | Buenos Aires 2020      | Seattle 2023           |
| ----------------------------------------------- | ---------------------- | ---------------------- |
| PDF                                             | 185 pages, 41.2 MiB    | 137 pages, 34.7 MiB    |
| Gold rows with a status (in the 12 v0 fields)   | 273 (113)              | 502 (322)              |
| Values kept per run                             | 270 to 305             | 284 to 335             |
| Values dropped by the quote check               | 1.0% to 3.8%           | 2.1% to 3.4%           |
| Minutes per run                                 | 4.7 to 5.5             | 4.4 to 4.6             |
| Tokens per run (prompt / completion)            | about 566,000 / 73,000 | about 374,000 / 67,000 |
| v0 gold rows found, accepted rule               | 23.9% to 31.9%         | 15.8% to 23.3%         |
| v0 gold rows found, full detail                 | 14.2% to 21.2%         | 4.3% to 9.3%           |
| Model values right, accepted rule               | 10.0% to 12.0%         | 18.0% to 23.4%         |
| Model values right, full detail                 | 5.9% to 7.9%           | 4.4% to 9.2%           |
| v0 gold rows with the same status in all 5 runs | 55.8%                  | 58.7%                  |

The accepted rule is Magdalena's ruling of 2026-11-17: a shorter answer is right when it keeps the meaning and every number, percentage, year and unit of the gold. An answer that drops a number or percentage is not right. "Full detail" needs everything in the gold value.

How far to trust these numbers:

- The judge is an LLM. Judging the same run twice gave the same verdict for 98.9% of gold rows and 90.7% of model values, with the same headline.
- A Claude review of 40 sampled rows agreed with the judge on right versus not right for 35 of them (87.5%). Where they differed, the judge was stricter. So the accepted-rule numbers are a lower bound.
- The judge's labels for wrong values (Hallucination, Misattribution, gold gap) agree less well, so treat the error breakdown as indicative.
- "Model values right" compares each value with the gold. The Madrid hand review only checked that the quote supports the value, which is a weaker test, so the two are not comparable.

Where the losses are, from Buenos Aires run 5 and Seattle run 1:

- Omission. A1.2a (sources) causes most of it: 28 of 54 omitted v0 gold rows in Buenos Aires, and 155 of 192 in Seattle. The gold lists the reference list and Seattle's Appendix A, one row per source. The adapter mostly returns in-text citations, and sometimes the report itself.
- Values in the wrong field: about 110 per city. D1.1a and D1.2a take hazard and impact statements, which belong in B1.2a and C2.2a. C1 (current impacts) takes future impacts, which belong in C2.
- Detail lost: Partial values with a missing figure (7 in Buenos Aires, 14 in Seattle) or an incomplete or merged list (17 and 42).
- The 34 fields outside v0 hold 160 Buenos Aires and 180 Seattle gold rows. They count as Omission by design.

Run-to-run variation is large: only about 56% to 59% of v0 gold rows keep the same status in all five runs. No temperature or seed is set for extraction.

## Proposed thresholds

These are proposals, because the output format is still being defined. The Madrid figures come from one document, and n = 21 for the hand review is too small to separate 71% from 80%.

| Measure                                   | Proposal          | Madrid                  | Buenos Aires and Seattle                             |
| ----------------------------------------- | ----------------- | ----------------------- | ---------------------------------------------------- |
| Values dropped by the quote check         | Under 5%          | 1.2% in run 5           | 1.0% to 3.8%, passes                                 |
| Required v0 fields with a value           | At least 10 of 12 | 12 of 12 in runs 1 to 5 | 12 of 12 in every run, passes                        |
| Sampled values usable by hand review      | At least 80%      | 71% in run 1, fails     | Not measured: replaced by the judge                  |
| Share correct in v0 fields, accepted rule | At least 80%      | Not measured            | 11.2% to 13.4% (BA), 11.5% to 17.1% (Seattle), fails |

The quote check removes every unverified value, so a "verified share" measure would always read 100%. Every value in a draft has a quote on its page by construction.

## Running locally

The eval harness in `app/scripts/crva-eval/` runs the adapter on a PDF and scores the result against a gold `.xlsx`. From `app/`:

```
npx tsx scripts/crva-eval/run-adapter.ts --pdf <path-to-pdf> --city <slug> --runs 1
npx tsx scripts/crva-eval/score-run.ts --gold <path-to-gold.xlsx> --run reports/crva-eval/<city>/<timestamp>/run-1.json --city <slug>
```

Options, environment variables and outputs are in [`../scripts/crva-eval/README.md`](../scripts/crva-eval/README.md). The plugin sends the item bytes as a `data:` URL by default, because Mistral cannot fetch the `madrid.es` link (error 3310).
