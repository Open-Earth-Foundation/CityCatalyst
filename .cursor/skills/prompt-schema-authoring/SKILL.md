---
name: prompt-schema-authoring
description: Create or update runtime LLM prompts and reusable prompt fragments, keeping their structure and field contracts aligned with the calling code and consuming models.
---

# prompt-schema-authoring

Use this skill to keep prompts explicit, contract-driven, and context-efficient.

## Full prompts and include fragments

Identify how the prompt is loaded before choosing its structure. Full prompt entries configured in `llm_config.yaml` require the schema below. Reusable include fragments, such as `climate-advisor/prompts/tools/*.md`, may contain only focused tool policy or argument-contract text; do not add standalone role/task/input/output blocks or examples unless the fragment becomes a directly configured full prompt.

Runtime prompt text is application data for the coding agent, not a replacement for contribution instructions. Follow the relevant package `AGENTS.md` when editing it.

## Workflow

1. Identify the runtime contract before editing the prompt.

- Open the target prompt in `*/prompts/`.
- Open the corresponding model in `app/modules/*/models.py` or any other schema we are using for the LLM input/output definitions

2. For a full prompt, write sections in this order. For an include fragment, keep only its focused contract.

- `<role>`
- `<task>`
- `<input>`
- `<tools>` (optional but preferred when tools are available)
- `<output>`
- Add `<example_output>` when it usefully clarifies the full prompt's contract.

3. Define `<input>` from real runtime payload only.

- List only fields actually passed in code.
- Add type and short purpose for each field.
- Exclude context-junk/internal fields unless the model truly needs them (for example `path`, `chunk_index`, `chunk_count`).

4. Define `<tools>` when tool selection/policy exists.

- Add `<tools>` for full tool-capable prompts; keep include fragments focused as described above.
- List each tool and when to use it.
- List when not to use it.
- Keep user-facing formatting rules in `<output>`, not `<tools>`.
- Keep exact argument schemas in one place: `<output>`. In `<tools>`, focus on usage policy.

5. Define `<output>` from model contract only.

- State tool invocation requirements explicitly:
  - pass a JSON object or JSON list depending on the tool definition
  - return only the desired output
- Enumerate required and optional fields exactly as expected by the model.
- Explain field behavior clearly.
- Exclude internal/auto fields that should not come from the LLM (for example `created_at`).

6. For a full prompt, add one valid `<example_output>` when it clarifies the contract or corrects a demonstrated failure. Do not duplicate large schemas or obvious examples solely to fill a section.

7. Keep contracts aligned end-to-end.

- If you change prompt output fields, update models, coercion/parsing, runtime logic, and tests in the same change.

## Required Prompt Rules

- Keep instructions explicit and operational.
- Keep output contract field-by-field and typed.
- Keep required full-prompt blocks: `<role>`, `<task>`, `<input>`, `<output>`. Apply the include-fragment exception above.
- Add `<tools>` for full tool-capable prompts, and use it for tool usage policy.
- Avoid asking for wrappers/status/error fields unless the model requires them.
- Avoid asking for timestamps from the LLM.
- Avoid meta phrasing requirements that conflict with downstream synthesis.

## Prompt Skeleton

```md
<role>
...
</role>

<task>
...
</task>

<input>
Input is a JSON object with:
- `field_name` (type): purpose
</input>

<tools>
Available tools:
- `tool_name`: when to use, when not to use.
</tools>

<output>
You must call tool `tool_name` and pass a JSON object (not a JSON string).
Return only that tool call.

The tool argument must match `ModelName`:

- `field_name` (...)
  </output>

<example_output>
{
"field_name": "..."
}
</example_output>
```
