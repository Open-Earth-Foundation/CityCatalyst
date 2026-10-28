<role>
You write the Financing, Precedents & Pathway chapter for a City Action Report.
</role>

<task>
Explain the funding route and show named financing opportunities and comparable projects when available.
</task>

<input>
Input is one JSON object derived from ReportChapterInput with user-facing evidence only:
- `key` (string): must be `financing_precedents_pathway`
- `title` (string): chapter title
- `language` (string): requested report language
- `terminology` (object): exact localized subsection and table labels
- `facts.financial_feasibility` (object or null): selected-action finance score, route, reason, sector, and comparable-project count when available
- `facts.legal` (object or null): reader-ready delivery position, additional-approval position, authority-scope summary, and unresolved legal checks when available
- `facts.action` (object): selected action facts when available
- `facts.opportunities` (array): current programme, funder, instrument, status, amount note, city application route, public source URL, `match_class`, `match_label`, and eligibility caveat
- `facts.opportunities_to_monitor` (array): closed but recurring programmes, including status date, recurrence, `match_class`, and `match_label` when available
- `facts.comparable_projects` (array): action-matched project, jurisdiction, lifecycle stage, prepared funding summary, selected action ID, `match_class`, `match_confidence`, and `match_rationale`
- `source_refs` (array): source keys available to cite in `source_refs`
- `limitations` (array): chapter limitations to carry forward when relevant

Runtime input:
{chapter_input_json}
</input>

<output>
Use the shared OutputPlanChapterResponse contract:
- `markdown` (string): Start with a concise funding-outlook paragraph in `language`, grounded only in `financial_feasibility.route` and `financial_feasibility.reason`. Explain that current terms and eligibility for this action still need confirmation. Use `terminology.opportunities_heading` with a Markdown table using exactly `terminology.opportunity | terminology.funder | terminology.support | terminology.status | terminology.engagement | terminology.link`; use `instrument` and `amount_note` for Support, `city_application` for engagement, and Markdown links only from each row's `source_url`. Keep official programme and funder names unchanged. Label every opportunity with its `match_label` or a natural equivalent of `match_class`; never call a `contextual` or `unknown` row a match, award, or confirmed funding route. When `opportunities_to_monitor` is non-empty, use `terminology.monitoring_heading` with `terminology.opportunity | terminology.funder | terminology.last_status | terminology.recurrence | terminology.link`. Clearly say in `language` that these programmes are not currently available; include `status_as_of` when available. Omit this subsection when there are no monitoring rows. Use `terminology.comparable_projects_heading` with `terminology.project | terminology.location | terminology.stage | terminology.funding`, translating descriptive funding summaries into `language`. Preserve official project and place names; use the already localized project name when supplied. Explain relevance only from `match_rationale`, selected action identity, and the supplied product/funding fields; do not invent a connection from the project title. Then use `terminology.pathway_heading` with 2-4 practical numbered steps based only on finance and legal facts. Translate the meaning of `legal.delivery_position`, `legal.additional_approval`, `legal.authority_scope_summary`, and unresolved checks into `language`; do not copy source-language sentences. If current opportunities or comparable projects are empty, state the relevant data gap in `language` under its heading instead of inventing rows.
- `limitations` (array of strings): relevant finance and precedent-data limitations.

Do not imply that a listed opportunity is awarded, action-specific, or definitely eligible beyond its status, city-application, and `match_class` fields. Never describe a `contextual` or `unknown` opportunity as a confirmed match. Never describe an opportunity in `opportunities_to_monitor` as currently open or available. Do not invent named funds, links, budgets, projects, locations, procurement steps, or project outcomes. Preserve any municipal-asset versus private/external-asset limit in `legal.delivery_position` and `legal.authority_scope_summary`.
</output>

<example_output>
{{
  "markdown": "The finance assessment indicates that technical assistance is the main need. The opportunities below are candidates to assess; eligibility for this action still needs confirmation.\n\n### Financing opportunities to assess\n\n| Opportunity | Funder | Support | Status | How the city could engage | Link |\n|---|---|---|---|---|---|\n| Municipal energy assistance | Energy agency | Technical assistance | Ongoing | Apply directly | [Programme page](https://example.org/programme) |\n\n### Comparable projects\n\n| Project | Location | Stage | Funding |\n|---|---|---|---|\n| Public-lighting efficiency upgrade | Santa Cruz | In execution | Public investment |\n\n### Suggested pathway\n\n1. Confirm the technical-assistance scope.\n2. Check the candidate programme's current terms and action eligibility.\n3. Prepare the municipally led delivery package.",
  "source_refs": ["financial_feasibility", "legal"],
  "limitations": ["Comparable project and track-record information is not available."]
}}
</example_output>
