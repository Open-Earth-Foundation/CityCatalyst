# Human-labelled judge calibration

`cases.json` contains 24 **proposed**, unapproved labels. They are not evidence
that a human has reviewed the judge. Each of six requirement families has a
correct, partly correct, materially incorrect and missing candidate. Families
cover English/Polish, funding status, dates, institutional responsibilities,
table amounts, currencies and units. All currently belong to the held-out split;
none may be copied into judge prompt examples. A development family can be added
separately, but all variants of a source fact must remain in one split.

The command loads the frozen source, receiving-chapter requirement and candidate
into the existing extraction judge. It withholds case identifiers, human
verdicts, rationales, seriousness labels and approval metadata. Incorrect
candidates intentionally bypass production quotation filtering so the judge
can be measured on them. This does not change production validation.

1. A reviewer checks the original source, requirement and every proposed label,
   correcting the candidate, verdict, rationale and seriousness where needed.
2. Run `uv run python -m benchmark.cnb.scripts.calibrate --output-dir output/calibration-review`.
   Pending cases make no provider calls. The report lists each `case_sha256`.
3. After actual human review, record `approval` on each case with `reviewer`,
   `reviewed_at` (`YYYY-MM-DD`) and the matching `case_sha256`, in a reviewed PR.
   The fingerprint binds all labels and candidates to source/template/requirement
   versions. Changed cases or references invalidate that approval.
4. Use a new `--output-dir` and run again with `OPENROUTER_API_KEY` and configured
   judge settings. Never reuse an existing report directory.

Outputs are `calibration.json` and `calibration.md`. JSON includes per-case
decisions, a four-class confusion matrix, agreement numerator/denominator,
subgroup sizes and **serious false passes** separately. Pending labels and
provider/schema failures are excluded from agreement and counted explicitly.
Exit 0 means every evaluated approved case agrees; 1 means disagreement;
2 refuses an existing report; 3 means pending/unavailable/no evaluations.
This is a controlled judge-only measurement, not proof of whole-pipeline or
multi-chapter reliability. No accuracy threshold is silently applied to live CI.
