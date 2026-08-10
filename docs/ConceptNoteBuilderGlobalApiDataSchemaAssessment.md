# Current CNB Schema vs. Current Global API

This is a field-level comparison of the CNB reference schema implemented in this
PR and the live Global API on 10 August 2026. The draft files in
`global-api/mock/cnb` are not counted as current API coverage.

| Data | Current CNB schema | Current Global API | Match |
| --- | --- | --- | --- |
| Funder | `funders { funder_id, name, funder_type, country, region }` | Opportunities have `funder_name`; rich projects have `funder_id: "world_bank"` and `funder_name: "World Bank"` | Enough for V1; IDs can be aligned later |
| Funder profile | `funders.profile { stated, derived }` | No funder profile | Missing |
| Opportunity | `funding_records { name, finance_route, instrument_type, region_scope, status, summary }` | Example: `{ "opportunity_name": "FPA 2026 - Proyectos Sustentables Ciudadanos", "instrument": "grant", "status": "closed" }` | Basic catalogue matches |
| Description | `funding_records.summary` | Only `notes`; populated in 44 of 99 current Chile records | Partial |
| Eligibility | `applicant_type` plus individual `funder_criteria` | `eligible_actor`, `eligible_actor_detail`, `city_application`, `access_tier` | Basic eligibility only |
| Application template | `funder_templates { template_name, output_format, chapter_schema, required_fields }` | No equivalent fields | Missing |
| Section descriptions | Example: `{ "title": "Project Abstract", "description": "...", "required": true }` | No chapters or application-question collection | Missing |
| Documents applicant must submit | Can be stored as template requirements or criteria | No required-document or attachment collection | Missing |
| Criteria/rubric | `funder_criteria { criterion_type, label, requirement_text, weight, hard_gate, normalized_rule }` | No criteria or rubric collection | Missing |
| Award amounts | `min_award`, `max_award`, `award_amount`, `currency` | `amount`, `amount_currency`, `amount_note`; only 8 of 99 records have an amount and none currently have currency | Partial |
| Main source | One typed `source_documents` row | `source_url` exists for all 99 Chile opportunities | Matches |
| Additional documents | Any number of `source_documents { source_type, url, title, license_status, content_hash }` | One `legal_basis_url`, populated in 7 of 99 opportunities | Partial |
| Field evidence | `funding_record_evidence { claim, quote_or_summary, source_map }` | No opportunity claim-to-source mapping | Missing |
| Funded project | One `funding_records` row with summary, interventions, award, and tags | Rich `/api/v1/projects` records contain summary, financing, interventions, risks, and evidence anchors | Strong schema match; current Chile coverage is narrow |
| Broad project data | Same reviewed funded-project shape | `/api/v1/climate-finance/projects` contains 11,511 Chile projects, but with thinner descriptions | Broad but partial |
| Project to funder | Reviewed `funder_id` on the funded-project record | Rich projects have `funder_id`; climate-finance projects have `funding_sources` | Usable |
| Project to opportunity | Not required by current CNB matching | `source_opportunity_id` exists inside `funding_sources`, but is null in all 11,511 current Chile records | Not available, but not a V1 blocker |
| Gaps/conflicts | `known_gaps` and reviewed research gaps/conflicts | No equivalent fields | Missing |

## Current shapes

Current CNB logical shape:

```json
{
  "funder": {"name": "Example Funder", "profile": {"stated": {}, "derived": {}}},
  "opportunity": {"is_opportunity": true, "name": "Example Programme", "summary": "..."},
  "template": {"template_name": "Application form", "chapter_schema": [], "required_fields": []},
  "criteria": [{"criterion_type": "eligibility", "requirement_text": "...", "hard_gate": true}],
  "source_documents": [{"source_type": "funder-rfp", "url": "https://example.org/rfp.pdf"}]
}
```

Current live [Global API opportunity](https://ccglobal.openearth.dev/api/v1/climate-finance/opportunities?country_code=CL&limit=100&offset=0):

```json
{
  "opportunity_name": "FPA 2026 - Proyectos Sustentables Ciudadanos",
  "funder_name": "Ministerio del Medio Ambiente (Chile)",
  "instrument": "grant",
  "eligible_actor": ["community_org"],
  "amount": 6000000,
  "amount_currency": null,
  "source_url": "https://fondos.mma.gob.cl/fpa-2026-proyectos-sustentables-ciudadanos/",
  "legal_basis_url": "https://fondos.mma.gob.cl/wp-content/uploads/2025/08/Resolucion-Exenta-5796-Aprueba-Bases-FPA-2026-Proyectos-Sustentables-Ciudadanos.pdf"
}
```

Current live [rich Global API project](https://ccglobal.openearth.dev/api/v1/projects?country_code=CL&limit=200&offset=0):

```json
{
  "project_id": "3506946b-689b-2986-e9c3-3b8d65b86abf",
  "project_title": "Chile's Water Transition",
  "funder_id": "world_bank",
  "funder_name": "World Bank",
  "total_budget_amount_usd": 250000000,
  "financing_instrument": "senior_loan",
  "project_summary_text": "The project strengthens water-resource management and water-related services.",
  "evidence_anchors": [{"field": "totalBudgetUsd", "pageOrSection": "Page 2"}]
}
```

## Conclusion

The current Global API already covers funder names, the opportunity catalogue,
basic eligibility, source links, and useful project data. To replace the CNB
reference database, Global API still needs application templates, required
documents, criteria/rubrics, multiple typed source documents, field-level
opportunity evidence, and explicit gaps/conflicts.
