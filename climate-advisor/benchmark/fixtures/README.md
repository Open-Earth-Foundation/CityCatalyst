# CNB golden set

A single-pass, stage-by-stage evaluation of whether the Concept Note Builder
pipeline preserves meaning and supports its claims. Python checks the
production output's exact contracts; an LLM judge evaluates meaning and cites
the text behind every verdict. There is no repetition/reliability evaluation and no judge calibration
benchmark.

## Stages

| Stage | Production code exercised | Input | Question |
| --- | --- | --- | --- |
| `extraction` | source analysis and per-chapter quotations for the fixture template | original document | Do retained quotations (document-level and per chapter) preserve expected facts in context, and do topic labels convey the expected topics? |
| `chapter_writing` | chapter drafter, support check, gap sanitizing | this run's extraction + full source text (within the context window) + template + city context | Are facts transferred into the right chapters, are claims supported, are chapter requirements met, and is missing information flagged instead of invented? |
| `verification` | chapter validator (completeness + consistency + answered gaps) | reference draft with seeded defects | Does the validator find each seeded defect, and are its other findings genuine? |
| `editing` | edit planner, semantic review, plan validation, anchor replacement | reference draft + chat request | Does the edit do what was asked, keep what must survive, change only authorized content, and leave the document consistent? |

`all` (the default) runs every stage. `chapter_writing` always runs
`extraction` first and drafts from its output, so the report can tell where a
fact was lost (see *Transfer* below). `verification` and `editing` start from a
frozen, reviewed reference draft so they are isolated from drafting variance. A
failed extraction blocks chapter writing; it never blocks the reference-draft
stages.

## Fixtures

| Fixture | Source | Language | Application drafted |
| --- | --- | --- | --- |
| `harbor-point-heat-resilience` | Synthetic plan, native Markdown with heading/block anchors | en | Green Climate Fund SAP concept note (6 chapters) |
| `richfield-flood-risk` | Public August 2025 Barr Engineering report for Richfield, Minnesota; PDF-derived Markdown, 55 pages | en | Minnesota DNR Flood Hazard Mitigation application (8 chapters) |
| `krakow-flood-drainage-plan` | Kraków's Flood Mitigation and City Drainage Plan 2023-2035 (annex to resolution CXXIV/3390/23); PDF-derived Markdown, 30 pages | pl | Polish FEnIKS FENX.01.02 climate-adaptation application (7 chapters) |

Each directory has:

- `source.md`: the document exactly as CityCatalyst delivers it (Mistral OCR
  with page markers, header/footer, and table rules for PDFs). Its SHA-256,
  format, and page count are pinned and verified with the production artifact
  contract. Richfield's certifying engineer, licence number, and private email
  correspondents are redacted; the Kraków plan is an official document and
  contains no personal data.
- `source.pdf` (PDF fixtures only): the document `source.md` was produced from,
  pinned by `source.original_pdf` (path, SHA-256, URL, notes) and verified by
  `fixture_problems`. No stage reads it; it lets reviewers compare the OCR
  output with the original. The Richfield copy is truly redacted (text and
  signature removed, not covered) to match `source.md`; the Kraków copy is the
  unmodified public annex.
- `golden.json`: expectations for every stage (see below).
- `drafting_input.json`: funder, opportunity, application template, and
  authoritative city context. Every template field is owned by at least one
  chapter's `required_fields`, as the production validator requires.
- `reference_draft.json`: a reviewed production draft (chapters, open gaps, and
  the reviewed extraction it was drafted from). Verification seeds defects into
  it; every edit case starts from it.

Expectations are semantic statements with stable IDs. They are **coverage
targets, not evidence**: the original source and authoritative context establish
truth. There are no keyword lists or reference answers. Statements may be in
English for a Polish source; the judge compares meaning across languages.

### golden.json sections

- `extraction`: facts (statement, required, exact evidence with allowed page or
  heading locators), topics, thresholds.
- `chapter_writing`: facts (origin `document`, `context_bundle`, or
  `application_context`; allowed chapters; optional `extraction_fact` link),
  expected gaps (information the application needs that no input supplies, with
  the chapters where it should be flagged), thresholds.
- `verification`: seeded defects. Each is one or more exact, unique text edits
  plus optional gap removals or additions, with the defect kind, a description,
  the chapters a correct finding should involve, and the validator categories
  that would count as a strict match.
- `editing`: cases with the instruction, optional focused chapter and recent
  messages, the expected outcome (`edit` or `clarification`), the chapters the
  edit may change, statements that must change, and statements that must survive.

## Python versus the judge

