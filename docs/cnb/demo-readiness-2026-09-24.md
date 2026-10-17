# CNB demo readiness — local run of develop + #3208 + #3198 (2026-09-24)

Build under test: `local/cnb-demo-integration` in `/Users/cog/OEF/citycatalyst_dev`
= origin/develop (5c6032ce2) + #3208 (population) + #3198 (chat suggestions, 2 trivial conflicts resolved)
+ local-only disk storage bypass for uploads (never pushed) + Carlos's UI commits (P1–P4, see below).
Climate Advisor rebuilt from the same branch (cnb schema at 20260921_120000). App on :3002, CA on :8081.

Test run: Kraków · "Kraków KST IV — Tram to Mistrzejowice" · source = Kraków KST IV project brief (Markdown, 16 KB) · funder = Minnesota DNR FHM Grant (8-chapter template) · run `2d878401-9856-4d4d-bdf8-3d3311629ba5`.

## Step-by-step verdict (demo script mapping)

| # | Demo step | Verdict | Notes |
|---|---|---|---|
| 1 | Land on CNB list for the city | ✅ works | City context band (population "not available" for Kraków locally), note cards, "+ New concept note". |
| 2 | Create a note with a project outline | ✅ works, with caveat | Dialog = optional name + PDF/Markdown dropzone. **There is no free-text "project outline" field** — the outline must be a file. Markdown is delivered directly; PDF needs OCR (Mistral) + S3 on the demo environment. |
| 3 | Sources processed → context ready | ✅ works | Markdown: received → processing → ready in ~30 s locally (one OpenRouter analysis call). Chat is paused until then, with a clear notice. |
| 4 | Choose a funder profile | ✅ works | Search + list → profile + programmes + template preview → Save. After save the user now lands on the Draft tab with a "Funding saved — you're ready to draft" banner and a pulsing Start drafting (P2). Funder profile is still a raw field dump (P5 pending). |
| 5 | Start drafting | ✅ works | Button visible-but-disabled with a reason while sources process (P3). Chat shows "Clima is drafting your concept note · n of 8 chapters · m:ss" with the chapter list (P1); draft polled every 3 s while running. |
| 6 | Drafting duration | ✅ 91 s | 8 chapters (MN DNR template) drafted sequentially in 1 min 31 s (02:45:10 → 02:46:41), ~10–12 s per chapter. Live drafting on stage is realistic; the chat card keeps the audience oriented meanwhile. |
| 7 | Clima's overview message | ✅ works | Hidden draft_overview turn fires automatically; chat shows 'Thinking… Summarising the new draft' and the card switches to 'All chapters drafted — preparing your summary'. Then the 'Draft complete' banner offers Ask Clima / Review & export (P2). |
| 8 | Suggested questions (#3198) | ✅ works | Two model-proposed questions above the composer; they refresh with context ("Which applicant details are missing?" once the MN template was chosen). |
| 9 | Edit proposal → accept | ✅ works | Edit request → 'Checking edits for Funding breakdown' with reasoning summaries (~40 s) → review bar '1 of 1 · Reject all · Accept all' + inline red/green diff → Accept all applied the sentence. |
| 10 | Review & export | ✅ works on the UI branch (blocked on develop) | Guided review ran 8 chapter validations in ~30 s (no template 409), found 29 completeness items with 'Open chapter to fix'. Step 3 'Export anyway' leads to DOCX/PDF cards, but both buttons are **disabled while any critical gap is open** ('Fill every critical gap through reviewed chat edits before exporting'). On a fresh draft every chapter has critical gaps, so the demo could not show an export. The gate is frontend-only (`canExportConceptNote`), so Carlos's rule 'export warns, never blocks' can be applied on the UI branch (done, see below). |

## Findings (UX/UI) — what changed today and what is still open

Shipped on the UI branch today (`feat/cnb-demo-ux`, 7 commits, frontend only, no backend change):
- P1 Drafting progress card in the chat rail + 3 s draft polling while drafting.
- P2 Next-step banner (funder saved / sources ready / draft complete) + "Save and go to drafting" CTA; funding dialog no longer forces the Context tab.
- P3 Start drafting stays visible, disabled with a written reason; Review & export reason visible.
- P4 Welcome message in an empty chat with the stage-specific next step.
- P6 Gap markers in the draft show an inline excerpt of the missing information; ungenerated chapters read 'Not started'.
- Export warns instead of blocking on open critical gaps (acknowledgement checkbox, then DOCX/PDF enabled).

Still open (UI, doable Friday if time):
- P5 Funder selection polish: card rows, readable profile summary instead of the recursive dump, award range + status per programme.
- Styled "Upload incomplete" banner; "Add recommended source" opens the file picker.
- The DOCX/PDF download is generated client-side; the in-app test browser doesn't surface downloads, so verify the actual file in Chrome on Friday.
- The create dialog's dropzone could not be driven by the test browser; drag-and-drop with the file in ~/Desktop/cnb-demo/ must be checked by hand.
- Dev overlay "1 issue": React key warning in FundingSelectionDialog (programme buttons) — harmless, but visible in dev; fix is a `key` on the mapped button.
- Chat suggestions keep refreshing while drafting runs; consider hiding them until the draft exists (they are model calls).
- Export gate changed on the UI branch: open critical gaps now warn (with the 'Export anyway' acknowledgement) instead of disabling DOCX/PDF. This is Carlos's documented rule; Piotr should know the change (item 8 in the asks).
- Fixed today (P6): ungenerated chapters now read 'Not started' instead of 'Draft'; missing-information markers now show a short inline label ('revised opening date…') with the full text in the tooltip.

## Demo-script notes from the run
- **Pair the city and funder coherently.** With Kraków + Minnesota DNR, Clima's overview correctly flagged the mismatch and proposed "Help me resolve the mismatch between the Kraków project and the Minnesota funding programme". For the demo use Kraków + EIB (or Richfield + MN DNR) so the story is about grounding, not eligibility.
- The overview message is long (bullets per chapter of what's missing, "23 additional information requests remain", then "How to continue" prompts). It reads well but takes the whole rail; the "How to continue" prompts duplicate the suggestion chips above the composer.
- Missing-information markers in the draft render as bare amber ⓘ icons on their own lines (tooltip only on click/hover). On stage they read as broken bullets; a short inline label ("Information needed: …") would carry the gap story better.
- The drafting card, the next-step banner and the disabled-with-reason button all behaved as designed during the live run.

## Behaviour observations for Piotr (see backend-notes-2026-09-25.md)
- Population for Kraków is "not available" locally, so the run has no population unless entered manually (CC-866). #3208 lets Clima use CityCatalyst population when it exists.
- Uploads are S3-mandatory even for Markdown; the local run used a disk bypass. PDFs additionally need MISTRAL_API_KEY. Both must be configured wherever the demo runs.
- No funder catalogue seed exists on develop — local EIB + MN DNR rows come from earlier fixtures. The demo environment needs the same rows.

## Carlos's hands-on critique (2026-09-24, late) — with the causes found

1. **"Needs fixes" badge + red dots on all 8 sections.** That is the *review* status after "Review & export" ran chapter validation: every chapter came back `incomplete` (29 blocking findings), so the header pill says "Needs fixes" and each section dot turns red. It is not a drafting error; it says "the funder's required fields are not answered yet". Critique stands: the workspace never explains what "Needs fixes" means or what the next action is, and red-on-everything reads as failure rather than as "fill these in".
2. **Yellow gap markers open a popover but do nothing.** On develop the marker is read-only: it shows the "Information needed: …" question and that is all. The only way to close a gap today is to tell Clima the fact in chat and accept the edit proposal. Answering a gap in place (Answer / "This isn't a gap" / keep as caveat) is exactly what #3206 adds. Critique stands: a clickable chip that offers no action is a dead end; until #3206 lands, the chip should at least say "Answer in chat" and prefill the composer (UI-only, doable).
3. **Chat tone: curt, then verbose; keeps talking about Minnesota on a Kraków note.** Minnesota comes from the funder: the note was set up against the Minnesota DNR Flood Hazard programme, so the template, the eligibility rules and every gap question are Minnesota's. With EIB selected the Minnesota references disappear. Tone (long bullet dumps, "I cannot inspect the draft") is a prompt/behaviour matter — noted for Piotr, not touched.
4. **Changing the funder fails with "The setup changed or another operation is in progress".** That is the generic message for a 409 from the application-context update. Climate Advisor returns 409 when (a) drafting is running, (b) an edit proposal is processing, (c) the existing draft's template refs don't match the new template, or (d) the dialog's remembered "expected funder" no longer matches the run. On this note the likely cause is (d): the dialog snapshots the funder when it first mounts and keeps it, so after the first save the snapshot is stale. UI-side fix candidate (reset the snapshot on open) — to verify Friday before fixing.
5. **New note "Test Carlos 2" with no upload: the funder button in chat, and Minnesota showing.** The catalogue lists every funder in the database (Minnesota DNR and EIB) regardless of city; nothing filters by region. Critique stands: a Kraków note should not offer a Minnesota state programme first. The "Choose funder and programme" button in the welcome message opens the same dialog; if it appeared broken, it was waiting for the application context request on a brand-new run (silent). Noted as a UI check for Friday.
6. **No document uploaded, yet the draft talks about "Fast Tram Stage IV".** Found: the local EIB programme row itself is seed data written for the Kraków demo — its summary reads "Case-by-case EIB project finance product selected for the Krakow Fast Tram Stage IV concept-note demo" and lists "tram infrastructure" as an intervention. The drafter treats funder/opportunity context as evidence, so an empty note inherits the tram. Two consequences: the demo environment's catalogue must not carry demo-flavoured programme text, and Piotr should keep opportunity descriptions out of the "project facts" the drafter may state.
7. **How the "missing information" model works today (for reference).** Each chapter is drafted with `[Information needed: …]` markers where the source lacks a required fact; every marker is also a `concept_note_gaps` row with severity critical/noncritical. Gaps close only through an accepted chat edit that supplies the fact (or, with #3206, through the gap interview). The pre-export review re-checks each chapter against the template's required fields and turns open gaps into "blocking" findings; the export path lets you acknowledge and export anyway (on the UI branch).

**Why so many chips (answer to Carlos):** one chip = one unanswered required field of the funder template. The Minnesota template asks for Minnesota-only facts (eligible local government, authorized agent, submittal date, USD requested, prior FHM awards), so the Kraków brief can't answer them: 4 per chapter, 29 total. With EIB + the Kraków brief the count drops to real gaps. Friday UI plan: replace the loose chips with one collapsed block per chapter ("Clima needs 4 things for this chapter"), one row per gap with "Answer in chat" prefilling the composer; #3206's Answer / Not a gap / Caveat actions plug into the same rows later.

**Gap block — built (2026-09-24, second branch):** `feat/cnb-gap-guidance` (worktree `scratchpad/cnb-ui2`, served on **http://localhost:3003**, same integration code as 3002 + one commit). Standalone `[Information needed: …]` lines leave the prose; each chapter gets one collapsed block "Clima needs N things for this chapter" with Required/Optional tag, the question, the reason, and "Answer in chat" (prefills the composer with the chapter + question). Inline mid-sentence markers stay as chips. Rows come from the chapter's open gap records, falling back to the markers. Type check + 6 tests green. To be raised as its own PR after Carlos compares 3002 vs 3003.

## UI cleanup pass (2026-09-24, on `feat/cnb-gap-guidance`, served on :3003)
Assessment → applied (all frontend, type check + 29 tests green):
- Funder dialog: profile is a 2-column summary of the funder's stated/derived facts with "Show all details" (raw dump only on demand); funder rows carry a type pill (e.g. Multilateral development bank); programme rows show award range + status; save button hints "Next: start drafting in the Draft tab."
- Header status: a one-line explanation under the pill for Needs fixes / Needs re-validation / Reviewed / Ready ("The review found required information still missing. Open Review & export to see each item, or answer them in chat.").
- Chapter labels: validated-incomplete chapters read "Needs fixes", stale ones "Needs re-validation" (they said "Draft").
- Chat: suggestion chips hidden while chapters are drafting (they were refreshing via model calls mid-run).
- "Add recommended source" in chat now opens the Context tab *and* the file picker.
- "Upload incomplete" banner uses the shared next-step banner in warning tone with a Retry button.
- Context tab copy: "Climate risk data isn't included in concept notes yet." / "Similar funded projects aren't matched yet."; section heading no longer promises "confirm or correct" on read-only tiles.
Assessed, not changed (needs a decision or backend): section rail red dots after review (consistent with "Needs fixes", kept); the React key warning from the funding dialog (dev-only overlay, source not pinned); catalogue not filtered by city; chat overview duplicating the chips.
