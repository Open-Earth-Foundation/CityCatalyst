# CNB grounding golden set

Versioned fixtures that check whether Concept Note Builder keeps uploaded
evidence grounded at two stages:

1. **Source analysis.** `analyze_document` must produce a summary whose facts
   are traceable to exact excerpts at valid locators, cover the expected facts
   and topics, and stay stable across repeated runs on unchanged input.
2. **Chapter drafting.** Given a frozen, reviewed context bundle, the chapter
   drafter must carry the expected document and context-bundle facts into the
   chapters where the template needs them, without inventing figures.

The scorer lives in `app/services/cnb/golden_set.py` and the contracts in
`app/models/cnb/golden_set.py`. Scoring is deterministic; only the live
evaluator calls models.

## Fixtures

| Fixture | Format | Stages | Source |
| --- | --- | --- | --- |
| `richfield-flood-risk` | PDF-derived Markdown, 55 page markers | 1 and 2 | Public August 2025 Barr Engineering study for the City of Richfield, Minnesota |
| `harbor-point-heat-resilience` | Native Markdown, heading/block anchors | 1 | Synthetic plan for a fictional city |

Each fixture directory contains:

- `source.md`: the exact Markdown Climate Advisor receives from CityCatalyst.
  PDF fixtures keep CityCatalyst's `<!-- page: N -->` markers, page headers and
  footers, and inlined tables. Its SHA-256 is pinned in `golden.json`, and the
  loader revalidates it with the production `verify_source_artifact` contract.
- `golden.json`: expected facts, topics, and gate thresholds (`GoldenFixture`).
- `drafting_input.json` (stage 2 only): the frozen bundle (a reviewed
  `selected_source`, CityCatalyst context, funder, programme, and application
  template) that the drafter receives.

No fixture contains secrets, tokens, production upload identifiers, or private
documents. The Richfield report is public. Its certifying engineer, licence
number, and private email correspondents are redacted.

## Run

Deterministic checks run in the normal CNB suite and in CI:

```powershell
uv run --directory service pytest tests/cnb/test_golden_set.py -q
```

The live evaluation calls the configured OpenRouter models. It needs
`OPENROUTER_API_KEY`:

```powershell
uv run --directory service python -m scripts.evaluate_cnb_golden_set
uv run --directory service python -m scripts.evaluate_cnb_golden_set `
    --fixture richfield-flood-risk --stage drafting --repeats 1
