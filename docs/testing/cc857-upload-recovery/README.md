# CC-857: initial upload recovery

## Outcome

**Passed** for the recorded flow: automatic retry, persistent incomplete state after reload, and optional recovery into the same workspace. Recorded on 2026-09-22 using Chromium at 1440 x 1000, branch `codex/CC-857-upload-failure`.

The browser used real local authentication, Next.js (port 3058), Climate Advisor (port 8105), PostgreSQL, and S3-compatible storage. No API or authentication mocks were used in this recording. The account, city, and Markdown source were disposable test fixtures. A dedicated missing storage bucket caused genuine upload failures; creating that bucket restored storage without changing application responses.

[Watch the 64-second recording](./demo.mp4).

## Journey

| Time | Action and verified result |
| --- | --- |
| 00:03 | Create a concept note with one Markdown source while its dedicated storage bucket is unavailable. |
| 00:05 | Submit. The application automatically retries once before displaying the optional recovery message. |
| 00:11 | Cancel and reload. The saved card remains **Upload incomplete**, with **Try upload again** and **Delete**, rather than misleading 4% progress. |
| 00:17 | Restore storage and retry the outstanding source in the existing workspace. |
| 00:59 | Normal progress returns. Server readback confirms the same workspace and thread, one upload record, and an accepted upload receipt. |

The user can leave without retrying. Retry is the fallback for persistent failures; the normal path and one automatic retry require no manual intervention.

## Verification

- Recorder metadata: `ok: true`; MP4 duration 64.44 seconds, 3,413,961 bytes.
- Representative frames inspected at 00:10 (recovery message) and 01:00 (restored progress).
- One run creation; upload response sequence **500, 500, 202**; unchanged thread; exactly one upload; receipt accepted.
- Run ID: `69f2a86e-5aa3-497e-b269-9b04b9e94221`.
- Upload ID: `ccd9fa36-0105-4359-81e4-046701a8acc4`.
- Confidence: high for this local Markdown recovery path, supported by browser assertions and persisted server state.

## Failures and setup limitations

No browser crash or additional user-visible defect was observed in the recorded scope. The two HTTP 500 responses at 00:07 and 00:08, and their corresponding browser console errors, are the intentionally induced storage failures handled by the feature.

The wait between 00:17 and 00:59 includes local development route compilation. This recording is not a production latency benchmark. Two other test cards come from aborted recorder setup attempts; the verified flow uses the unique title **CC-857 verified upload recovery**.

Original video, recorder metadata, findings, assertions, scenario, and this report are retained locally under the ignored `output/browser-demo-recording/` directory. Authentication and runtime configuration are excluded from the PR.

## Other validation

- 37 targeted Jest tests passed (upload API, upload service, status retry, OCR queue).
- 27 targeted Python tests passed (run service and upload repository, including persistence across sessions).
- 4 Playwright regression tests passed using controlled API responses: automatic recovery after a lost response, persistent failure and reload recovery, retrying only missing files, and no automatic retry for invalid input. These tests are separate from the real-stack video.
- Targeted ESLint and staged whitespace checks passed.
- Full TypeScript checking remains blocked by the unchanged `app/src/lib/analytics.ts:146` call to `posthog.identify(undefined, properties)` (TS2345).

## Reproduce locally

1. Start the frontend and Climate Advisor with an authenticated disposable city and isolated databases. Configure a dedicated S3 bucket name that does not exist; do not disrupt a shared bucket.
2. Create a concept note with one small Markdown file. Observe one automatic retry, then the incomplete message.
3. Cancel, reload the dashboard, and verify that the incomplete state persists.
4. Create the configured bucket. Choose **Try upload again**, select the original file, and submit.
5. Verify restored progress and the same run/thread IDs, a single upload record, and the accepted initial-upload receipt.

## Not tested and merge assessment

This recording does not validate deployment, production infrastructure, PDF/OCR completion, full LLM generation, mobile layouts, keyboard accessibility, or deletion. The lost-response, partial-batch, and validation cases are covered by controlled-response browser tests, not by this video.

**Recorded flow: Passed. Broader merge verdict: insufficient evidence; keep this PR as a draft pending CI and review.** Deploy the Climate Advisor manifest/receipt API before the frontend. No database migration is required. Historical runs without an initial-upload manifest are not retroactively repaired.
