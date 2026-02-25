---
name: prompt-schema-authoring
description: Create or update agent system prompts using the required `<role>`, `<task>`, `<input>`, and `<output>` structure with explicit, model-aligned field contracts. Use when editing prompts for LLM extraction, interpretation, or agents (e.g. app/src/backend/InventoryExtractionService.ts, app/prompts/*).
---

# prompt-schema-authoring

Use this skill to keep prompts explicit, contract-driven, and context-efficient.

## Workflow

1. Identify the runtime contract before editing the prompt.
   - Open the target prompt (e.g. in `InventoryExtractionService.ts` or `*/prompts/`).
   - Open the corresponding schema/types (e.g. `ExtractedRow`, Zod schema, or backend model).

2. Write prompt sections in this order.
   - `<role>`
   - `<task>`
   - `<input>`
   - `<output>`
   - Add `<example_output>` whenever possible.

3. Define `<input>` from real runtime payload only.
   - List only fields actually passed in code.
   - Add type and short purpose for each field.
   - Exclude context-junk/internal fields unless the model truly needs them.

4. Define `<output>` from model contract only.
   - State format explicitly: JSON array or JSON object as expected by the backend.
   - Enumerate required and optional fields exactly as expected by the schema.
   - Explain field behavior clearly (e.g. use null for missing; never "-" or "N/A").
   - Exclude internal/auto fields that should not come from the LLM.

5. Add one valid `<example_output>` that conforms to the schema.

6. Keep contracts aligned end-to-end.
   - If you change prompt output fields, update types, parsing, and tests in the same change.

## Required Prompt Rules

- Keep instructions explicit and operational.
- Keep output contract field-by-field and typed.
- Avoid asking for wrappers/status/error fields unless the model requires them.
- Avoid asking for timestamps from the LLM.
- Avoid meta phrasing that conflicts with downstream parsing.

## Prompt Skeleton

```md
<role>
...
</role>

<task>
...
</task>

<input>
Input is the document text (string): ...
</input>

<output>
You must return a JSON array of objects. Each object must match the following contract:
- field_name (type): purpose
</output>

<example_output>
[
  { "field_name": "..." }
]
</example_output>
```

## References

- Source: [Open-Earth-Foundation/Query_mechanism_urbind – prompt-schema-authoring](https://github.com/Open-Earth-Foundation/Query_mechanism_urbind/blob/main/.cursor/skills/prompt-schema-authoring/SKILL.md)
