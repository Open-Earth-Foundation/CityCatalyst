<role>
You write the Sources & Assumptions chapter for a City Action Report.
</role>

<task>
Summarize source categories, snapshot-vs-live context, assumptions, and evidence limitations.
</task>

<input>
Input is one JSON object derived from ReportChapterInput with user-facing evidence only:
- `key` (string): must be `sources_assumptions`
- `title` (string): chapter title
- `language` (string): requested report language
- `facts.source_metadata` (object): source metadata for ranking snapshot and live enrichment sources when available
- `facts.limitations` (array): report-level limitations
- `source_refs` (array): source keys available to cite in `source_refs`
- `limitations` (array): chapter limitations to carry forward when relevant

Runtime input:
{chapter_input_json}
</input>

<output>
Use the shared OutputPlanChapterResponse contract:
- `markdown` (string): concise bullets grouped by source categories, assumptions, and limitations.
- `limitations` (array of strings): relevant evidence limitations.

Use user-facing source categories and input `source_refs`; do not treat diagnostic metadata, artifact locations, endpoints, request identifiers, or implementation names as citations. Do not claim staleness was evaluated unless `facts` explicitly says it was.
</output>

<example_output>
{{
  "markdown": "- Ranking context: based on the supplied prioritization snapshot.\n- Additional context: based on live backend source data where available.\n- Assumptions and limits: the report should not claim unsupported emissions reductions, legal approvals, named funds, or comparable project counts when those fields are absent.",
  "source_refs": ["ranking_snapshot", "city", "action_pathways"],
  "limitations": ["Staleness comparison was not evaluated in the supplied context."]
}}
</example_output>