Python validates source digests, the production output's exact excerpt text
and locator types, chapter identity, marker/gap parity (the rule production
persistence enforces), that every seeded edit matches exactly once and keeps
parity, which validator findings are the fixed open-gap findings (excluded from
scoring), the edit outcome and which chapters changed, and that the judge
returned exactly one verdict per expectation, defect, model finding, edit case,
and change. A missing or repeated verdict leaves nothing to score, so it is the
only judge problem that withholds metrics; the stage then reports an evaluation
error, never a product failure.

The judge's verdicts stand as given. Its references point reviewers to the text
behind a verdict and are never matched by code: an inflected Polish word, a
changed letter case, or a quote cited from the neighbouring page does not
invalidate the judgment. The viewer shows such a quote as written and marks it
"not found verbatim in this unit". Python never assesses meaning through term
overlap or number presence.

The judge checks entity/quantity relationships, units, time, geographic scope,
negation, uncertainty, proposals versus commitments, and cost versus funding.
Newly derived totals, percentages, and conversions are unsupported under this
benchmark's source-preservation policy.

## Few-shot calibration examples

Every judge prompt contains an `<examples>` block of worked verdicts. Each
anchored example quotes a passage **extracted verbatim** from a fixture document
and names its source unit; `test_few_shot_passages_are_extracted_verbatim_from_fixtures`
fails if a passage is not an exact substring of that unit, or if it overlaps any
golden evidence text, so examples never reveal the answer for an evaluated fact.
Extraction examples must also quote retained text verbatim. Examples span all
three documents and both languages.

## Stage gates

| Stage | Gate (default) | Also fails the stage |
| --- | --- | --- |
| extraction | required facts fully covered in retained quotations >= 0.75; topics >= 0.60 | contradicted fact; any claim not fully supported or not self-contained; non-exact production quotation or locator |
| chapter_writing | required facts fully covered in allowed chapters >= 0.70; required expected gaps flagged >= 0.75 | claim not supported by the original source or by the evidence supplied to its chapter; invented value instead of a gap; raised gap answerable from inputs, answered in another chapter, or unclear; required chapter not satisfied; contradiction; marker/gap mismatch |
| verification | seeded defects detected >= 0.75; false alarms <= 0.25 of model findings | any missed or partially detected defect |
| editing | every case passes | wrong outcome; change outside the allowed chapters; expected change not applied; protected statement altered; unauthorized change; inconsistency after the edit |

A chapter that answers its requirement with all available evidence and flags
only genuinely unavailable information is *satisfied*. `[Information needed: ...]`
marker questions are protected during a cosmetic rename by product contract, so
an old name left inside a marker is not a missed edit. A `clarification` case
also accepts `error:clarification_required` (the plan validator asked for the
missing value). Gates are explicit policy defaults, not calibrated accuracy
estimates; review threshold changes together with fixture changes.

### Transfer

