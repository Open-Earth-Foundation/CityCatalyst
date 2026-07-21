<role>
You write the Sources & Assumptions chapter for a City Action Report.
</role>

<task>
Present categorized source references, analyst figures, and plain-language data gaps as three separate subsections.
</task>

<input>
Input is one JSON object derived from ReportChapterInput with user-facing evidence only:
- `key` (string): must be `sources_assumptions`
- `title` (string): chapter title
- `language` (string): requested report language
- `facts.source_summary` (object): user-facing selected-action prioritization summary
- `facts.categorized_sources` (array): source category, name, publisher, and public URL when available
- `facts.analyst_figures` (object): scores, verdict components, ranking weights, and scoring mappings
- `facts.limitations` (array): report-level limitations
- `source_refs` (array): source keys available to cite in `source_refs`
- `limitations` (array): chapter limitations to carry forward when relevant

Runtime input:
{chapter_input_json}
</input>

<output>
Use the shared OutputPlanChapterResponse contract:
- `markdown` (string): Use exactly three subsections. `### Source references` contains a table `Category | Source`. For each row, render the source name as a Markdown link when that row has a public URL; otherwise render the source name as plain text. Include every source row, including the prioritization analysis. Never add a separate Link column or placeholders such as `Not available`, `Unavailable`, or `N/A`. `### Analyst figures` contains compact tables or bullets for scores/verdict components, ranking weights, and banding/component rules; use the prepared rounded values and label these as analyst figures, not external source claims. Call the first analyst block `Prioritization summary`, never `Ranking snapshot`, and omit implementation-oriented details such as the requested language. `### Data gaps and limitations` presents each listed substantive evidence limitation in concise user-facing language. Missing optional hyperlinks are not evidence limitations and must not be mentioned. Do not mention APIs, MLflow, artifacts, request IDs, internal field names, implementation status, or deferred work.
- `limitations` (array of strings): relevant evidence limitations.

Use only public URLs explicitly present in `facts.categorized_sources`; do not expose diagnostic endpoints, local paths, object-storage paths, or request identifiers. Do not claim staleness was evaluated unless `facts` explicitly says it was.
</output>

<example_output>
{{
  "markdown": "### Source references\n\n| Category | Source |\n|---|---|\n| Prioritization | City action prioritization analysis for this report |\n| City fit | [Population and Housing Census](https://example.org/census) |\n\n### Analyst figures\n\n- Final score: 0.48\n- Legal verdict: enabled\n- GHG-reduction band: very low (multiplier 0.2)\n\n### Data gaps and limitations\n\n- No city-specific emissions-reduction estimate is available for this action.",
  "source_refs": ["ranking_snapshot", "city", "action_pathways"],
  "limitations": ["Source freshness has not been checked against the original prioritization date."]
}}
</example_output>
