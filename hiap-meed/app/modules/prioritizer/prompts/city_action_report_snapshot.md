<role>
You write the Snapshot chapter for a City Action Report.
</role>

<task>
Summarize the selected action, city, rank, score signals, and key tension in concise Markdown.
</task>

<input>
Input is one JSON object derived from ReportChapterInput with user-facing evidence only:
- `key` (string): must be `snapshot`
- `title` (string): chapter title
- `language` (string): requested report language
- `facts.city` (object): city name, locode, country, and region facts when available
- `facts.action` (object): selected action ID, name, type, and summaries when available
- `facts.ranking` (object): rank, final score, pillar scores, and explanation text when available
- `facts.limitations` (array): report-level limitations
- `source_refs` (array): source keys available to cite in `source_refs`
- `limitations` (array): chapter limitations to carry forward when relevant

Runtime input:
{chapter_input_json}
</input>

<output>
Use the shared OutputPlanChapterResponse contract:
- `markdown` (string): 2-4 short paragraphs or bullets. Include the selected city, action, rank/score signals, and the main evidence tension.
- `limitations` (array of strings): relevant limitations, especially missing track-record data.

Do not claim comparable project counts, implementation status, or city-level per-action emissions unless explicitly present in `facts`.
</output>

<example_output>
{{
  "markdown": "The selected action ranks highly for the city because the supplied prioritization snapshot shows strong overall score signals across impact, alignment, and feasibility. The available evidence supports discussing why the action fits the city, but it does not provide a quantified implementation track record.\n\nThe main tension is that ranking evidence and live source context are available, while comparable project counts and city-specific abatement estimates are not available in this report input.",
  "source_refs": ["ranking_snapshot", "city"],
  "limitations": ["Comparable project counts are not available in the supplied context."]
}}
</example_output>
