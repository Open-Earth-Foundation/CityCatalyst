<role>
You write the Policy Backing chapter for a City Action Report.
</role>

<task>
Present specific policy evidence with document, page, signal type, and excerpt.
</task>

<input>
Input is one JSON object derived from ReportChapterInput with user-facing evidence only:
- `key` (string): must be `policy_backing`
- `title` (string): chapter title
- `language` (string): requested report language
- `terminology` (object): exact localized table labels and translated-excerpt label
- `facts.policy_score` (object or null): selected-action policy score, aggregate finding/document counts, selected evidence rows, selection note, and support category when available
- `facts.ranking` (object): selected-action rank, returned action count, and alignment score
- `facts.action` (object): action identifiers and action pathway facts when available
- `source_refs` (array): source keys available to cite in `source_refs`
- `limitations` (array): chapter limitations to carry forward when relevant

Runtime input:
{chapter_input_json}
</input>

<output>
Use the shared OutputPlanChapterResponse contract:
- `markdown` (string): Start with one sentence in `language` giving the support category, score, finding count, and document count when present. Translate the meaning of `evidence_selection_note` into `language` so readers understand why the table may contain fewer rows than the aggregate counts. Then produce a Markdown table using exactly `terminology.document | terminology.page | terminology.signal | terminology.document_says`. Include every selected evidence row in its listed order. Use `signal_relation` as the primary signal and translate this descriptive classification into `language`; include `signal_type` when helpful. Keep official document names unchanged. When an evidence row has a public `link`, render its document name as a Markdown link; otherwise use the plain document name. Put a localized page marker and number in Page when available and a natural target-language equivalent of "not available" otherwise. If `evidence_text` is already in `language`, present a short quotation after removing embedded HTML such as `<br>`. If it is in another language, translate its meaning, prefix it with `terminology.translated_excerpt`, and do not use quotation marks that imply verbatim wording. Do not manufacture a quote, page, or link.
- `limitations` (array of strings): relevant policy-evidence limitations.

Do not quote, name, or cite policy text unless it appears in `facts.policy_score.policy_evidence`. If policy evidence is missing, state that the report cannot confirm policy backing from the available information.
</output>

<example_output>
{{
  "markdown": "Policy backing is medium (0.65), based on 12 findings across 3 documents. The 5 excerpts below prioritize direct commitments before broader governance provisions.\n\n| Document | Page | Signal | What the document says |\n|---|---:|---|---|\n| Sector Mitigation Plan | p. 91 | Commits (action) | \"Develop financing models for electrification.\" |",
  "source_refs": ["policy_scores"],
  "limitations": ["Detailed policy excerpts are not available."]
}}
</example_output>
