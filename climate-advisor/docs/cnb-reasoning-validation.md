# CNB summary delivery: diagnosis and validation

Investigated locally on 16 September 2026 for CC-907. This documents summary
delivery, the provider comparison, and the unresolved full-document workflow.
CC-827 separately covers transport heartbeats. Both PRs target develop directly;
neither branch depends on the other.

## Scope and current outcome

Readable summaries now reach the browser when the provider supplies them.
This does **not** establish that full-document requests work end to end. In
particular, the document-wide Kraków-to-Cracow edit repeatedly failed and never
produced an accepted rename in this investigation. Read-only questions about the
uploaded PDF succeeded in the four samples below; those successes must not be
reported as validation of full-document editing or of all document queries.

The CC-907 branch contains provider/worker streaming, the transient summary UI,
regression tests, and reproducible fixtures. SSE heartbeats live only in CC-827.
Unrelated composer resizing and KaTeX changes were removed from both review
scopes; the original implementation remains in the pre-split backup branch.

## Why the activity row sometimes showed only Thinking

We compared provider stream events, completed provider responses, the app's SSE
events, and visible browser text. That separated four independent causes:

1. The imported Cracow/Krakow fixture had a ready upload but no storage key.
   Source queries rejected its missing immutable metadata before a document
   reader ran. Restoring the PDF/Markdown and matching hashes repaired the
   source path without weakening integrity checks.
2. Document workers used non-streaming execution. Any summaries returned by
   those calls could not reach the live chat activity display.
3. The adapter forwarded only incremental reasoning events. A completed-only
   summary or missing delta could be lost even if the provider supplied text.
4. Some successful provider calls supplied no readable summary at all. Their
   final summary arrays were also empty; this was not a frontend rendering loss.

## What changed

- Main CNB chat and document workers use Responses API, with shared settings
  requesting detailed summaries and disabling provider storage. Main chat effort
  is high; source readers retain low effort and synthesizers medium. Chapter
  planner/reviewer calls continue to use Chat Completions with detailed summaries.
- Live document workers use the same request-local stream queue as chat and
  chapter workers. Typed output validation, source verification, and cancellation
  remain in place; background analysis keeps non-streaming execution.
- The streaming handler owns a bounded worker-event queue independently of the
  heartbeat wrapper. Parallel workers can emit progress before their tools return;
  disconnects close the source and cancel the request. Neither this adapter nor
  the separate heartbeat fix provides durable execution.
- Incremental text, text/part done events, completed output items, and final
  response summary arrays reconcile by model stream, item ID, and summary index.
  Repeated snapshots are ignored; missing suffixes append, corrected snapshots
  replace the displayed part.
- Encrypted content is excluded. Production summary text is not written to
  telemetry or message history. The compact preview is 12px italic and clears
  on completion/failure; there is no saved summary attached to finished answers.

## Provider comparison

Four isolated notes used the same English fixture, verified source bytes,
configured model roles, and empty conversation history. The exact request was:

> Read the uploaded Krakow KST IV brief. What are the total project value, net capital expenditure, and EIB financing amounts? Cite the source pages and distinguish their definitions. Do not edit the concept note.

Each trial made an initial chat call, a document-reading call, and a final chat
call. Model-generated tool-question wording could vary. Direct OpenAI used the
same model IDs without OpenRouter's `openai/` prefix. Browser visibility was
sampled at approximately 400 ms intervals and confirmed with a live screenshot.

| Route / sample | First visible text after send | App reasoning events | Final summary characters: initial / reader / final |
| --- | ---: | ---: | --- |
| OpenRouter / A | 12.85 s | 143 | 0 / 0 / 694 |
| OpenRouter / B | 2.57 s | 77 | 426 / 0 / 0 |
| Direct OpenAI / A | 3.27 s | 165 | 413 / 0 / 469 |
| Direct OpenAI / B | 3.04 s | 78 | 415 / 0 / 0 |

All four source queries succeeded. All four chats displayed readable summaries
and cleared them after completion. Streamed and completed text matched in these
calls, so completion reconciliation recovered no extra text in this sample.
Automated tests cover snapshots that are the sole source of summary text or
contain text missing from deltas.

A separate live test on the original note received 92 document-worker and 78
chat reasoning events, proving worker forwarding when readable text is supplied.
An earlier browser-only warm-up also displayed summaries but is excluded from
the table because the native recorder initially observed the wrong SDK iterator.

This small sample establishes omissions on both routes; it is not a statistical
provider-performance benchmark. Switching routes or raising effort does not
guarantee readable summaries for every call. A final-only summary may also arrive
too close to completion to be noticeable before the requested UI clear.

