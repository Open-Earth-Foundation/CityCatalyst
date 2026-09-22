# CC-860: selected semantic tree and live state

The selected candidate used **416 context tokens** and scored **10/10** on five isolated navigation questions with GPT-5.6 Sol (high reasoning). The five calls cost **USD 0.022756** including upstream caching effects. This is a small API experiment, not a deployed end-to-end result.

## Selected evaluation payload

```text
UI_TREE
CNB
├─ LEFT: Clima chat
│  └─ Bottom: "Ask Clima about this concept note" → "Send message"
└─ RIGHT: concept-note workspace
   ├─ Top-right: "Review & export"
   └─ Tabs
      ├─ "Draft preview"
      │  ├─ "Sections": chapter navigation, not a separate view
      │  └─ Document: read-only preview beside the chat
      ├─ "Structure": local preview changes; not saved
      └─ "Context"
         ├─ "Funder profile" → "Change"
         │  └─ Choose funder → programme → preview automatically linked template → "Save selection"
         │     No separate template selection.
         └─ "Your files" → "Upload file" (PDF/Markdown)

EDIT_FLOW
Request a replacement in left chat → send → proposed edit
→ "Review in document" → "Accept this change" or "Accept all".
Acceptance applies the edit. No direct typing in the preview or separate Save.
Review controls appear only when a proposal exists.

EXPORT_FLOW
"Review & export" → "Missing information"
→ "Continue to conflicts & logic" → "Conflicts & logic"
→ "Continue to decision" → "Decide & export"
→ "Export anyway" → "Export PDF" / "Export DOCX".
Use LIVE_STATE for availability and blockers; do not infer other blockers.

LIVE_STATE
active_tab: Draft preview
draft: {exists: true, chapters: 4}
funding: {funder: European Union LIFE Programme, programme: EUCF Call 7}
uploaded_files: 0
pending_proposal: false
export:
  enabled: false
  blockers: [25 critical gaps; fill through reviewed chat edits]
  missing_upload_blocks_export: false
review:
  checked_chapters: 0
  failed_chapters: 4
  failure_blocks_export: unknown
```

## Runtime implementation

The CNB agent exposes the read-only `concept_note_help` tool when its authorized
context bundle is available. Its description and a short prompt policy request
it for capability and interface-help questions. The semantic UI tree is returned
on demand from `service/app/tools/concept_note_ui_guide.txt`; it is no longer
embedded in every system prompt. Normal context loading no longer reads UI state.

The tool takes no model-selected identifiers, rechecks run ownership/readiness,
and then loads current chapters from the managed CNB database. It returns the
guide plus `ui_state`: current draft existence, chapter count, and known critical
gaps. Browser-only tab/proposal/loading/review state remains null. Failure to
read the workspace preserves the guide with null state, never an empty-draft
claim. Authorization/readiness failure returns an error without reading workspace
state. General Clima and Stationary Energy agents do not receive this tool.

No fixture-specific values (four chapters, 25 gaps, LIFE funding) are hardcoded in
the runtime. Funding/source facts retain the existing context bundle contract.
The tool also explains capabilities and the boundaries of chat actions.

## Tool evaluation (22 September 2026)

Run from `climate-advisor` with `PYTHONPATH=service`:

```text
python -m scripts.evaluate_cnb_help --output ../docs/testing/CC-860-help-results.json
```

This uses the production agent, configured model, actual tool descriptions and
help implementation with automatic tool selection. Persistence is replaced with
the original four-chapter/25-critical-gap fixture; other tools keep their schemas
but execution is rejected to prevent mutations. Each question is an isolated
turn. Raw answers, tool calls and tokens are in
[CC-860-help-results.json](CC-860-help-results.json). This does not establish
browser behavior or deployment. The earlier browser recording predates this rework.

### Results

All five original questions passed manual assessment against the established UI
paths. The configured `openai/gpt-5.6-sol` model automatically called
`concept_note_help` once for each navigation question and the capability question.
It did not call help for the selected-funder fact question. One isolated run per
question; this is not a statistical reliability estimate.

| Question | Help calls | Observed guidance | Assessment |
| --- | ---: | --- | --- |
| Where can I see the draft; download first? | 1 | Right workspace, Draft preview, Sections; existing four chapters; no download required | Pass |
| Where do I change funder/programme? | 1 | Context, Funder profile, Change, funder/programme, linked template, Save selection | Pass |
| Where do I upload a PDF? | 1 | Context, Your files, Upload file | Pass |
| Where do I type and save a correction? | 1 | Left chat, proposed edit, Review in document, Accept this change; no direct typing or separate Save | Pass |
| How do I export PDF; why disabled? | 1 | Review & export wizard, Export PDF; 25 critical gaps; missing uploads alone do not block | Pass |
| What can you do? | 1 | Explains evidence, guidance and proposed edits; distinguishes UI actions from chat capabilities | Pass |
| Which funder/programme is selected? | 0 | LIFE / EUCF Call 7 from supplied context | Pass |

70 focused Python tests passed, including tool isolation, lazy/fresh reads,
authorization failure, unknown workspace state, context persistence, agent
construction, and prompt configuration. Ruff passed for the new tool, harness,
and tool tests. The simplification and documentation passes kept the existing
state builder and removed eager loading instead of adding another runtime path.

A preliminary run used the general-agent default Terra model before the harness
was corrected to explicitly select the configured CNB model, as the streaming
runtime does. Its answers are retained in
[CC-860-help-terra-results.json](CC-860-help-terra-results.json); the table above
uses only the final Sol run.

## Previous prompt-only validation

- 20 focused Python tests passed: live-state derivation, refresh across turns, authorization ordering, unknown state, existing runtime history, and context-bundle persistence.
- Five additional real API calls using the actual updated production prompt and a fixture-shaped runtime payload returned the expected guidance. This evaluates the prompt contract, not deployment or edit persistence.
- The experiment branch preserves the five-format comparison, first and revised selected-payload runs, and runtime-prompt run without overwriting unsuccessful answers.

## Full evidence

[Experiment branch and full report](https://github.com/Open-Earth-Foundation/CityCatalyst/tree/codex/CC-860-artifacts/docs/experiments/CC-860)

[Original baseline video](https://github.com/user-attachments/assets/d57ae629-bd64-4ba9-8402-26aaa3222fe8)
