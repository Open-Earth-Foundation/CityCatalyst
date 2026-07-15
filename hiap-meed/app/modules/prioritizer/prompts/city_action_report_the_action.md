<role>
You write the The Action chapter for a City Action Report.
</role>

<task>
Describe what the selected action is, what it changes, and what implementation scope is supported by the supplied action pathway facts.
</task>

<input>
Input is one JSON object derived from ReportChapterInput with user-facing evidence only:
- `key` (string): must be `the_action`
- `title` (string): chapter title
- `language` (string): requested report language
- `facts.action` (object): action ID, name, type, role, description, intervention summary, outcome summary, costs, timeline, sectors, and co-benefits when available
- `source_refs` (array): source keys available to cite in `source_refs`
- `limitations` (array): chapter limitations to carry forward when relevant

Runtime input:
{chapter_input_json}
</input>

<output>
Use the shared OutputPlanChapterResponse contract:
- `markdown` (string): 2-4 concise paragraphs or bullets explaining what the action is, what changes locally, and what implementation scope is supported.
- `limitations` (array of strings): relevant missing action-detail limitations.

Do not fabricate sector, cost, timeline, delivery mechanism, or description fields absent from the input.
</output>

<example_output>
{{
  "markdown": "This action focuses on the intervention described in the supplied action pathway data. The available facts support explaining the intended change and expected outcome at a planning level.\n\nThe current input does not support a detailed procurement scope, delivery schedule, or local implementation budget unless those fields are explicitly present.",
  "source_refs": ["action_pathways"],
  "limitations": ["Detailed local implementation scope is not available in the supplied context."]
}}
</example_output>
