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
- `facts.financial_feasibility` (object or null): selected-action finance score, route, reason, sector, and comparable-project count when available
- `facts.legal` (object or null): reader-ready delivery position, additional-approval position, and unresolved legal checks when available
- `facts.action` (object): selected action facts when available
- `facts.opportunities` (array): current programme, funder, instrument, status, amount note, city application route, and public source URL
- `facts.opportunities_to_monitor` (array): closed but recurring programmes, including status date and recurrence when available
- `facts.comparable_projects` (array): action-matched project, jurisdiction, lifecycle stage, and prepared funding summary
- `source_refs` (array): source keys available to cite in `source_refs`
- `limitations` (array): chapter limitations to carry forward when relevant

Runtime input:
{chapter_input_json}
</input>

<output>
Use the shared OutputPlanChapterResponse contract:
- `markdown` (string): Start with a concise funding-outlook paragraph grounded only in `financial_feasibility.route` and `financial_feasibility.reason`. Explain in reader-facing language that current terms and eligibility for this action still need confirmation. Add `### Financing opportunities to assess` with a Markdown table `Opportunity | Funder | Support | Status | How the city could engage | Link`; use `instrument` and `amount_note` for Support, `city_application` for how the city could engage, and Markdown links only from each row's `source_url`. Do not call an opportunity a match or confirmed funding route. When `opportunities_to_monitor` is non-empty, add `### Opportunities to monitor` with `Opportunity | Funder | Last recorded status | Recurrence | Link`. Clearly say these programmes are not currently available; include `status_as_of` in the status cell when available. Omit this subsection when there are no monitoring rows. Add `### Comparable projects` with `Project | Location | Stage | Funding`, copying each prepared `funding_summary`. Introduce them as examples of similar investments in other locations, without saying they were screened, supplied, or reviewed as templates. You may lightly correct grammar in translated project names while preserving their meaning and location. Then add `### Suggested pathway` with 2-4 practical numbered steps based only on finance and legal facts. Use `legal.delivery_position` and `legal.additional_approval` as written. When `legal.unresolved_checks` is non-empty, include those checks as a preparation step; do not call for generic legal confirmation when `additional_approval` says no further decision-making approval was identified. State the basis for a step as a report conclusion, never as `the evidence says`. If current opportunities or comparable projects are empty, state the relevant data gap under its heading instead of inventing rows.
- `limitations` (array of strings): relevant finance and precedent-data limitations.

Do not imply that a listed opportunity is awarded, action-specific, or definitely eligible beyond its status and city-application fields. Never describe an opportunity in `opportunities_to_monitor` as currently open or available. Do not invent named funds, links, budgets, projects, locations, procurement steps, or project outcomes.
</output>

<example_output>
{{
  "markdown": "The finance assessment indicates that technical assistance is the main need. The opportunities below are candidates to assess; eligibility for this action still needs confirmation.\n\n### Financing opportunities to assess\n\n| Opportunity | Funder | Support | Status | How the city could engage | Link |\n|---|---|---|---|---|---|\n| Municipal energy assistance | Energy agency | Technical assistance | Ongoing | Apply directly | [Programme page](https://example.org/programme) |\n\n### Comparable projects\n\n| Project | Location | Stage | Funding |\n|---|---|---|---|\n| Public-lighting efficiency upgrade | Santa Cruz | In execution | Public investment |\n\n### Suggested pathway\n\n1. Confirm the technical-assistance scope.\n2. Check the candidate programme's current terms and action eligibility.\n3. Prepare the municipally led delivery package.",
  "source_refs": ["financial_feasibility", "legal"],
  "limitations": ["Comparable project and track-record information is not available."]
}}
</example_output>
