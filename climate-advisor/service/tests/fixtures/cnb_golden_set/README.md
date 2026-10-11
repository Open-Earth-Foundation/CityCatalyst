# CNB grounding golden set

A single-pass evaluation of whether Concept Note Builder preserves meaning and
supports its claims. Python checks exact contracts; an LLM judge evaluates
semantic coverage and evidence support. No repetition/reliability evaluation or
judge calibration benchmark is included.

## Evaluation paths

| Stage | Input | Question |
| --- | --- | --- |
| `source_analysis` | Original document -> production analysis | Do retained quotations preserve expected facts in context, and do topic labels convey the expected topics? |
| `drafting` | Frozen reviewed bundle -> production chapter drafter | Does the draft preserve relevant facts, answer the application requirements, and avoid invented claims or commitments? |
| `end_to_end` | Fresh source analysis -> production chapter drafter | Does information survive the complete pipeline, including upstream omissions or distortions? |

`all` runs all available paths. Source analysis runs **once** and its actual
output is reused for end-to-end drafting. The frozen and fresh drafting paths
serve different diagnostic purposes; they are not repetition measurements.
A semantic failure in stage 1 does not prevent end-to-end drafting when an
analysis was produced. A generation failure blocks that dependent path.

## Fixtures and expectations

| Fixture | Format | Stages |
| --- | --- | --- |
| `richfield-flood-risk` | Public August 2025 Barr Engineering report for Richfield, Minnesota; PDF-derived Markdown with 55 page markers | All |
| `harbor-point-heat-resilience` | Synthetic fictional city plan with Markdown heading/block anchors | Source analysis |

Each directory has `source.md` and `golden.json`; Richfield also has
`drafting_input.json`. The source SHA-256 is pinned and verified with the production
artifact contract. Richfield's certifying engineer, licence number, and private
email correspondents are redacted. No private uploads or credentials belong here.

Expected facts are semantic statements with stable IDs and required/optional
status. Source facts include exact evidence and allowed locators for baseline
review and fixture validation. Draft facts include their origin and allowed
chapters (empty means any chapter). Topics are descriptions of meaning. There
are no keyword lists, reference-answer strings, or `match` rules.

The golden expectations are **coverage targets, not factual evidence** for the
judge. The original source and authoritative city/application context establish
truth. Generated source summaries are excluded from every judge input: they
are neither evaluated output nor supporting evidence. Production analysis and
drafting still run unchanged, including their normal use of source summaries.
The benchmark does not replace production inputs to manufacture a different pipeline.

## Run

From `climate-advisor/`:

```bash
# Deterministic tests of contracts, orchestration, and cache behavior; no model calls.
uv run --directory service pytest tests/cnb/test_golden_set.py -q

# All paths, each once.
uv run --directory service python -m scripts.evaluate_cnb_golden_set

# One path or fixture.
uv run --directory service python -m scripts.evaluate_cnb_golden_set \
  --fixture richfield-flood-risk --stage drafting
uv run --directory service python -m scripts.evaluate_cnb_golden_set \
  --fixture richfield-flood-risk --stage end_to_end
uv run --directory service python -m scripts.evaluate_cnb_golden_set \
  --fixture harbor-point-heat-resilience --stage source_analysis
```

`--fixture` may be specified multiple times to select different cases.
`--fixtures-dir` and `--output-dir` override the default directories. There is no
`--repeats` flag. Explicitly selecting a drafting path for a fixture without
one fails; an unfiltered drafting run selects only fixtures supporting drafting.

Live execution requires `OPENROUTER_API_KEY` and the usual Climate Advisor
settings. `llm_config.yaml` independently configures `models.cnb_golden_set_judge`
and the source/drafting models. The checked-in judge is `openai/gpt-6-sol` with
high reasoning effort; no silent fallback to a producer model is used.

## Review the judge prompts

The prompts use the repository's `<role>`, `<task>`, `<input>`, `<output>`, and
`<example_output>` format and live together in:

- [`prompts/cnb/golden_set/source_analysis.md`](../../../../prompts/cnb/golden_set/source_analysis.md)
- [`prompts/cnb/golden_set/drafting.md`](../../../../prompts/cnb/golden_set/drafting.md)

The drafting prompt is shared by frozen-input and end-to-end evaluations.
Prompt paths are configured under `prompts.cnb_golden_set_source_judge` and
`prompts.cnb_golden_set_drafting_judge`. Reports record SHA-256 hashes of the
loaded prompt text, producer analysis contract version, and producer/judge models.
The judge uses a structured output schema with no tools and a 10-minute request
limit. It makes one judgment per evaluated stage; there is no voting or repeated
judging. Provider/schema failures are evaluation errors, not quality verdicts.

## Python versus the judge

