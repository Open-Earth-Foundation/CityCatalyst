# CC-860: new-user navigation baseline

## Scope and result

On 21 September 2026, an authenticated user asked deployed Clima five navigation questions on `https://citycatalyst.openearth.dev`. All five received real backend/LLM answers. Guidance assessment: **three failures and two partial answers**. The proposed UI/context prompt was not installed; this document records the baseline, not a fix or passing regression test.

The fixture was a copied concept note with fresh chat, a visible four-chapter draft, selected LIFE / EUCF Call 7 funding, no uploaded evidence, and 25 critical gaps. Recording used Chromium at 1440 × 1000. The deployed commit was not established. No answers or API responses were mocked.

The accompanying PR includes the continuous 2:25 video. Full responses are in [CC-860-cnb-navigation-answers.json](CC-860-cnb-navigation-answers.json). Timecodes below refer to the recording and are approximate.

## Questions and observations

| Answer time | Exact question | Assessment | Verified UI |
| --- | --- | --- | --- |
| 00:22 | I'm new here. Where can I see the draft you generated? Do I need to download it first? | **Partial:** correctly says no download is needed, but cannot confirm that a draft exists and omits the actual tab/location. | Generated document already visible on the right under **Draft preview**, with **Sections** navigation. |
| 00:52 | Where do I click to change the funder and funding programme for this note? | **Fail:** names the selected funding correctly, but suggests **Back**, **Project setup**, or **Funding programme** near the top. | **Context → Funder profile → Change** opens the catalogue, programme selection, template preview, and **Save selection**. |
| 01:15 | I have a PDF with more project information. Where do I upload it? | **Fail:** suggests **Sources**, **Supporting documents**, **Add source**, and **Upload document**, or returning to setup. | **Context → Your files → Upload file**. |
| 01:36 | I want to correct a sentence in the draft. Where do I type the change, and how do I save it? | **Partial / incomplete verification:** supplies a useful chat replacement example, but also suggests clicking and typing directly in the document and looking for save controls. | Left chat composer verified. Direct editing, saving, proposal creation, and acceptance were not exercised; those claims remain unverified. |
| 02:04 | How do I download this note as a PDF, and why might the download button be disabled? | **Fail:** gives generic Download/Export directions, speculates about unsupported PDF and permissions, and says its context contains no active document. | **Review & export → Missing information → Conflicts & logic → Decide & export → Export anyway → Export PDF**. PDF disabled; UI requires filling critical gaps and reports **25 blocking issues**. |

## Findings

### P2: navigation guidance is not grounded in the visible UI/state

At 00:22, 00:52, 01:15, and 02:04, answers omit visible document state or substitute plausible labels for actual controls. Caveats acknowledge uncertainty but still send a new user looking for incorrect paths. Funding and upload controls are available on the same screen under Context.

Reproduce by opening an existing draft and asking the exact questions above. Expected: actual labels and locations, current draft state, and the displayed export blocker. Do not assert that a document is absent or invent alternative navigation when context is missing.

Observed in one conversation; no repeated stochastic evaluation was performed. Missing UI/state context is a hypothesis, not an established root cause.

### P2: review could not check any of four chapters

At approximately 02:16, Review & export reports “0 chapters were reviewed, but 4 chapters could not be checked,” with **Retry 4 failed chapters**. Four validation requests returned HTTP 409 at 02:11–02:15. The wizard remained navigable, but the review was incomplete. The HTTP status alone does not establish the underlying cause. Retry recovery was not tested.

The final export screen separately reports 25 critical gaps. Its missing-evidence message explicitly says the absence of an uploaded document does not block export; critical gaps are the displayed blocker.

## Coverage and verification

- All five answers completed; observed response completion times were approximately 11, 23, 10, 11, and 19 seconds.
- Draft visible; funding dialog opened and cancelled; upload control located; export wizard traversed; PDF disabled state verified. No browser crash observed.
- No funding mutation, upload, prose edit, proposal acceptance, successful download, reload-persistence check, mobile test, or accessibility audit was performed.
- Recorder completed with `ok: true`; this describes execution, not answer correctness. MP4 verified with ffprobe: 145.120 seconds, 9,668,910 bytes. Extracted frame at 00:56 and export screenshot visually inspected.
- An earlier take stopped before sending Q1 because a cookie banner covered Send. The banner was dismissed normally for the final take, which reused the untouched copied note. The partial take was preserved locally; clips were not spliced and product failures remain visible.

## Follow-up acceptance criteria

After implementing UI/state grounding, repeat these five questions. Require correct tab/control labels, recognition of the existing draft, and the actual export blocker. Exercise the claimed edit/accept/save route separately before treating that guidance as verified. Resolve or explain the four failed review checks. This evidence-only draft does not change application behavior or establish merge readiness for a fix.
