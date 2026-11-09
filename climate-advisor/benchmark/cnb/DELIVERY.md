# Manual CI run and baseline approval

Commands for running, comparing and approving live in [benchmark.md](benchmark.md).
This file covers the GitHub workflow and the rules a baseline must meet.

## Manual workflow

The `CNB live benchmark (advisory)` workflow runs only on manual dispatch
(`workflow_dispatch`). Nothing runs the benchmark automatically: no PR, push,
merge or schedule trigger, and no offline test job. After changing prompts,
models or the extraction pipeline, agents should suggest a manual run before
opening or updating a PR and wait for the user's authorization to spend that
usage.

Its check, `CNB quality report (non-required)`, must stay outside the
repository's required checks; this file does not configure branch protection.
Failures stay visible and are not hidden with `continue-on-error`. The three
fixtures run one at a time under a 3,600-second evaluation deadline inside a
90-minute job. Per-branch concurrency does not cancel an active run, and there
are no whole-run retries. Configure the `OPENROUTER_API_KEY` secret with a
provider spending limit; a timeout is not a monetary limit. A missing key is
reported as an unavailable evaluation. Manually run only a reviewed revision.

The workflow reads `baseline.json` and the approved run from a separate
`develop` checkout, so a candidate cannot approve its own baseline through its
PR diff. It uploads the run folder, including `review-bundle.zip`, as an
artifact kept for 30 days, also when the run fails. Extract the bundle and open
`index.html`: no server, Python or credentials are needed. The bundle holds the
candidate, the approved baseline when it is comparable, raw outputs, fixture
and prompt snapshots, and the comparison summary. The step summary shows the
same `comparison.md`. The run is also uploaded to the `Clima-CNB-Benchmark`
MLflow experiment with the organisation `MLFLOW_TRACKING_USERNAME` and
`MLFLOW_TRACKING_PASSWORD` secrets; a failed upload exits `3`.

Every run claims its own folder and refuses an existing one. Reports checkpoint
after each completed stage; setup errors, timeouts and stage failures keep
partial reports, though a forcibly killed runner can still lose final uploads.
`delivery.json` separates execution, ground-truth approval, baseline
compatibility and publication. Missing judgments never count as resolved
failures, and missing usage is not proof of zero spend.

## Baseline rules

`baseline.json` is either pending or an approved manifest of this shape, which
`scripts/propose_baseline.py` writes for you:

```json
{
  "status": "approved",
  "run_id": "reviewed-run-id",
  "report_sha256": "sha256-of-exact-report-json-bytes",
  "artifact_sha256": "artifact_digest-of-the-complete-run-directory",
  "fingerprints": {
    "corpus": "corpus_fingerprint from report.json",
    "judge_policy": "evaluator_fingerprint from report.json"
  },
  "approval": {
    "reviewer": "actual-reviewer",
    "approved_at": "actual-approval-date",
    "reference": "approval-PR-or-review-URL"
  }
}
```

The loader accepts it only when the saved run in `results/runs/<run-id>/`
matches the report and artifact hashes, the run completed with every requested
fixture and stage, every fixture's ground truth is approved, every stage has a
valid judgment, the viewer snapshot exists and the approval date is not in the
future. A completed run with known quality failures can be a baseline; an
incomplete or unavailable one cannot. Approved runs stay in git so the trusted
checkout can read them; the scoped `.gitattributes` rule keeps their bytes
identical on Windows and Linux.

The fingerprints cover fixture content and the judge policy (judge model,
judge prompts, stages and scorer code). A candidate whose fingerprints differ
is marked incompatible and gets no deltas: its scores were produced against a
different answer key or judge. An evaluation never promotes itself; a JSON field
does not prove a review happened, the approval PR does.