Python validates source digests, exact excerpt text, correct locator types,
chapter presence, and judge output contracts. Every judge reference must quote an
exact substring of an existing input/output unit. Coverage requires exactly one
verdict per expectation. A supported fact must be cited in the allowed chapter;
evidence supplied only to another chapter cannot support the current one.
Invalid judgments withhold metrics and fail evaluation rather than assigning a
product defect. Python also retains the incremental-cache and contract-invalidation
tests. It does not assess semantics through term overlap or number presence.

The judge evaluates both directions:

1. Expected fact -> output: `covered`, `partially_covered`, `missing`, or `contradicted`.
2. Every substantive output claim -> evidence: `supported`, `partially_supported`,
   `unsupported`, `contradicted`, or `uncertain`.

Source analysis checks **retained quotations against the complete original source**.
Coverage can combine several retained passages; source text that was not retained
cannot fill gaps in that coverage. Topic labels are checked separately. There is
no summary-coverage or summary-to-retained-evidence support score. Claim
`supplied_verdict` is null and `supplied_evidence` is empty in this stage.

Drafting checks **complete generated chapters against original source/context**,
then separately checks support in the evidence actually supplied to that chapter.
That second evidence set excludes generated source summaries, earlier generated
chapters, and the current draft. The production inputs themselves are unchanged.
Complete source text appears in supplied evidence only when the production token
budget permits it; the judge always receives the full original source separately.
A correct fact in a final chapter counts even if no intermediate summary or
retained quotation contains it. A fact present only in the original document
cannot count as coverage in generated chapters.

The judge checks entity/quantity relationships, units, time, geographic scope,
negation, uncertainty, proposals versus commitments, and cost versus funding.
It judges rounding in context, with no universal percentage tolerance. Newly
derived totals/conversions remain unsupported under this benchmark's
source-preservation policy. Clarity is assessed across the retained quotations
together or in the reading context of complete draft chapters; ordinary resolvable
pronouns are acceptable. The judge does not use a summary of either output.

Chapter judgments check whether the application question is answered and whether
chapters contradict each other. Explicitly acknowledging unavailable information
is acceptable; inventing answers or omitting relevant available information is not.
The judge's own semantic accuracy is not mechanically established by reference
validation or mocked tests; judge calibration is outside this ticket.

## Gates and reports

Coverage gates use semantic verdicts. Source coverage measures retained quotations;
draft coverage measures complete chapters:

| Gate | Default |
| --- | --- |
| Source retained-fact coverage (fully covered / required) | >= 0.75 |
| Source topic coverage (fully covered / expected topics) | >= 0.60 |
| Draft required-fact coverage | >= 0.70 |

Reports explicitly show counts of fully covered, partially covered, missing, and
contradicted required facts, alongside the full-coverage percentage. Partial
coverage does not count as full coverage. A contradicted fact, any claim
not fully supported by original evidence (including uncertain/partial verdicts),
an unclear claim, or an output contradiction fails the stage. Draft claims must
also be fully supported by the supplied evidence after excluding generated summaries, and required chapter
requirements must be satisfied. Any invalid quotation/locator or empty chapter
fails integrity checks. These gates are explicit policy defaults, not calibrated
accuracy estimates. Review threshold changes intentionally with fixture changes.

The evaluator writes to `climate-advisor/output/cnb_golden_set/` by default:

- `report.md`: metrics, integrity/semantic failures, evaluation errors, and cited findings.
- `report.json`: structured reports and full structured judgments.
- `outputs/<fixture>/analysis.json`: the complete raw production analysis for diagnosis;
  its summary is saved here but never sent to the judge.
- `outputs/<fixture>/<stage>/judgment.json`: raw judge output, including invalid judgments for review.
- `outputs/<fixture>/drafting/drafts.json` and `end_to_end/drafts.json`: generated chapters.

Reports do not embed complete source documents or judge input payloads. Markdown
findings are truncated to short snippets. Output directories are reused; the
current report names the stages evaluated in this invocation. Use a new
`--output-dir` when preserving a previous result. Exit code 1 means a product
failure or an invalid/unavailable evaluation; the report distinguishes them.

## Add or intentionally change a fixture

1. Add non-sensitive source Markdown matching the production artifact format.
2. Pin its SHA-256, format, and page count in `golden.json`.
3. Write semantic fact/topic statements with essential qualifiers. Add exact
   evidence and valid locators for source facts. Mark genuinely optional facts.
4. For drafting, add a reviewed `drafting_input.json` and relevant fact targets
   with allowed chapters; do not require every document fact in the final note.
5. Run the deterministic tests and the selected live evaluation. Inspect the
   generated passages, original evidence, and judge explanations.
6. Explain intentional baseline/prompt/threshold changes in the review. Update
   the frozen analysis only after reviewing its factual accuracy and excerpts.

Model, reasoning, source prompt, tokenizer, or partition/excerpt/topic limit
changes invalidate production cached source analyses through
`source_analysis_contract_version`; the existing tests verify this independently
of the semantic judge.
