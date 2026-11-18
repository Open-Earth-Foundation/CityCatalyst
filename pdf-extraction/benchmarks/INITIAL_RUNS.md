# Initial live checks · 17 November 2026

These runs called the standalone demo with `gpt-6.1-sol`, medium reasoning, one
attempt per case, and at most one automatic repair. They are independent expected
checks, not production CityCatalyst benchmark accuracy or blind held-out results.

| Case | Mistral OCR | Expected checks | Remaining source-review issues |
| --- | --- | --- | --- |
| Small GHGI sample | Off | 6/6 | None flagged |
| Structured chart fixture | Off | 7/7 | None flagged |
| Toronto 2020, publisher report | Off | 12/12 after revalidation | 10 ambiguous field outcomes; scope splits and source conflicts still need review |
| Kyoto 2023, publisher report | On | 2/2 total/year checks | Detailed fields remain flagged; these two checks do not measure row accuracy |

Outputs and public debug logs are under ignored `runs/initial-*` directories.
The small and chart cases required no repair. Toronto and Kyoto each performed
one real repair turn. Passing expected checks does not independently verify page
quotes, eliminate source conflicts, or establish full row recall/precision.

The live checks exposed two implementation problems, now fixed:

1. OpenAI does not permit downloading Files API inputs uploaded with purpose
   `user_data`. The exact submitted JSON Schema is now cached locally before
   session creation and recovered after restarts.
2. The JSON-mode validator incorrectly rejected source observations explaining
   an ambiguous null value, such as a combined scope label without a numeric
   split. Such evidence is now allowed only with `status: ambiguous`; `found`
   still requires a populated value and every populated leaf needs evidence.

Toronto's original failed output/report remain preserved. The same completed
artifact was revalidated under the corrected rule and saved separately as
`revalidated-result.json`. No new agent turn or expected-answer feedback was used
for that revalidation. The source issues remain visible.

## Comparison using the upstream PDF scorer

The saved outputs were also scored offline using unchanged CityCatalyst scorer
version 2 and the Product keys. Matching saved baseline attempts were replayed
through the same scorer; recall, precision, value accuracy, classification and
totals reproduced their recorded scores.

The table below preserves the first adapter's preliminary scores. A later
adapter fix represents an unsplit parent such as `I.1` as `I.1.x` for the legacy
wildcard matcher, without assigning a scope. Rescoring the same Toronto artifact
then gives **83.3% row recall**, rather than 25%. The earlier classification
interpretation overstated its mapping errors. Agent data and baseline scores
are unchanged; see the original-PDF experiment's evaluator amendment.

| Case / output | Attempts | Value accuracy | Row recall | Row precision | Row total passes |
| --- | --- | --- | --- | --- | --- |
| Toronto baseline | 3 | 100% | 100% | 100% | 3/3 |
| Toronto demo, revalidated artifact | 1 | 100% | 25% | 25% | 1/1 |
| Kyoto baseline | 3 | N/A | N/A | N/A | 1/3 |
| Kyoto demo | 1 | N/A | N/A | N/A | 0/1 |

Toronto recovered all 12 numbers and has 100% subsector recall. Nine rows use
parent GPC codes with null scopes. The first adapter incorrectly rejected some
valid all-scopes aggregates; genuinely required scope splits remain separate
from that representation bug. Kyoto is total-only. Its correct printed gross total is 5,923,000 tCO2e,
but the rows include -247,000 tCO2e of removals and sum to 5,676,000 tCO2e
(-4.17%). The row-total failure therefore exposes a boundary/aggregation gap.

The reference is the [12 November recorded benchmark from PR #3424](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/21797f86236243f83ee84e3545cabb0b913ccde9/docs/ingestion-accuracy-runs/2026-11-12-1722-fe14d3a05/report.md),
using `openai/gpt-5.6-luna` and Mistral OCR. The develop baseline snapshot was
empty when checked; this is not a claim about current deployed performance.
The demo has only one attempt per city, uses publisher copies whose byte identity
with the original PDFs is unverified, and did not exercise CityCatalyst import.
This does not establish an overall model ranking. Product distractor diagnostics
are unmeasured here. The earlier 12/12 and 2/2 counts remain selected checks,
not full extraction accuracy percentages.

The detailed ignored report is `runs/comparison-current/comparison.md`. Regenerate
it without API calls using `python -m examples.compare_benchmarks`; see the
[benchmark instructions](README.md#metrics-and-old-baseline).

Publisher PDF downloads succeeded for 15 real city reports. Philadelphia, Chicago
2017 and Dunedin returned HTTP 403 and remain missing. The original shared Drive
files require authenticated download; available publisher copies are labelled
separately and have recorded URLs and SHA-256 hashes. All 27 Product keys, with
691 rows, are installed locally outside Git.
