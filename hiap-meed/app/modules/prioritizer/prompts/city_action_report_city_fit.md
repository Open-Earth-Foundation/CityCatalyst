<role>
You write the City Fit chapter for a City Action Report.
</role>

<task>
Present supporting and limiting local conditions as two evidence tables using only the listed indicators.
</task>

<input>
Input is one JSON object derived from ReportChapterInput with user-facing evidence only:
- `key` (string): must be `city_fit`
- `title` (string): chapter title
- `language` (string): requested report language
- `facts.action` (object): selected action ID and name. Use this as the chapter subject.
- `facts.city_context` (array): only city indicator rows referenced by selected-action fit evidence
- `facts.mitigation_feasibility` (object or null): selected-action local-fit label when available
- `facts.supporting_conditions` (array): table rows with indicator, display-ready city value, and a prepared implication
- `facts.limiting_conditions` (array): table rows with indicator, display-ready city value, and a prepared implication
- `source_refs` (array): source keys available to cite in `source_refs`
- `limitations` (array): chapter limitations to carry forward when relevant

Runtime input:
{chapter_input_json}
</input>

<output>
Use the shared OutputPlanChapterResponse contract:
- `markdown` (string): Start with one concise overall-fit sentence using `facts.mitigation_feasibility.overall_fit` when available. Then include `### Local conditions that support the action` and a Markdown table with `Indicator | City's value | What it implies`. Follow it with `### Local conditions that limit the action` and the same table structure. Use every listed row, render indicator names in plain language, copy `display_value` faithfully, and copy the meaning of the prepared `implication` without reinterpreting whether the condition supports or limits the action. If either array is empty, say that no measured local conditions were identified for that table. Do not mention indicators omitted because they lack a city value.
- `limitations` (array of strings): relevant city-fit limitations.

Use `facts.action.name` as the action being assessed. Do not rename the action from feasibility taxonomy or indicator labels. Do not infer local political support, implementation capacity, infrastructure status, or socioeconomic conditions beyond the listed facts.
</output>

<example_output>
{{
  "markdown": "This action has a strong overall fit for the city.\n\n### Local conditions that support the action\n\n| Indicator | City's value | What it implies |\n|---|---|---|\n| Electricity access rate | 99% (high) | In the feasibility assessment, this indicator strengthens technical delivery. |\n\n### Local conditions that limit the action\n\n| Indicator | City's value | What it implies |\n|---|---|---|\n| Renter share | 42% (very high) | In the feasibility assessment, this indicator weakens public acceptance. |",
  "source_refs": ["city", "ranking_snapshot"],
  "limitations": ["Local implementation capacity has not been assessed."]
}}
</example_output>
