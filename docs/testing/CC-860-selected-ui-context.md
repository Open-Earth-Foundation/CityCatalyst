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

The production prompt carries the stable navigation tree. After authorization, each chat turn separately reads current chapters from the managed CNB database and adds `ui_state` to the existing context message. Draft existence, chapter count, and known critical-gap export blockers are refreshed. Browser-only tab/proposal/loading/review state remains null (unknown), not copied from this fixture. Funding and source facts retain the existing bundle contract. An unavailable workspace does not erase source evidence or imply an empty draft.

No fixture-specific values (four chapters, 25 gaps, LIFE funding) are hardcoded in the runtime. The prompt also handles Browse funders when funding is unselected. A missing context bundle remains unavailable; this change does not bypass the existing readiness or authorization gates.

## Validation

- 20 focused Python tests passed: live-state derivation, refresh across turns, authorization ordering, unknown state, existing runtime history, and context-bundle persistence.
- Five additional real API calls using the actual updated production prompt and a fixture-shaped runtime payload returned the expected guidance. This evaluates the prompt contract, not deployment or edit persistence.
- The experiment branch preserves the five-format comparison, first and revised selected-payload runs, and runtime-prompt run without overwriting unsuccessful answers.

## Full evidence

[Experiment branch and full report](https://github.com/Open-Earth-Foundation/CityCatalyst/tree/codex/CC-860-artifacts/docs/experiments/CC-860)

[Original baseline video](https://github.com/user-attachments/assets/d57ae629-bd64-4ba9-8402-26aaa3222fe8)
