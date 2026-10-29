# Live evaluation and review bundles

The `CNB live benchmark (advisory)` workflow runs on relevant pull requests to
`develop` and manual dispatch. Its unique check, `CNB quality report (non-required)`,
must remain outside the repository's required checks. This file does not configure
branch protection. Failures remain visible and are not hidden with
`continue-on-error`.

Runs are serial: frozen Markdown first, fresh PDF conversion second, with one
fixture at a time. Each path has a 1,500-second evaluation deadline. The job has a
75-minute limit, allowing setup and artifact publication. Per-PR concurrency does
not cancel an active run. There are no whole-run retries. Set provider spending
limits on the dedicated keys; a timeout alone is not a monetary limit.

Configure `OPENROUTER_API_KEY` and `MISTRAL_API_KEY`. PDF conversion additionally
requires `CNB_BENCHMARK_AWS_ACCESS_KEY_ID`, `CNB_BENCHMARK_AWS_SECRET_ACCESS_KEY` and
`CNB_BENCHMARK_S3_BUCKET`, with optional variable `CNB_BENCHMARK_AWS_REGION`
(default `us-east-1`). These AWS credentials must permit only temporary benchmark
upload/read/delete in that bucket; do not reuse production-wide credentials.
Fork and Dependabot events do not receive provider credentials. Their summary
explicitly says evaluation is unavailable. Manually run only a reviewed trusted
revision. Missing PDF credentials still allow the Markdown path to run.

Every evaluator run claims its own directory before setup and refuses any existing
directory. Reports checkpoint after each completed stage. Handled setup errors,
timeouts and unexpected stage failures preserve partial reports; a forcibly killed
runner can still lose final uploads. `delivery.json` separates execution,
ground-truth approval, baseline compatibility and publication. `comparison.json`
and `comparison.md` preserve both quality failures and unavailable judgments in a
mixed run. Missing judgments never count as resolved failures. Cost totals retain
their provider-completeness fields; missing usage is not proof of zero spend.

## Approving a baseline

`baseline.json` (Markdown) and `baseline-pdf.json` (fresh PDF) are intentionally
pending. A historical run is not an approved baseline. Product must approve the
chapter requirements, and a reviewer must choose the baseline and comparison
policy. Keep approved run directories durably in `results/runs/<run-id>/`; the
30-day CI artifact retention applies to candidates, not the baseline store.

An approval PR replaces the corresponding manifest with this shape:

```json
{
  "status": "approved",
  "run_id": "reviewed-run-id",
  "report_sha256": "sha256-of-exact-report-json-bytes",
  "artifact_sha256": "artifact_digest-of-the-complete-run-directory",
  "fingerprints": {
    "corpus": "copy-from-the-reviewed-run-delivery-json",
    "judge_policy": "copy-from-the-reviewed-run-delivery-json"
  },
  "approval": {
    "reviewer": "actual-reviewer",
    "approved_at": "actual-approval-date",
    "reference": "approval-PR-or-review-URL"
  }
}
```

Use `hashlib.sha256(report_path.read_bytes()).hexdigest()` for the report and
`benchmark.cnb.golden_set.baseline.artifact_digest(run_dir)` for the complete run.
The fingerprints cover fixture content, authoritative source and context, judge
model/prompts, stages and input mode. Changed corpus or judge contracts are marked
incompatible; an evaluation never promotes itself. CI reads manifests and approved
artifacts from the trusted base checkout, so a candidate cannot approve its own
baseline through its PR diff. Genuine human approval is a review process; a JSON
field does not establish that review occurred.

The loader also verifies the saved report's run identity and fingerprints, complete
fixture/stage coverage, approved ground truth, available judgments and a non-future
approval date. A completed run with known quality failures can be a reviewed
baseline; an incomplete or unavailable evaluation cannot.

## Local and downloaded review

From `climate-advisor/`:

```text
uv run python -m benchmark.cnb.scripts.evaluate --label candidate --timeout-seconds 3600
uv run python -m benchmark.cnb.scripts.evaluate --input-path pdf --baseline-manifest benchmark/cnb/baseline-pdf.json
uv run python -m benchmark.cnb.scripts.publish --results-dir output/cnb_golden_set --candidate RUN_ID
```

The evaluator writes `review-bundle.zip` inside its run directory. Download the CI
artifact, extract the entire review bundle, and open `index.html`. No server,
Python installation or provider credentials are needed. The bundle includes the
selected approved baseline when available, the candidate, raw outputs, immutable
fixture/prompt snapshots, matching per-run PDFs and the same comparison data used
by the Markdown summary. The initial view selects this pair. Findings link to
each run's document and stage. Pending or incompatible baselines produce an
explicitly unapproved candidate review, never a claimed regression pass.

Exit codes: `0` approved passing run; `1` quality failure; `2` existing run ID;
`3` unavailable or incomplete evaluation, approval, comparison or publication.
The shared results viewer retains existing snapshots. `publish --rebuild` explicitly
rebuilds snapshots with current fixtures and marks them accordingly; never rebuild
approved run artifacts in place.
