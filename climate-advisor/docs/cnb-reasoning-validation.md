# CNB reasoning and edit validation

CNB streams provider-supplied reasoning summaries separately from answers and
persisted chat history. The activity row shows the latest summary and workflow
progress during generation, then clears summaries on completion or failure.
Providers can omit summaries; the app does not generate substitute reasoning.

## Current implementation

- CNB chat and source workers use Responses API. The edit planner and reviewer
  use Chat Completions. Shared model settings request detailed summaries while
  retaining each role's configured effort; Responses requests disable storage.
- A bounded request-local queue forwards worker events before tools finish.
  Deltas and completed snapshots reconcile by model stream, item, and part;
  encrypted content is excluded. Disconnects cancel request-local work.
- One document agent searches a fixed draft snapshot and selects server-issued
  match IDs. Tools resolve offsets and reject ambiguous or invalid replacements
  before independent semantic review of affected chapters. Review operates
  directly on resolved changes; there is no separate chapter-planning pass.
- All-match replacements preserve locked chapters, headings, and protected
  information markers, with exclusion counts persisted in the proposal.
  Complete grounded gap fills retain their existing validation rules.
- Planning and review share a 180-second deadline; the document agent is limited
  to 12 turns. Only explicit acceptance writes revisions. An SSE end without a
  terminal event reports an error and restores chat controls.

Apply migration `20260917_120000` with
`alembic -c cnb-alembic.ini upgrade head` from `climate-advisor/service`.

## Regression checks

From `climate-advisor/service`:

```shell
python -m pytest tests/test_cnb_reasoning.py tests/test_cnb_progress_stream.py tests/cnb/test_edit_session.py tests/cnb/test_edit_review_boundary.py tests/cnb/test_source_analysis.py
```

Frontend suites: `concept-note-chat-progress.jest.tsx`,
`concept-note-edit-decisions.jest.tsx`, and `use-sse-stream-http-errors.jest.tsx`.
These cover summary lifecycle, workflow progress, persisted notices, proposal
choices, and interrupted streams. Backend checks cover exact matches, protected
content, provenance, semantic review, deadlines, isolation, and cancellation.
Multi-chapter replacement coverage uses small in-memory fixtures.

## Manual verification and limits

On a local note with repeated text across chapters, request a rename. Check that
only editable matches are proposed, exclusion counts are visible, and saved
content stays unchanged before acceptance. Reload the pending proposal, accept
it, and reload again to verify revisions. Repeat acceptance to check idempotency.
Also verify a targeted edit, rejection, absent text, and interrupted requests.

Local real-provider/browser audits on 17 September 2026 verified editable-text
renames, acceptance and reload persistence, rejection, protected exclusions,
and desktop/mobile rendering. The historical investigation and local recordings
are referenced in [PR #3148](https://github.com/Open-Earth-Foundation/CityCatalyst/pull/3148).
Those audits are not a fresh browser verification of subsequent cleanup changes.

On 18 September 2026, a real-provider browser recording verified the updated
green, muted italic reasoning presentation and semantic-review repair loop. The
initial candidate was rejected, automatically repaired once, and independently
reviewed again. The resulting 38 replacements covered all 12 chapters; 55 matches
inside protected markers were excluded. Acceptance and reload preserved the exact
approved changes on a disposable copy, while the original note stayed unchanged.
The recording replaces the earlier demo in PR #3148. The CNB and progress test
suites passed with 239 tests and five opt-in skips, including repair exhaustion,
fresh-candidate requirements, incomplete reviews, and the shared deadline.

This does not establish a full regression pass, deployed proxy behavior, durable
reconnect/resume, or worker-restart recovery. CC-827 tracks transport separately;
review/export and remaining proposal presentation feedback are tracked in CC-933.