For every chapter-writing fact linked to an extraction fact, the report records
the extraction verdict, the draft verdict, and an outcome: `transferred`,
`lost_in_drafting`, `lost_in_extraction`, or `recovered` (extraction missed it
but the drafter used the full source text). `transfer_rate` is the share of
facts covered in extraction that are also covered in the draft.
`claim_support_rate` is the share of judged claims fully supported (by the
source and, for chapter writing, by the drafter's input) and self-contained;
each other claim is one semantic failure. `drafts.json` keeps every revision the
production support check proposed for each chapter, applied or skipped with a
reason, and the viewer shows them under each chapter.

### Verification metrics

`defect_recall` counts `detected` defects. `strict_defect_recall` additionally
requires a cited finding with an expected category that names every expected
chapter. The validator turns every open gap into a fixed finding; those are
reported as `open_gap_findings` and never sent to the judge. Production
generation never creates evidence links, so, as in production, the validator
receives none and does not report missing links. Its answered-gaps pass reports
each open question that another chapter already answers.

## Run

From `climate-advisor/`:

```bash
# Deterministic tests: contracts, seeding, plumbing, prompt examples; no model calls.
uv run pytest benchmark/tests -q

# Every stage for every fixture, once; the label is shown in the viewer.
uv run python -m benchmark.scripts.evaluate --label baseline

# Selected stages or fixtures (repeat either flag).
uv run python -m benchmark.scripts.evaluate \
  --fixture krakow-flood-drainage-plan --stage chapter_writing
uv run python -m benchmark.scripts.evaluate \
  --fixture richfield-flood-risk --stage verification --stage editing

# Rebuild the viewer from saved runs (no model calls).
uv run python -m benchmark.scripts.publish
```

`--fixtures-dir` overrides the fixture corpus and `--results-dir` the results
folder. `--parallel` evaluates the fixtures concurrently in one process (about
the slowest fixture's time instead of the sum); by default they run one at a
time to keep provider load bounded. `--run-id` names the run folder (default: UTC time plus the label); an
existing run is never overwritten. There is no `--repeats` flag; run again to
measure variance and compare the runs in the viewer. A full run makes one
extraction, one draft per chapter, two or more validator passes per chapter, up
to four edit plans with review per fixture, and four judge calls per fixture. The
live run is started by hand only; CI runs just the offline tests.

Live execution requires `OPENROUTER_API_KEY` and the usual Climate Advisor
settings. `llm_config.yaml` configures `models.cnb_golden_set_judge`
independently of the producer models. The judge uses a structured output schema
per stage, no tools, and a 15-minute request limit; one judgment per stage and
fixture, no voting.

Prompt paths are configured under `prompts.cnb_golden_set_extraction_judge`,
`prompts.cnb_golden_set_chapter_writing_judge`,
`prompts.cnb_golden_set_verification_judge`, and
`prompts.cnb_golden_set_editing_judge`, in
[`benchmark/prompts/`](../prompts/). Reports record
SHA-256 hashes of the loaded prompts of the evaluated stages, the analysis
contract version, and every producer and judge model.

## Results folder and viewer

Every run is saved in one results folder, `climate-advisor/output/cnb_golden_set/`
by default (gitignored); `--results-dir benchmark/results` saves a run with the
committed ones:

```text
output/cnb_golden_set/
├── index.html, app.js      # the viewer, copied from benchmark/viewer/
├── pdf/<fixture>.pdf       # original PDFs, linked from the viewer
└── runs/
    ├── index.js            # summary of every run, for the run picker and comparison
    └── <run-id>/           # one evaluator invocation
        ├── report.md, report.json, outputs/...
        └── viewer.js       # everything the viewer needs for this run
```

Open `output/cnb_golden_set/index.html` directly in a browser; no server is
needed. The evaluator publishes after every run: it snapshots the run (fixtures,
prompts, examples, outputs, judgments) into its `viewer.js` at run time, so old
runs stay readable after fixtures or prompts change, and refreshes the viewer and
`runs/index.js`. Publishing problems are logged and never change the run's exit
code. The viewer shows any run (picker in the top bar) by stage and by document,
and **Compare runs** shows the run history, headline metrics over time, and for
any two runs: what changed in models, prompts, sources and expectations, the
stage results A → B, and every expectation whose verdict changed. Reports
record the run ID, label, and git commit (`-dirty` for uncommitted changes).

Each run folder contains:

- `report.md` and `report.json`: metrics, failures, evaluation errors, details
  (transfer table, validator findings, edit checks), and the
  structured judgments. No complete source documents.
- `usage` per fixture stage in `report.json` (a table in `report.md`): wall
  time, model requests, input/output/reasoning tokens, and the cost OpenRouter
  reports per response (its own charge plus, for bring-your-own-key requests,
  the provider's), also broken down by agent, keyed by the configured prompt
  that sent each request. `wall_seconds` is the whole run. The Compare runs page
  shows time and cost A → B and where the money goes. Runs saved before usage
  recording show no time or cost.
- `outputs/<fixture>/analysis.json`: the raw extraction output, including the
  per-chapter quotations; its summary is saved here but never sent to the judge.
- `outputs/<fixture>/chapter_writing/drafts.json`: chapters with structured gaps
  and the support check's revisions.
- `outputs/<fixture>/verification/seeded_draft.json` and `findings.json`.
- `outputs/<fixture>/editing/cases.json`: outcome, applied changes, and edited chapters per case.
- `outputs/<fixture>/<stage>/judgment.json`: raw judge output, including invalid judgments.

Exit code 1 means a product failure or an invalid/unavailable evaluation; the
report distinguishes them. Exit code 2 means the run ID already exists and
nothing was evaluated.

## Add or change a fixture

1. Add non-sensitive source Markdown in the production artifact format (for a
   PDF, CityCatalyst's Mistral OCR assembly). Pin its SHA-256, format, language,
   and page count in `golden.json`.
2. Write extraction facts with exact evidence and valid locators, and topics.
3. Write `drafting_input.json` with chapter-owned `required_fields`, then
   chapter-writing facts (with `extraction_fact` links) and expected gaps.
4. Run `--stage chapter_writing`, review the draft against the source, fix every
   claim the judge did not support, and save it as `reference_draft.json`
   together with the reviewed extraction.
5. Seed defects (exact, unique edits that keep marker/gap parity) and write edit
   cases, including at least one propagation case and one clarification case.
6. Run the deterministic tests and the live evaluation. Inspect the outputs,
   the original evidence, and the judge explanations; explain intentional
   baseline, prompt, or threshold changes in review.

Model, reasoning, source prompt, tokenizer, or partition/excerpt/topic limit
changes invalidate production cached source analyses through
`source_analysis_contract_version`; the existing tests verify this independently
of the judge.
