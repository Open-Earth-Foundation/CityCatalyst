# Prompt Composition Suggestion

## Goal

Load the agent with one final assembled prompt that contains the specialized behavior for the active task without repeating shared identity, shared rules, or shared schema blocks.

Current PR `#2734` moves toward modular prompts with:

- `prompts/core.md`
- `prompts/chat.md`
- `prompts/stationary_energy_review.md`

But the current implementation still composes by concatenating two full prompts:

```text
core prompt
+ workflow prompt inside <additional_instructions>
```

That means the final prompt still duplicates:

- `<role>`
- `<task>`
- `<input>`
- `<output>`

This works, but it makes prompt ownership blurry and increases drift risk.

## Problem With The Current PR Shape

The current PR effectively creates a prompt like:

```xml
<role>shared role</role>
<task>shared task</task>
<input>shared input</input>
<output>shared output</output>

<additional_instructions>
  <role>workflow role</role>
  <task>workflow task</task>
  <input>workflow input</input>
  <routing>workflow routing</routing>
  <tools>workflow tools</tools>
  <output>workflow output</output>
</additional_instructions>
```

Main downsides:

- Clima identity is declared more than once.
- Shared and specialized task instructions are split across parallel blocks.
- Input and output contracts are repeated instead of extended.
- Specialized prompts have to restate shared behavior because they have no smaller insertion point.

## Suggested Direction

The better model is:

- one canonical outer prompt
- specialized prompt files provide fragments, not full prompts
- runtime assembles one final prompt from shared and workflow-specific pieces

Explicit warning:

- this design trades prompt duplication for assembler complexity

That trade can still be worth making, but only if the final assembled prompt
remains easy to inspect and the assembly logic stays simple, predictable, and
well tested.

In other words:

```text
one prompt shell
+ specialized inserts
= one final prompt
```

## Recommended Structure

`core.md` should own the main schema and shared behavior.

Suggested shape:

```xml
<role>
You are Clima, the CityCatalyst climate assistant.
<specialization>
{{ specialization }}
</specialization>
</role>

<task>
<shared>
Shared behavior across all workflows.
</shared>
<workflow>
{{ workflow_task }}
</workflow>
</task>

<input>
<shared>
Shared runtime context contract.
</shared>
<workflow>
{{ workflow_input }}
</workflow>
</input>

<routing>
{{ workflow_routing }}
</routing>

<tools>
{{ workflow_tools }}
</tools>

<output>
<shared>
Shared output rules.
</shared>
<workflow>
{{ workflow_output }}
</workflow>
</output>
```

This keeps:

- one top-level identity
- one top-level shared task contract
- one top-level shared output contract
- only the specialized pieces swapped in and out

## Example Workflow Fragments

For general chat, the workflow-specific data could be:

```text
specialization:
General CityCatalyst climate and inventory chat.

workflow_task:
Answer general climate, emissions, inventory, and CityCatalyst workflow questions.

workflow_input:
- user_message
- conversation_history

workflow_routing:
- Use inventory_list_accessible first ...
- Use inventory_status_overview after inventory selection ...

workflow_tools:
- default chat tool policy

workflow_output:
- return plain text or tool invocation
- summarize inventory status and emissions context
```

For Stationary Energy review, the workflow-specific data could be:

```text
specialization:
Active GPC Stationary Energy draft review.

workflow_task:
Help the user inspect, stage, confirm, roll back, and save draft-review choices.

workflow_input:
- user_message
- conversation_history
- STATIONARY_ENERGY_DRAFT_CONTEXT_JSON

workflow_routing:
- inspect / explain
- stage one
- request bulk confirmation
- apply confirmed rollback
- save

workflow_tools:
- stationary energy review tool policy

workflow_output:
- return plain text or tool invocation
- summarize staged choices and blockers clearly
```

## Tool Description Strategy

Tool descriptions should follow the same composition rule as the rest of the
prompt:

- define reusable shared tool fragments once
- define workflow-specific tool fragments separately
- assemble only the tool descriptions for tools that are actually registered on
  the current agent instance

This is important:

> Only document tools in the prompt that are actually registered for that agent instance.

The prompt should never describe:

- tools that are unavailable in the current workflow
- tools that are globally defined in the repo but not mounted for this run
- tools that are planned for future use but not currently active

That keeps prompt instructions aligned with runtime reality.

## Recommended Tools Structure

The final prompt should still have one `<tools>` section, but that section can
be assembled from smaller reusable pieces.

Suggested shape:

```xml
<tools>
<shared_tools>
{{ shared_tools }}
</shared_tools>

<workflow_tools>
{{ workflow_tools }}
</workflow_tools>
</tools>
```

Where:

- `shared_tools` = tools that may be reused across workflows
- `workflow_tools` = tools specific to the active task

The important rule is that both sections are filtered by the runtime tool pack.

If a shared tool is not actually registered on the current agent, it must not
appear in the final assembled prompt.

## Recommended Tool Fragment Layout

Instead of duplicating tool descriptions across prompt files, keep tool
documentation in reusable fragments, for example:

```text
prompts/
  core.md
  fragments/
    tools/
      shared/
        climate_vector_search.md
        inventory_readonly.md
      workflows/
        chat.md
        stationary_energy_review.md
```

Possible meaning:

- `shared/climate_vector_search.md`
  - description and rules for `climate_vector_search`
- `shared/inventory_readonly.md`
  - shared inventory lookup/read-only tool rules when those tools are mounted
- `workflows/chat.md`
  - general-chat-only tool behavior
