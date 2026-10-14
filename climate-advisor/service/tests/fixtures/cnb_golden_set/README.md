# CNB golden set

A single-pass, stage-by-stage evaluation of whether the Concept Note Builder
pipeline preserves meaning and supports its claims. Python checks exact
contracts; an LLM judge evaluates meaning and must cite exact text for every
verdict. There is no repetition/reliability evaluation and no judge calibration
benchmark.

## Stages

| Stage | Production code exercised | Input | Question |
| --- | --- | --- | --- |
| `extraction` | source analysis | original document | Do retained quotations preserve expected facts in context, and do topic labels convey the expected topics? |
| `chapter_writing` | chapter drafter, gap sanitizing | this run's extraction + full source text + template + city context | Are facts transferred into the right chapters, are claims supported, are chapter requirements met, and is missing information flagged instead of invented? |
| `verification` | chapter validator (completeness + consistency) | reference draft with seeded defects | Does the validator find each seeded defect, and are its other findings genuine? |
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

Python validates source digests, exact excerpt text, locator types, chapter
identity, marker/gap parity (the rule production persistence enforces), that
every seeded edit matches exactly once and keeps parity, which validator
findings are the fixed open-gap findings (excluded from scoring), the edit
outcome and which chapters changed, and the judge output contract:

- exactly one verdict per expectation, defect, model finding, edit case and change;
- every reference quotes an exact substring of a real unit, scoped correctly
  (a covered fact cites an allowed chapter; supplied evidence belongs to the
  claim's chapter; edit references stay within their case).

A reference that differs from its unit only in case, whitespace, typographic
quotes, or dashes, and matches exactly one span after folding, is replaced with
that exact span and listed under `repaired_quotes` in the report. Anything else
invalidates the judgment: metrics are withheld and the stage reports an
evaluation error, never a product failure. Python never assesses meaning through
term overlap or number presence.

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
| extraction | required facts fully covered in retained quotations >= 0.75; topics >= 0.60 | contradicted fact; any claim not fully supported or not self-contained; non-exact quotation or locator |
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

### Verification metrics

`defect_recall` counts `detected` defects. `strict_defect_recall` additionally
requires a cited finding with an expected category that names every expected
chapter. The validator turns every open gap into a fixed finding; those are
reported as `open_gap_findings` and never sent to the judge. Production
generation never creates evidence links, so evidence-category findings about
missing inline links are genuine production behaviour and are judged as such.

## Run

From `climate-advisor/`:

```bash
# Deterministic tests: contracts, seeding, plumbing, prompt examples; no model calls.
uv run --directory service pytest tests/cnb/test_golden_set*.py -q

# Every stage for every fixture, once.
uv run --directory service python -m scripts.evaluate_cnb_golden_set

# Selected stages or fixtures (repeat either flag).
uv run --directory service python -m scripts.evaluate_cnb_golden_set \
  --fixture krakow-flood-drainage-plan --stage chapter_writing
uv run --directory service python -m scripts.evaluate_cnb_golden_set \
  --fixture richfield-flood-risk --stage verification --stage editing
```

`--fixtures-dir` and `--output-dir` override the default directories. There is
no `--repeats` flag. A full run makes one extraction, one draft per chapter,
two or more validator passes per chapter, up to four edit plans with review per
fixture, and four judge calls per fixture; CI runs one job per fixture.

Live execution requires `OPENROUTER_API_KEY` and the usual Climate Advisor
settings. `llm_config.yaml` configures `models.cnb_golden_set_judge`
independently of the producer models. The judge uses a structured output schema
per stage, no tools, and a 15-minute request limit; one judgment per stage and
fixture, no voting.

Prompt paths are configured under `prompts.cnb_golden_set_extraction_judge`,
`prompts.cnb_golden_set_chapter_writing_judge`,
`prompts.cnb_golden_set_verification_judge`, and
`prompts.cnb_golden_set_editing_judge`, in
[`prompts/cnb/golden_set/`](../../../../prompts/cnb/golden_set/). Reports record
SHA-256 hashes of the loaded prompts of the evaluated stages, the analysis
contract version, and every producer and judge model.

## Reports

The evaluator writes to `climate-advisor/output/cnb_golden_set/` by default:

- `report.md` and `report.json`: metrics, failures, evaluation errors, details
  (transfer table, validator findings, edit checks, repaired quotes), and the
  structured judgments. No complete source documents.
- `outputs/<fixture>/analysis.json`: the raw extraction output; its summary is
  saved here but never sent to the judge.
- `outputs/<fixture>/chapter_writing/drafts.json`: chapters with structured gaps.
- `outputs/<fixture>/verification/seeded_draft.json` and `findings.json`.
- `outputs/<fixture>/editing/cases.json`: outcome, applied changes, and edited chapters per case.
- `outputs/<fixture>/<stage>/judgment.json`: raw judge output, including invalid judgments.

Exit code 1 means a product failure or an invalid/unavailable evaluation; the
report distinguishes them.

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
