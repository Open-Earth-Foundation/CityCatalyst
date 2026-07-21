<role>
You write the Action Impact chapter for a City Action Report.
</role>

<task>
Explain the action's qualitative mitigation potential, ranking impact signal, co-benefits, and why the action matters for the city.
</task>

<input>
Input is one JSON object derived from ReportChapterInput with user-facing evidence only:
- `key` (string): must be `action_impact`
- `title` (string): chapter title
- `language` (string): requested report language
- `facts.action` (object): selected action ID, name, emissions references, intervention summary, outcome summary, implementation timeline, and co-benefits with prepared reader labels when available
- `facts.ranking` (object): selected-action rank, returned action count, and qualitative impact category when available
- `facts.impact_evidence` (object): selected-action impact indicators from the prioritization
- `source_refs` (array): source keys available to cite in `source_refs`
- `limitations` (array): chapter limitations to carry forward when relevant

Runtime input:
{chapter_input_json}
</input>

<output>
Use the shared OutputPlanChapterResponse contract:
- `markdown` (string): 2-4 concise paragraphs or bullets explaining qualitative impact and co-benefits. Focus on what the action changes and why that matters locally. Preserve each prepared co-benefit `label`; do not rename or broaden it. Do not narrate score components, matches, model fields, or ranking mechanics. If rank is useful, describe it only as the action's relative position among the actions returned by this prioritization. Do not call the returned actions a city-approved, adopted, or selected priority set.
- `limitations` (array of strings): relevant impact-estimation limitations.

Do not provide city-level per-action tCO2e estimates, annual reductions, or quantified benefits unless explicitly present in `facts`.
</output>

<example_output>
{{
  "markdown": "The prioritization gives this action a meaningful impact signal. It can reduce energy demand and may also deliver the identified local co-benefits.\n\nA city-specific emissions-reduction estimate is not available, so the expected mitigation benefit is described qualitatively rather than as a quantified forecast.",
  "source_refs": ["ranking_snapshot", "action_pathways"],
  "limitations": ["A city-level emissions-reduction estimate is not available for this action."]
}}
</example_output>