- `workflows/stationary_energy_review.md`
  - Stationary Energy review-only tool behavior

## Assembly Rule For Tools

The assembler should build the `<tools>` section from the actual runtime tool
set, not from static workflow assumptions.

Conceptually:

```python
runtime_tools = get_registered_tools_for_agent(...)

shared_tool_fragments = load_shared_tool_fragments(runtime_tools)
workflow_tool_fragments = load_workflow_tool_fragments(
    workflow=active_workflow,
    runtime_tools=runtime_tools,
)

tools_block = render_tools_block(
    shared_tools=shared_tool_fragments,
    workflow_tools=workflow_tool_fragments,
)
```

This means:

- if `climate_vector_search` is mounted, include its description
- if `inventory_status_overview` is mounted, include its description
- if `stationary_energy_accept_one` is mounted, include its description
- if a tool is not mounted, omit it entirely from the prompt

## How Specialized Prompts Refer To Shared Tools

A specialized workflow should not duplicate core tool descriptions.

Instead, it should rely on the prompt assembler to inject the shared tool
fragments that match the runtime tool pack.

For example:

- general chat may receive:
  - shared tool fragments for `climate_vector_search`
  - shared inventory tool fragments
  - chat-specific tool routing fragments
- Stationary Energy review may receive:
  - shared tool fragments for any core tools that are truly mounted there
  - review-specific tool fragments for staging, confirmation, rollback, and
    save actions

If Stationary Energy review does not mount a shared tool, that shared tool
should not be described in the prompt, even if it exists elsewhere in the
system.

## Practical Rule

Shared tools should be treated as:

- reusable documentation fragments
- not automatically included documentation

In other words:

- a tool being "core" in the codebase does not mean it belongs in every prompt
- a tool belongs in the final prompt only if it is active in the current agent

That keeps the final prompt honest and avoids teaching the model about actions
it cannot actually call.

## Why This Is Better

This approach:

- avoids repeating "You are Clima" in multiple prompt files
- separates shared behavior from workflow behavior more clearly
- makes specialized prompts smaller and easier to maintain
- reduces prompt drift between workflows
- keeps tool descriptions aligned with the actual mounted runtime tool pack
- supports swapping task-specific pieces in and out without duplicating the shell
- reduces ambiguity for the LLM by giving it one canonical final prompt instead
  of multiple overlapping role/task blocks

## Risks And Guardrails

This design should not be treated as a free simplification. It removes prompt
duplication, but it introduces an assembler that becomes a new critical part of
the system.

Main risk:

- prompt duplication goes down
- assembly complexity goes up

To keep the new design better than the current PR shape, the system should
follow these guardrails:

- the final assembled prompt must remain easy to print, snapshot, inspect, and
  review as one artifact
- runtime tool registration must be the source of truth for which tool
  descriptions appear in the prompt
- shared prompt fragments should define defaults, while workflow fragments
  should only specialize or narrow behavior rather than redefine shared identity
- the assembly logic should stay simple enough that a developer can understand
  the final prompt shape without tracing many layers of indirection

## Testing And Inspection

MLflow inspection is useful, but it should be treated as runtime observability,
not as the only validation mechanism.

MLflow can help answer questions like:

- what final prompt was actually sent in a real run
- what tools were mounted for that run
- whether the final prompt and runtime tool pack matched

That is valuable for debugging and production inspection.

However, build-time or test-time checks are still needed so prompt assembly
problems are caught before runtime.

Recommended checks:

- snapshot the final assembled prompt per workflow
- verify every documented tool is actually mounted on that agent instance
- verify every mounted tool that needs model guidance is documented in the final
  assembled prompt
- verify the assembled prompt can be printed and reviewed as one artifact during
  local development and tests

In short:

- MLflow helps inspect what happened
- prompt snapshot and assembly checks help prevent incorrect prompt assembly

Both are useful, but they serve different purposes.

## Suggested Implementation Approach

Instead of composing two complete prompts, assemble one final prompt from fragments.

Possible direction:

1. Keep `core.md` as the only full prompt shell.
2. Convert `chat.md` and `stationary_energy_review.md` into fragment-oriented files or data structures.
3. Replace `compose_prompt()` string concatenation with slot-based assembly.

Conceptually:

```python
assemble_prompt(
    core=load_core_template(),
    specialization=load_fragment(workflow, "specialization"),
    workflow_task=load_fragment(workflow, "task"),
    workflow_input=load_fragment(workflow, "input"),
    workflow_routing=load_fragment(workflow, "routing"),
    workflow_tools=load_fragment(workflow, "tools"),
    workflow_output=load_fragment(workflow, "output"),
)
```

## Minimal Transitional Option

If a full fragment system feels too large right now, a smaller step would still help:

- keep `core.md` as the shared owner of `<role>`
- remove `<role>` from specialized prompt files
- treat specialized files as inserts for:
  - routing
  - tools
  - workflow-specific task additions
  - workflow-specific output rules

This would already reduce duplication significantly while keeping the current prompt system conceptually similar.

## Recommendation

Preferred end state:

- agent receives one final prompt
- prompt contains shared Clima identity once
- specialized workflow behavior is inserted into defined slots
- specialized prompt files are modular fragments, not complete prompts
- final prompt is easy to inspect as a single canonical artifact

That best matches the desired outcome:

> load the agent with 1 prompt that contains the pieces of the specialized action we want to perform without doubling things

And it also supports the broader design goal:

> make the prompt less ambiguous for the LLM or agent by avoiding multiple
> overlapping role definitions and instead providing one canonical final prompt