```

It writes `report.md`, `report.json`, and raw model outputs
(`outputs/<fixture>/analysis-run-<n>.json`, `drafts.json`) to
`climate-advisor/output/cnb_golden_set/`. It exits with code 1 when any gate
fails. Reports identify the fixture, analysis contract version, and model
configuration. Evidence is limited to short snippets of model output, so
reports never reproduce full source text.

## What is checked

Expected facts use `match.all_of`: every group must match one case-insensitive
alternative. A term must start at a word boundary, and a term ending in a digit
must also end at one. So `601` never matches `6010`, while `prioriti` matches
`prioritization`. Thousands separators and typographic dashes are normalized
before matching. Rewording therefore passes, while missing facts and wrong
figures fail.

### Stage 1 gates (`source_analysis.thresholds`)

| Metric | Meaning | Default gate |
| --- | --- | --- |
| `invalid_locators` | Excerpts citing a page or anchor absent from the source, or the wrong locator kind for the format | 0 in every run |
| `non_exact_excerpts` | Excerpts whose text is not an exact substring of the cited unit | 0 in every run |
| `required_fact_coverage` | Required facts stated in the summary | mean ≥ 0.75 |
| `fact_grounding` | Stated facts backed by a retained excerpt that overlaps the fact's evidence at an allowed locator | mean ≥ 0.6 |
| `topic_coverage` | Expected topics named by any returned topic | mean ≥ 0.6 |
| `unsupported_sentence_rate` | Summary sentences with a figure missing from the retained excerpts, or term support below `min_sentence_term_support` (0.6) | mean ≤ 0.2 |
| `ambiguous_sentence_rate` | Sentences opening with an unresolved pronoun such as "It" or "This" | mean ≤ 0.2 |

The unsupported-sentence check follows the synthesis prompt's contract: every
summary sentence must be traceable to a *retained* key excerpt. A true document
fact therefore still fails when the excerpt supporting it was dropped. Figures
of 10,000 or more may differ by up to 1% to allow rounding, such as
"$8.85 million" for $8,853,000. Smaller figures, including years, must match
exactly.

### Stability (informational)

With `--repeats` above 1, the report shows fact agreement (the share of facts
with the same covered status in every run) and the mean pairwise Jaccard
similarity of topics, excerpts, and locators. Stability is reported separately
and never fails the run. Low topic or excerpt Jaccard with high fact agreement
is harmless wording variation. A fact listed under `unstable_facts` is covered
in only some runs. Treat it as a prompt or limit weakness even when the mean
coverage gate passes.

### Stage 2 gates (`drafting.thresholds`)

| Metric | Meaning | Default gate |
| --- | --- | --- |
| `required_fact_coverage` | Required facts found in one of the fact's `chapters` (any chapter when empty) | ≥ 0.7 |
| `unsupported_number_rate` | Significant drafted figures absent from every drafter input (source text, bundle, application context) | ≤ 0.1 |
| `empty_chapters` | Chapters drafted with no body | 0 |

A fact found only outside its allowed chapters is listed under "Found in" but
does not count as covered. Figures the drafter derived (sums, conversions) count
as unsupported, because the drafting prompt forbids combining values.

## Interpreting nondeterministic results

- Integrity failures (`invalid_locators`, `non_exact_excerpts`) are always
  regressions in excerpt verification. They are never sampling noise.
- A single run below a semantic gate can be noise. Gates use the run mean, so
  rerun with `--repeats 3` before changing prompts or thresholds.
- A failure that persists across reruns after a prompt, model, or limit change
  is a grounding regression. Fix the prompt or limits rather than loosening the
  gate.

## Add a fixture

1. Create `<fixture-id>/source.md` from non-sensitive Markdown. For PDFs, use
   CityCatalyst's Mistral OCR output so page markers, headers, footers, and
   tables match production. Redact personal data.
2. Compute the SHA-256 of the file with LF line endings and record it in
   `golden.json` together with the filename, label, format, and page count.
3. Add facts with exact `evidence` text and allowed `locators` (`page` for
   PDFs, the readable heading path such as `plan/financing` for Markdown). Mark
   facts a short summary may reasonably omit as `"required": false`.
4. For stage 2, add `drafting_input.json` and `drafting.facts` with the
   `chapters` each fact belongs in. The frozen `selected_source` must pass the
   fixture's own stage-1 gates.
5. Run `pytest tests/cnb/test_golden_set.py`. The fixture tests fail when
   evidence is not exact at its locators or the digest is stale.

## Review intentional baseline changes

The expectations in `golden.json` and `drafting_input.json` are the baseline.
When a prompt or model change legitimately changes what a good answer looks
like:

1. Run the live evaluator and read `report.md` and the raw outputs.
2. Edit expectations or thresholds only with a reason in the pull request, for
   example "the new synthesizer prompt keeps 10 excerpts, so the cost basis is
   now required".
3. To refresh the frozen stage-2 bundle, copy a reviewed
   `analysis-run-<n>.json` result's `summary`, `topics`, and `key_excerpts` into
   `drafting_input.json`. Then confirm `test_frozen_drafting_bundle_passes_its_own_analysis_gates`.

Changing the reader or synthesizer model, reasoning effort, either prompt,
tokenizer, or partition, excerpt, or topic limits changes
`source_analysis_contract_version`. That forces production re-analysis of
cached sources, and `test_every_analysis_input_invalidates_the_reuse_contract`
enforces it.
