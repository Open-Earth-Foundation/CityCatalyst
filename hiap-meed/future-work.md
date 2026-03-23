# Future work (HIAP-MEED)

This file tracks agreed future enhancements that are **out of scope for the current Hard Filter implementation**.

## Legal constraints and soft requirements (Feasibility stage)

Source: Notion “How Legal Signals, Policy Signals, and Socioeconomic Indicators Work in HIAP Ranking”  
`https://www.notion.so/openearth/How-Legal-Signals-Policy-Signals-and-Socioeconomic-Indicators-Work-in-HIAP-Ranking-319eb557728b80d4bf84edb7edd0449a?source=copy_link`

### 1) Non-blocking legal constraints → feasibility evidence

- **Intent**: requirements that do not gate eligibility (Notion “constraint”) should appear as **implementation notes**.
- **Where**: implement in `hiap-meed/app/modules/prioritizer/blocks/feasibility.py` (or a dedicated legal-feasibility helper called by that block).
- **Output**: feasibility evidence should include:
  - a structured list of constraint requirement rows (signal, operator, scope, evidence IDs)
  - a derived human-readable note list suitable for UI display (“permit may apply”, “public procurement required”, etc.)
- **Hard Filter should not emit these**, because constraints do not determine eligibility.

### 2) Soft legal requirements → feasibility modifier (later)

- **Intent**: Notion “soft” requirements can increase feasibility when satisfied and do nothing when not satisfied.
- **Where**: feasibility block (not hard filter).
- **Note**: exact strength enums may differ in the repo mock vs Notion; preserve semantics.

## Free-text exclusions → semantic matching (Hard Filter stage)

Source: Notion “Data Reviews” (exclusion intent)  
`https://www.notion.so/openearth/Data-Reviews-2eceb557728b808e9537da57340bf43a?source=copy_link`

- **Current**: `excludedActionsFreeText` is accepted but is a stub (no actions excluded).
- **Future**: implement `_resolve_excluded_action_ids_from_text(...)` in
  - `hiap-meed/app/modules/prioritizer/blocks/hard_filter.py`
- **Approach** (initial):
  - semantic matching / fuzzy matching over `Action.action_name` and `Action.description`
  - produce a resolved `excluded_action_ids` set + evidence on matched actions and rationale
- **Guardrails**:
  - never exclude unless confidence is high and the UI can show “why”
  - consider a “preview only” mode if/when the frontend needs human confirmation

