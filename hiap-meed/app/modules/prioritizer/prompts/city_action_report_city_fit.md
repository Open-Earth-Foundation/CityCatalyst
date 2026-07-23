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
- `terminology` (object): exact localized subsection and table labels
- `facts.action` (object): selected action ID and name. Use this as the chapter subject.
- `facts.city_context` (array): only city indicator rows referenced by selected-action fit evidence
- `facts.mitigation_feasibility` (object or null): selected-action local-fit label when available
- `facts.supporting_conditions` (array, omitted when empty): grouped positive-only indicator rows with display-ready city value and a prepared implication
- `facts.limiting_conditions` (array, omitted when empty): grouped negative-only indicator rows with display-ready city value and a prepared implication
- `facts.mixed_conditions` (array, omitted when empty): grouped indicator rows that have both positive and negative implications
- `source_refs` (array): source keys available to cite in `source_refs`
- `limitations` (array): chapter limitations to carry forward when relevant

Runtime input:
{chapter_input_json}
</input>

<output>
Use the shared OutputPlanChapterResponse contract:
- `markdown` (string): Start with one concise overall-fit sentence using `facts.mitigation_feasibility.overall_fit` when available. Then use `terminology.supporting_heading` and a Markdown table with `terminology.indicator | terminology.city_value | terminology.implication`. Follow it with `terminology.limiting_heading` and the same table structure. If `facts.mixed_conditions` is present, add `terminology.mixed_heading` and the same table structure; omit the mixed heading and table entirely when that field is absent. Copy these backend-localized headings, table labels, and prepared indicator names exactly. Use every listed row, copy `display_value` faithfully, and translate the meaning of each prepared `implication` into `language` without reinterpreting whether the condition supports, limits, or has mixed effects on the action. If either the supporting or limiting field is absent, say in `language` that no measured local conditions were identified for that table. Do not mention indicators omitted because they lack a city value or a non-neutral contribution.
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
