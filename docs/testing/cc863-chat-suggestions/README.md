# Short questions above Ask Clima — browser recording

**Result: Passed.** Recorded 22 September 2026 using the real local app, authenticated demo account, backend and OpenRouter calls. The video shows a fresh chat on the existing synthetic “CC-863 — Kraków Cool Schools” note, initial model suggestions, and three suggested questions with answers and refreshed suggestions. It does not regenerate the document.

Environment: `http://localhost:3023`, branch `codex/CC-863-model-proposed-starter-prompts`, Chromium at 1600 × 1000. The existing 12-chapter draft and a previously unaccepted edit proposal remain visible. No proposal was accepted in this take. Confidence is high for the recorded flow.

## Journey

| Time | Completed action and result |
| --- | --- |
| 00:02 | Opened the demo note and started a fresh chat through the UI. |
| 00:29 | Two short model questions appeared directly above Ask Clima. |
| 00:35 | Selected “How can I address EIB eligibility?” |
| 01:05 | Answer explained the catalogue/project mismatch and missing readiness evidence; two refreshed questions appeared. |
| 01:11 | Selected “Which gaps most threaten finance readiness?” |
| 01:27 | Answer prioritized financing, sponsor, preparation and baseline gaps; two refreshed questions appeared. |
| 01:34 | Selected “What sponsor and borrower details are missing?” |
| 01:57 | Answer listed missing legal, governance and financial details; two refreshed questions appeared. |
| 02:03 | Three completed turns and the final short suggestions were visible. |

## What worked

- Four real HTTP 200 suggestion responses each contained exactly two questions. Visible button labels matched the model payloads, rather than fallback labels.
- The longest question was 54 characters, below the 80-character limit.
- The scenario verified suggestions were in the same form as the input and positioned above it, outside scrolling chat history.
- Clicking each suggestion populated and focused the composer. All three questions received substantive answers and the controls became available again.
- Final suggestions: “Which sections should I revise first?” and “What baseline evidence should I add?”

## Needs work and crashes

No user-visible issue observed in this recorded scope. Recorder findings and console/network observations were empty. No crash observed. The unavailable-document disclaimer from the earlier recording did not appear in these three answers; this does not establish that the earlier issue is fixed.

## Setup limitations and untested scope

The document was created in the earlier demo and retained for this recording; only the chat was restarted. The source is explicitly synthetic, and the selected local financing catalogue entry is a poor fit for it. Generated financing statements were recorded as application output, not independently verified financial advice. No mock responses were used.

No production deployment, new document generation, edit acceptance, export, mobile layout, full accessibility audit or post-reload persistence test was performed in this take. No blocker prevented the recorded journey.

## Artifacts and verification

- [Video](demo.mp4): ffprobe verified **129.28 seconds**, **12,105,589 bytes**.
- [Preview](preview.png): extracted at **00:32**; short initial questions and the Ask Clima input are visible together.