## Reproducing the comparison

Seed isolated local notes using the [fixture guide](../fixtures/cnb/krakow/README.md),
restore their PDF artifacts, and use fresh conversations with identical input.
Stop only your own local CA process before running the optional probe from
`climate-advisor/service`:

```powershell
../.venv/Scripts/python.exe -m scripts.serve_cnb_provider_probe `
  --provider openrouter --output ../../output/browser-demo-recording/openrouter.json
# Repeat with --provider openai and a different output file / fresh note.
```

Provider overrides are process-local. The probe records readable delta/final
text and event counts to the chosen local file, excluding prompts, documents,
answers, credentials, and encrypted content. Its per-call timings start at
provider stream iteration; browser timing includes the whole user-visible wait.
Restore the normal server after the experiment. Do not publish private-source
summaries in shared artifacts.

## Automated validation and boundaries

- Independent-branch validation: 84 backend tests passed; four manual integration
  cases skipped. This includes six worker-stream tests without the heartbeat helper.
- Independent-branch frontend validation: 14 chat/SSE tests passed, TypeScript
  passed, and scoped frontend ESLint passed. Math-rendering changes and their
  tests no longer belong to this scope.
- Tests cover partial/final reconciliation, parallel parts, request isolation,
  source-worker early delivery, typed output, and cancellation.
- The restored eight-page fixture tests authenticated, verified source retrieval,
  not a new PDF upload or the external OCR provider.
- This does not fix all-chapter edit planning, invalid edit anchors, durable
  reconnect/restart recovery, or production-proxy behavior. Higher chat effort
  can increase latency and token cost.

## Recorded English name-change request

The replacement PR recording submits `change all Kraków to Cracow for english users please`
to a fresh English note through the real app and model. At 00:23 it visibly shows
the 12px italic summary preview. At 06:11 the recorder's six-minute generation
limit expired without an actionable proposal. The backend proposal remained
`processing`; all 12 saved chapter bodies and revisions were unchanged. Closing
the recording cancelled the request. There was no browser crash or HTTP error.

This is failed/partial flow evidence, not a successful rename demonstration.
Acceptance and reload persistence were not reached. The specific delay remains
unproven, although the planner's all-chapter fan-out is confirmed in code.
The full take is preserved; no failed takes were spliced into a success story.

## Why the summary stayed unchanged while the request took minutes

The frontend keeps the last received summary next to a spinner until the entire
request ends. It collects chapter-progress events but does not render those events
in that activity row. There is no freshness indicator or operation deadline there.
Consequently, the same text remaining visible for minutes is not evidence that
the model is still producing summaries or that editing is progressing normally.

Code inspection confirms the planner processes all 12 unlocked chapters for this
rename, with a concurrency limit of five and independent model review for chapters
with proposed changes. It waits for all workers before final anchor validation.
This can involve up to 24 planning/review calls for a simple document-wide rename.
The provider's request timeout is not a total deadline for that whole workflow.
The exact contribution of each call to the six-minute delay was not captured.

Database results for the same rename instruction on the original local note:

| Attempt (UTC, 15 September 2026) | Elapsed planning | Persisted outcome |
| --- | --- | --- |
| 21:54:37 | 4m 42s | failed / invalid_anchor |
| 22:29:12 | 4m 00s | failed / invalid_anchor |
| 22:58:32 | 3m 28s | failed / invalid_anchor |
| Recording on an isolated note, 22:34:39 | 6m 01s | failed / planning_interrupted after recorder closed |

`invalid_anchor` means a model-proposed source passage did not match at its
claimed offset and could not be recovered from one unique exact quote in the
chapter. The safeguard correctly prevented an uncertain replacement, but the
user's requested edit still failed. The rejected raw plans were not retained,
so these records do not identify the exact offending passage. Refreshing the
browser is not an established remedy. No rename changes were applied.

## Remaining work and acceptance evidence

- Fix reliable anchoring of repeated text while preserving revision checks and
  explicit proposal acceptance; never silently choose an ambiguous occurrence.
- Avoid unnecessary chapter planning for targeted requests. Whole-document
  requests must still cover every affected chapter.
- Surface verified chapter activity, summary freshness, and terminal failure;
  clear summaries on completion/failure as the user requested. Do not fabricate
  new reasoning to keep the display moving.
- Add bounded operation handling and durable disconnect/restart recovery under
  CC-827. Verify the transport path through the deployed ALB separately.
- Rerun the exact document-wide rename through proposal, acceptance, and reload,
  proving every intended occurrence changed and unrelated content was preserved.
  Until that succeeds, full-document editing remains an open problem.
