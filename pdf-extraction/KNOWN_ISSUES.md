# Known bugs and limitations

Status after the 81-attempt experiment. This is a reviewable experiment, with
human review required for extracted data. These findings are included in the
scores; failed or weak cases were not removed.

## Open extraction and repair problems

| ID | Trigger and current behavior | Effect | Current workaround / next fix |
| --- | --- | --- | --- |
| E-01 | A request gives an integer year for a report containing financial years. Dunedin interpreted 2021 as 2020/21 instead of the key's 2021/22. | Values can come from the wrong column while the output year label still matches. | State the exact reporting period in user guidance; add explicit start/end period inputs. |
| E-02 | A source prints gross/net totals and a different GPC-normalized inventory boundary. Long Beach retained amounts the key excludes; Dunedin selected gross rather than net. | Correct source numbers can form the wrong requested inventory total. | Specify the target boundary and separate source-reported totals from calculated normalized totals. |
| E-03 | One source amount spans several GPC subsectors, but the GHGI schema permits only one reference. | The agent may leave a defensible aggregate unmapped rather than invent an allocation. | Extend the data model with explicit aggregate/composite references and test conservation of the original amount. |
| E-04 | Repeated repair revisits genuine ambiguity or an already valid mapping. | Average row F1 fell slightly after repair; 75/81 attempts retained flags at the three-repair limit. | Keep automatic repair optional and off by default. Add stopping rules and source-supported change checks before another study. |
| E-05 | A report provides the requested printed total without usable detailed rows. Münster returned the correct total but an empty row array. | The row-sum benchmark fails even though the source headline was extracted correctly. | Inspect source-total and row-total diagnostics separately; represent unavailable detail explicitly. |

These are observed output/contract problems, not evidence that every matching
number or evidence quote has been independently verified. None is resolved by
assigning invented scopes or selecting the best round using answer keys.

## Open demo and debugging limitations

- Raw Mistral structured context is uploaded to the hosted workspace but is not
  cached locally. Page/block/table data and boxes are additional agent context;
  final evidence exports page numbers and quotes, without bounding-box highlights.
- Browser debug output is bounded to the latest 100 items and shortened text.
  The benchmark runner pages all public items, still with shortened text. Private
  reasoning is not exposed.
- An uncertain initial submission is not automatically repeated. Preserve its
  checkpoint and reconcile the existing session; otherwise duplicate paid work
  could occur. There is no general submission-deduplication endpoint.
- The service needs one API worker per SQLite state file. It has no total spend
  budget, automatic retention cleanup, or continuation UI for `needs_input`.
- Docker packaging is provided; the completed study used the local server. The
  experiment is not a CityCatalyst import or deployment test.

## Fixed during development and the experiment

| Problem | Fix and evidence |
| --- | --- |
| Input JSON Schema could not be downloaded after restart through OpenAI's user-data Files API. | Cache the exact submitted schema locally and retain it with the state journal. Recovery is covered by tests. |
| Ambiguous null fields with source observations were rejected. | Permit supported ambiguity evidence without pretending a populated value was found. |
| Polling disconnects were incorrectly treated as failed extractions. | Retry read-only GETs and resume the same accepted session IDs. Preserve retry logs and original checkpoints; uncertain POSTs still stop new sends. |
| Valid parent aggregates such as `I.1` failed legacy wildcard matching. | Map the scorer representation to `I.1.x` on both pipelines, leaving source data/scopes unchanged. Seven regression cases cover valid aggregates and invalid exact-scope matches. All 73 available historical scores replay exactly. |
| Preliminary scores understated aggregate matching. | Preserve them and the old adapter, then rescore the same outputs. Final results are 85.8% / 84.1% Round 2 F1, not the earlier 68.4% / 67.9%. |

## Experiment limitations

- The baseline is the recorded 12 November run, not verified current production.
  Its input PDF hashes are missing; historical byte identity cannot be checked.
  The new OCR conditions do use the same verified original bytes.
- Different models and prompts mean old/new compares whole pipelines. New OCR
  on/off isolates added Mistral within this agent pipeline; it does not turn off
  the agent's image or local PDF/OCR tools.
- C-028 and C-031 were already marked not fully held out. The results separate
  these from the other three held-out reports.
- Three repetitions and seven row-scored Round 2 reports are a small sample.
  F1 is a derived comparison metric; the old headline-eligibility gate is not
  reconstructed. Shared scorer rules include absent-zero matches.
- Early polling recovery briefly overlapped six hosted jobs instead of three;
  an evaluator pause delayed collection of three held-out jobs. Timing is
  diagnostic. The plan preserves both amendments; no attempts were replaced.
- Historical usage/metering labels do not support a reliable old/new cost
  comparison. New usage is best-effort provider accounting, not a final bill.

See [results](benchmarks/ORIGINAL_PDF_RESULTS.md),
[comparable tables](benchmarks/BENCHMARK_TABLE.md) and
[next steps](NEXT_STEPS.md).
