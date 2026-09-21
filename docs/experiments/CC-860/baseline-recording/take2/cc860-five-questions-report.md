# CC-860: five new-user navigation questions

## Outcome

**Result: Failed — guidance accuracy. Recording completed: five of five real questions received answers.** Three answers failed the navigation/state check; two were partial. This is a baseline of the current deployed Clima, **not a test of the proposed prompt**, which has not been installed.

Recorded 21 September 2026 against https://citycatalyst.openearth.dev using authenticated Chromium, 1440 × 1000, real backend and LLM calls. No routes, responses, or answers were mocked. The account was already able to use the CNB; the persona was a new user unfamiliar with its controls. Exact deployed revision was not established for this take.

Starting fixture: a duplicate named `CC-860 UI verification — 21 Sep 2026 (copy)`, fresh chat, existing four-chapter draft, selected European Union LIFE Programme / European City Facility (EUCF) – Call 7, no uploaded evidence, and 25 draft gaps. The original note was preserved. The copied note remains available with this conversation:

[Open recorded note](https://citycatalyst.openearth.dev/en/cities/04d2a48c-d2a2-42e9-868f-c30aeec96a07/concept-notes/da665f2d-095c-4cf8-b049-cad51804d451/)

Terminal state: all five answers captured, funding dialog opened and cancelled, upload control located, export review opened and inspected, then closed. No funding change, file upload, prose edit, or successful download was performed.

Confidence: **High** for observed responses and clicked routes; **limited** for the direct-edit and acceptance behavior mentioned in answer 4, which was not exercised.

## Questions, results, and real click paths

Times are approximate recorder step times. Full verbatim answers and verification text are preserved in [answers.json](answers.json).

| Time | Exact question | Result and observed answer | Verified UI |
| --- | --- | --- | --- |
| 00:09 → 00:22 | I'm new here. Where can I see the draft you generated? Do I need to download it first? | **Partial.** Correctly says no download is needed, but calls it the document/editor area and cannot confirm that a draft exists. | A generated draft is already visible on the right under **Draft preview**, with **Sections** navigation. |
| 00:28 → 00:52 | Where do I click to change the funder and funding programme for this note? | **Fail.** Correctly identifies current funding, then suggests **Back**, **Project setup**, or **Funding programme** near the top. | **Context → Funder profile → Change** opens the funding catalogue with programme selection and template preview. Cancelled without saving. |
| 01:03 → 01:15 | I have a PDF with more project information. Where do I upload it? | **Fail.** Suggests **Sources**, **Supporting documents**, or **Add source**, then **Upload document**, with a setup-page fallback. | **Context → Your files → Upload file**. No file uploaded. |
| 01:24 → 01:36 | I want to correct a sentence in the draft. Where do I type the change, and how do I save it? | **Partial / incomplete verification.** Gives a useful chat replacement example, but also tells the user to click and type directly in the document and look for a save/status indicator. | The chat composer on the left is present and was highlighted. Direct editing, saving, proposal creation, and acceptance were not exercised; those claims are not established by this recording. |
| 01:42 → 02:04 | How do I download this note as a PDF, and why might the download button be disabled? | **Fail.** Says to look for Download/Export and lists speculative causes, including unsupported PDF for the template. Says context contains no active document. | **Review & export → Missing information → Conflicts & logic → Decide & export → Export anyway → Export PDF**. PDF is disabled; the UI reports **25 blocking issues** and requires filling critical gaps through reviewed chat edits. |

All five responses completed and the chat became usable again. Captured completion timings were approximately 10.9, 22.6, 10.2, 10.5, and 19.2 seconds respectively; these are not time-to-first-token measurements.

## Prioritized findings

### F01 — P2 — Navigation answers invent labels and omit current document state

- **Category:** Usability / correctness.
- **First visible:** 00:22; strongest navigation evidence at 00:52 and 01:15; export mismatch at 02:04.
- **User goal:** Find existing controls without knowing the application.
- **Reproduction:** Open the copied note with its visible draft; ask the five exact questions above; compare the answers with Draft preview, Context, and Review & export.
- **Observed:** The assistant uses plausible but incorrect control names for funding and uploads, cannot confirm the visible draft, and does not identify the observed critical-gap export blocker. Its caveats acknowledge uncertainty but still leave users searching for controls that are not the actual paths.
- **Expected:** Name the current visible tab and controls, distinguish the existing draft from chat, and give state-specific export guidance. If state is unavailable, do not supply invented paths or assert that the document is absent.
- **Impact:** New users can get lost despite the requested actions being available in the same screen.
- **Evidence:** Main video; `q1-answer.png`, `q2-answer.png`, `q2-real-funding-controls.png`, `q3-answer.png`, `q3-real-upload-control.png`, `q5-answer.png`, `q5-real-export-controls.png`; verbatim `answers.json`.
- **Frequency:** Observed in this single five-question conversation; no repeated stochastic evaluation performed.
- **Confidence:** High for Q1, Q2, Q3, Q5. Q4 direct-edit assertions remain unverified.
- **Likely cause:** Not established from browser evidence. Missing or inadequate UI/state context is a hypothesis consistent with the responses.
- **Exit criterion:** Repeat these five questions with the proposed prompt/context installed; answers must identify actual control names and current draft/export state. Separately exercise any claimed edit/save route.

### F02 — P2 — Review could not check any of the four chapters

- **Category:** Reliability.
- **First visible:** Approximately 02:15–02:16; failed requests begin at 02:11.
- **User goal:** Review the draft before exporting.
- **Reproduction:** Open **Review & export** on the copied note and wait for review completion.
- **Observed:** UI reports “0 chapters were reviewed, but 4 chapters could not be checked” and offers **Retry 4 failed chapters**. Four chapter-validation requests returned HTTP 409. The user can continue to the export screen, but review remains incomplete.
- **Expected:** Complete the review or explain the actionable reason the chapters cannot be checked.
- **Impact:** This take cannot establish completed completeness/consistency review. It must not be described as a clean review.
- **Evidence:** Recorder metadata observations at 02:11–02:15, recorded finding at 02:16, export screenshot.
- **Frequency:** Observed once in this take. Retry recovery was not tested.
- **Confidence:** High for visible failure; underlying cause not established.
- **Likely cause:** Not established from browser evidence. HTTP 409 alone does not establish a code defect or its cause.
- **Exit criterion:** Review all four chapters successfully, or display an actionable conflict explanation and verify recovery.

## What worked and what broke

Real authenticated chat accepted and answered all five questions. Draft preview displayed existing content. Context exposed the actual funding and upload controls. The funding dialog opened and cancelled normally. The review wizard reached its export stage and showed blocking gaps with PDF disabled.

No browser crash or uncaught page exception was recorded. The four HTTP 409 validation failures have a visible effect and are covered by F02. They did not stop the five-question conversation. The absence of uploaded evidence was explicitly described by the export UI as non-blocking; critical gaps were the displayed export blocker.

## Setup limitation and preserved first take

The first take stopped before sending Q1 because a fresh-session cookie banner covered **Send message**. Playwright timed out instead of forcing the click. That partial video is retained at `../cc860-five-questions.mp4`; its metadata has `ok: false`. Verified duration: 35.600 seconds; size: 1,641,551 bytes.

The specific setup correction was to select **Decline** normally before starting the chat. Take 2 reused the untouched copied note and recorded all five questions continuously. No clips were spliced together and no product failure was removed from the final take. The initial cookie obstruction is a recording setup limitation, not evidence that CNB chat itself was broken.

## Coverage and limitations

| Category | Coverage |
| --- | --- |
| Five new-user questions and real responses | Pass for execution; guidance failed as above |
| Current draft, funding, and upload navigation | Pass for locating/opening actual controls |
| Export disabled state | Pass for observing the state; no downloaded artifact |
| Completeness/consistency review | Fail: four chapters could not be checked |
| Cancel | Pass: funding dialog cancelled without saving |
| Actual upload, funding mutation, edit, save, acceptance | Skipped: this test asks where to click; no corresponding mutation attempted |
| Empty document / missing funder / invalid input | Skipped: recorded fixture already has a draft and selected funding |
| Retry, duplicate submission, idempotency | Skipped: not exercised in five-question scope |
| Reload persistence / interrupted chat recovery / stale state after editing | Skipped: no persistence or edit claim made |
| Desktop | Pass for the recorded 1440 × 1000 viewport |
| Mobile and keyboard accessibility | Skipped: no responsive or standards-compliance claim |
| Loading, response latency, console/network errors | Captured in recorder metadata |
| Proposed prompt and other model runs | Skipped: proposed prompt not installed; one baseline conversation |

Role/name/test-ID locators were usable for the exercised controls. This is not an accessibility audit. No branch or merge readiness verdict was requested or established. The strongest result is the direct comparison of real answers with real navigation. The smallest next validation is the same five questions after introducing accurate UI and document-state context.

## Artifact verification

All final artifacts are in `C:/Users/WBW/Documents/GitHub/CityCatalyst/output/browser-demo-recording/cc860-five-questions/take2/`.

- **Video:** [cc860-five-questions.mp4](cc860-five-questions.mp4), ffprobe duration **145.120 seconds (2:25)**, size **9,668,910 bytes**; 1440 × 1000. Recorder wall time includes setup/conversion and differs from video duration.
- **Metadata:** [cc860-five-questions.json](cc860-five-questions.json), `ok: true`, `error: null`; this means scenario completion, not correct answers.
- **Raw recorder findings:** [cc860-five-questions-findings.json](cc860-five-questions-findings.json). F01 is the post-recording answer assessment documented in this report; raw recorder findings are preserved unchanged.
- **Verbatim questions/answers:** [answers.json](answers.json).
- **Video preview frame:** [preview.png](preview.png), extracted at **00:56** and visually inspected; correct CNB, real draft, and Q2 answer visible. Export screenshot also visually inspected. No credentials are displayed.
- **Scenario:** `C:/Users/WBW/Documents/GitHub/CityCatalyst/output/browser-demo-recording/cc860-five-questions/scenario.cjs`.
- **Report:** `C:/Users/WBW/Documents/GitHub/CityCatalyst/output/browser-demo-recording/cc860-five-questions/take2/cc860-five-questions-report.md`.

Repository working tree remained clean; recording artifacts are ignored. No product prompt or code was changed or deployed.
