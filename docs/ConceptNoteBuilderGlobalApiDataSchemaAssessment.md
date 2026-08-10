# Concept Note Builder Reference Data and the Existing Global API

## Purpose

This document assesses whether the existing Global API data model can replace
the separate Concept Note Builder (CNB) funding-reference database proposed in
this pull request.

The deciding question is not whether identifiers can be added or converted.
The deciding question is whether the existing data model can represent all of
the application knowledge CNB needs:

- funders and their profiles;
- funding opportunities and programme descriptions;
- application templates and required sections;
- eligibility, evaluation, application, and award criteria;
- documents the applicant must submit;
- official source documents and field-level evidence;
- funded projects and their award details; and
- the relationship between projects, funders, and opportunities when known.

The assessment compares three concrete shapes:

1. the CNB reference tables implemented in this pull request;
2. the live Global API responses available on 10 August 2026; and
3. the proposed CNB Global API examples already included under
   [`global-api/mock/cnb`](../global-api/mock/cnb/README.md).

## Conclusion

The existing Global API is a suitable home for CNB reference data, but the live
schema cannot replace the CNB reference database without an opportunity-detail
extension.

The current Global API is split across three useful but incomplete surfaces:

- `/api/v1/climate-finance/opportunities` has broad opportunity catalogue and
  eligibility data, but no template, required-document, rubric, or structured
  evidence collections.
- `/api/v1/climate-finance/projects` has broad Chilean precedent coverage, but
  relatively thin project descriptions.
- `/api/v1/projects` has rich project summaries, financing structures,
  interventions, and evidence anchors, but much narrower Chilean coverage.

The main gap is therefore not IDs. `funder_name` is enough to select and display
a funder in the first release, and the richer project API already includes a
string `funder_id`, such as `world_bank`. The blocking gap is the inability to
store and return the full application package for an opportunity.

The recommended direction is:

- keep CNB run, context, chapter, gap, and export state in the Climate Advisor
  workflow database;
- make Global API the source of truth for funders, opportunities, funded
  projects, templates, criteria, required documents, and reference evidence;
- complete the proposed Global API CNB extension before removing the CNB
  reference tables; and
- access Global data through a typed API client rather than a cross-database
  foreign key.

## Sources and Snapshot

This assessment uses:

- the live [Chile funding-opportunities endpoint](https://ccglobal.openearth.dev/api/v1/climate-finance/opportunities?country_code=CL&limit=100&offset=0);
- the live [Chile climate-finance projects endpoint](https://ccglobal.openearth.dev/api/v1/climate-finance/projects?country_code=CL&limit=500&offset=0);
- the live [rich Chile project-summary endpoint](https://ccglobal.openearth.dev/api/v1/projects?country_code=CL&limit=200&offset=0);
- the implemented CNB SQLAlchemy models in
  [`cnb_reference.py`](../climate-advisor/service/app/models/db/cnb_reference.py);
- the Global API opportunity and project migrations in
  [`9f3c1a7b2e10_create_finance_opportunity_table.py`](../global-api/migrations/versions/9f3c1a7b2e10_create_finance_opportunity_table.py),
  [`a4f1c9d72b3e_create_finance_project_table.py`](../global-api/migrations/versions/a4f1c9d72b3e_create_finance_project_table.py),
  and
  [`5f3e9f2b1c7d_create_modelled_project_catalog_table.py`](../global-api/migrations/versions/5f3e9f2b1c7d_create_modelled_project_catalog_table.py);
  and
- the proposed examples in [`global-api/mock/cnb`](../global-api/mock/cnb/README.md).

Live-data counts are a snapshot from 10 August 2026 and may change as new
dataset releases are published.

## What the Implemented CNB Reference Schema Can Store

The reference schema implemented in this pull request can store the complete
reviewed CNB research result across six logical areas.

| Current CNB table | Information represented |
| --- | --- |
| `funders` | Funder name, type, country, region, and flexible stated/derived profile |
| `funding_records` | Opportunities and funded projects, distinguished by `is_opportunity`; descriptions, geography, instruments, award values, tags, and known gaps |
| `funder_templates` | Template name, output format, ordered chapter schema, chapter descriptions and requirements, and required fields |
| `funder_criteria` | Individual eligibility, evaluation, application, and award requirements, including weights, hard gates, and normalized rules |
| `source_documents` | An arbitrary number of official pages or documents with type, URL, title, licence status, hash, and fetch time |
| `funding_record_evidence` | Claim-level support connecting a funding record to a source document and source location |

### Example: current CNB schema

The following is an illustrative logical aggregate assembled from the current
implemented table columns. It is not a single stored JSON row; the objects are
stored in related tables.

```json
{
  "funder": {
    "funder_id": "4e05094d-25ea-4ab2-ae0c-9a444c1482ce",
    "name": "Minnesota Board of Water & Soil Resources",
    "funder_type": "state agency",
    "country": "US",
    "region": "US-MN",
    "profile": {
      "stated": {
        "purpose": "Improve and protect Minnesota water resources"
      },
      "derived": {
        "typical_recipients": [
          "municipality",
          "watershed district"
        ]
      }
    }
  },
  "opportunity": {
    "funding_record_id": "930f9d1e-cbde-4bb4-9a6a-25f25c52ef9e",
    "source_run_id": "bwsr-fy27-review",
    "source_record_ref": "opportunity-001",
    "funder_id": "4e05094d-25ea-4ab2-ae0c-9a444c1482ce",
    "is_opportunity": true,
    "name": "Clean Water Fund - Projects & Practices competitive grant",
    "applicant_type": "municipality",
    "country": "US",
    "state_region": "US-MN",
    "category": "water-quality",
    "finance_route": "competitive grant",
    "instrument_type": "grant",
    "region_scope": "Minnesota",
    "min_award": null,
    "max_award": null,
    "currency": "USD",
    "status": "open",
    "summary": "Competitive funding for projects implementing approved local water plans.",
    "known_gaps": []
  },
  "template": {
    "template_id": "4b2cf58f-1a85-4fd1-bf66-57e6b504ce7b",
    "funding_record_id": "930f9d1e-cbde-4bb4-9a6a-25f25c52ef9e",
    "template_name": "FY27 eLINK application",
    "output_format": "online form",
    "chapter_schema": [
      {
        "chapter_ref": "project-abstract",
        "title": "Project Abstract",
        "description": "Summarize the problem, proposed work, location, and intended result.",
        "required": true
      },
      {
        "chapter_ref": "measurable-outcomes",
        "title": "Measurable Outcomes and Project Impact",
        "description": "Connect quantified outcomes to approved plan goals.",
        "required": true
      }
    ],
    "required_fields": [
      "project_abstract",
      "measurable_outcomes",
      "project_budget"
    ]
  },
  "criteria": [
    {
      "criterion_id": "de8cfef0-367e-4c5b-9532-a69322c28913",
      "funding_record_id": "930f9d1e-cbde-4bb4-9a6a-25f25c52ef9e",
      "source_document_id": "ab293502-e918-4d11-960b-dd3b6114164b",
      "criterion_type": "evaluation",
      "label": "Measurable Outcomes and Project Impact",
      "requirement_text": "Describe measurable water-quality outcomes tied to plan goals.",
      "weight": 25,
      "hard_gate": false,
      "normalized_rule": {
        "maximum_points": 25
      }
    }
  ],
  "source_documents": [
    {
      "source_document_id": "ab293502-e918-4d11-960b-dd3b6114164b",
      "source_type": "funder-rfp",
      "url": "https://bwsr.state.mn.us/example-fy27-rfp.pdf",
      "title": "FY27 Clean Water Fund Projects & Practices RFP",
      "license_status": "review-required",
      "content_hash": "sha256:example",
      "fetched_at": "2026-08-10T12:00:00Z"
    }
  ],
  "evidence": [
    {
      "funding_record_id": "930f9d1e-cbde-4bb4-9a6a-25f25c52ef9e",
      "source_document_id": "ab293502-e918-4d11-960b-dd3b6114164b",
      "claim": "The measurable-outcomes criterion is worth 25 points.",
      "quote_or_summary": "The RFP assigns 25 points to measurable outcomes and project impact.",
      "source_map": {
        "page": 14,
        "section": "Scoring criteria"
      }
    }
  ]
}
```

This shape can answer the questions CNB must ask before drafting:

- What document structure must be followed?
- Which sections and fields are mandatory?
- What supporting attachments must be prepared?
- Which rules determine eligibility?
- How will the application be scored?
- Which source and page support each requirement?
- Which facts remain unknown and must be surfaced as gaps?

## What the Live Global API Can Store and Return

### Funding opportunities

The live opportunity model is a strong discovery catalogue. It stores:

- programme and funder names;
- funder level, channel, and provider;
- finance instrument and climate sectors;
- eligible actor types and a free-text eligibility explanation;
- how a city accesses the opportunity;
- open/close dates, status, recurrence, and status date;
- one amount, currency field, and amount note;
- a programme URL, one legal-basis URL, and general notes; and
- dataset/release provenance.

It does not have a structural location for:

- a programme description separate from general notes;
- a template name or template document;
- an ordered chapter or application-question schema;
- chapter descriptions or required fields;
- a checklist of documents the applicant must submit;
- individual eligibility, evaluation, application, or award criteria;
- rubric points, criterion weights, or hard eligibility gates;
- an arbitrary collection of guidance, FAQ, template, RFP, award-list, and
  supporting documents; or
- field-level evidence linking a fact to a source and page/section.

### Example: live Global API opportunity

This is a representative record returned by the live endpoint on 10 August
2026. It shows that the catalogue can point CNB to the programme page and one
rules PDF, but it does not store the application structure extracted from that
PDF.

```json
{
  "opportunity_name": "FPA 2026 - Proyectos Sustentables Ciudadanos",
  "funder_name": "Ministerio del Medio Ambiente (Chile)",
  "funder_level": "national",
  "provider": null,
  "instrument": "grant",
  "gpc_sectors": [
    "cross_sector",
    "waste",
    "stationary_energy",
    "afolu"
  ],
  "eligible_actor": [
    "community_org"
  ],
  "eligible_actor_detail": "personas jurídicas de derecho privado y sin fines de lucro (Juntas de Vecinos, ONG, Fundaciones, Corporaciones)",
  "city_application": [
    "direct"
  ],
  "funding_channel": "competitive fund",
  "access_tier": "competitive",
  "open_date": "2025-08-26",
  "close_date": "2025-10-07",
  "status": "closed",
  "status_as_of": "2026-06-08",
  "recurrence": "annual",
  "amount": 6000000,
  "amount_currency": null,
  "amount_note": null,
  "source_url": "https://fondos.mma.gob.cl/fpa-2026-proyectos-sustentables-ciudadanos/",
  "legal_basis_url": "https://fondos.mma.gob.cl/wp-content/uploads/2025/08/Resolucion-Exenta-5796-Aprueba-Bases-FPA-2026-Proyectos-Sustentables-Ciudadanos.pdf",
  "notes": null,
  "country_code": "CL",
  "datasource_name": "cl-mma-fondos"
}
```

The linked legal-basis PDF may contain the missing application requirements,
but the current schema stores only its URL. CNB would have to fetch, parse, and
interpret the document again for each run unless the extracted, reviewed result
is stored elsewhere.

### Current live coverage

The 10 August 2026 Chile opportunity response contained 99 records:

| Field or collection | Populated records |
| --- | ---: |
| `source_url` | 99/99 |
| `legal_basis_url` | 7/99 |
| `notes` | 44/99 |
| `amount` | 8/99 |
| `amount_currency` | 0/99 |
| `close_date` | 7/99 |

The schema therefore has an amount and currency location, but the current Chile
dataset does not yet provide a reliable award range or currency for CNB.

## Funders and Funder IDs

The live climate-finance opportunity response contains `funder_name`, but no
`funder_id`. The separate rich project-summary model contains both fields. For
Chile, the current rich project records use a source-style identifier such as:

```json
{
  "funder_id": "world_bank",
  "funder_name": "World Bank"
}
```

This is a usable V1 identity convention. It is not currently a foreign key to a
Global funder table, but that does not prevent CNB from using it. Global API can
standardize the same slug on opportunities and projects, or CNB can resolve by
reviewed `funder_name` while the identifiers are aligned.

The missing funder information is descriptive rather than identificatory:

- institutional funder type;
- institutionally meaningful country and region;
- stated policies and application practices; and
- derived patterns from historical awards, such as typical recipients and
  award sizes.

Those values currently fit in `funders.profile` in the CNB schema but do not
have an equivalent live Global API response.

## Funded Projects

Global API currently has two project representations.

### Broad climate-finance project catalogue

`/api/v1/climate-finance/projects` reported 11,511 Chilean projects on 10 August
2026. It provides broad precedent coverage with fields such as project name,
sector, jurisdiction, lifecycle stage, amounts, funding sources, and action
matches.

It is comparatively thin for CNB drafting and matching because it does not
return a substantive project summary, concrete interventions, risks, lessons,
or field-level evidence. Its embedded `funding_sources` objects contain a
`source_opportunity_id` location, but none of the 11,511 live Chile records had
that value populated in the snapshot.

### Rich project-summary catalogue

`/api/v1/projects` returns a much richer schema. It includes:

- `project_id`, `source_project_id`, `funder_id`, and `funder_name`;
- project description and synthesis notes;
- budget and primary-funder amount;
- financing instrument and financing structure;
- site context, interventions, risks, co-benefits, and replicability
  conditions; and
- claim-level evidence anchors.

This schema is close to what CNB needs for comparable-project matching. Its
current Chile coverage is much narrower: the live country-filtered endpoint
returned 10 records, all with `funder_id = world_bank`, on 10 August 2026.

### Example: live rich project summary

The following is a shortened live response. Only two evidence anchors are shown
to keep the example readable.

```json
{
  "project_id": "3506946b-689b-2986-e9c3-3b8d65b86abf",
  "source_name": "world_bank",
  "source_project_id": "P179117",
  "project_title": "Chile's Water Transition",
  "funder_id": "world_bank",
  "funder_name": "World Bank",
  "country_code": "CL",
  "project_type": "programmatic",
  "sector_name": "water",
  "approval_at": "2024-06-10T00:00:00+00:00",
  "closing_at": "2028-12-31T00:00:00+00:00",
  "project_status": "under_implementation",
  "total_budget_amount_usd": 250000000,
  "primary_funder_amount_usd": 250000000,
  "financing_instrument": "senior_loan",
  "project_summary_text": "Chile's Water Transition project aims to strengthen national capacity for water resource management and water-related services, focusing on rural and vulnerable populations.",
  "financing_structure": {
    "notes": "The project is financed by a $250 million World Bank loan (IBRD-96920).",
    "loan_pct": 1,
    "grant_pct": null,
    "private_pct": null,
    "government_pct": null
  },
  "evidence_anchors": [
    {
      "claim": "The project has a total budget of $250 million.",
      "field": "totalBudgetUsd",
      "sourceName": "world_bank",
      "evidenceKind": "quantitative",
      "pageOrSection": "Page 2"
    },
    {
      "claim": "The World Bank loan is $250 million (IBRD-96920).",
      "field": "primaryFunderAmountUsd",
      "sourceName": "world_bank",
      "evidenceKind": "quantitative",
      "pageOrSection": "Page 2"
    }
  ]
}
```

The data-shape issue for projects is therefore fragmentation, not total absence:
Global API has a broad thin catalogue and a narrow rich catalogue. CNB needs a
stable project contract that combines broad coverage with the rich summary and
evidence fields.

## Assessment of the Proposed Global API CNB Examples in This PR

The draft files under [`global-api/mock/cnb`](../global-api/mock/cnb/README.md)
are a useful bridge toward replacing the CNB reference database. They propose:

- a funder list;
- opportunities with funder/provider relationships;
- projects;
- a separate project-funding relationship; and
- a funder/opportunity profile containing eligibility, a scoring rubric,
  required document sections, conditional attachments, and evidence.

### Example: proposed funder profile

This shortened example is taken from
[`funder-profile.json`](../global-api/mock/cnb/funder-profile.json):

```json
{
  "profile_id": "us-mn-bwsr-cwf-pp-fy27-profile",
  "funder_id": "us-mn-bwsr",
  "opportunity_id": "us-mn-bwsr-cwf-pp-fy27",
  "eligibility": {
    "applicant_types": [
      "county",
      "municipality"
    ],
    "plan_requirement": "A municipal project must have, or align with, a current local water plan approved by a watershed authority."
  },
  "rubric": {
    "total_points": 100,
    "criteria": [
      {
        "criterion_id": "measurable-outcomes",
        "name": "Measurable Outcomes and Project Impact",
        "points": 25
      }
    ]
  },
  "required_document": {
    "submission_method": "eLINK online grant application",
    "answer_character_limit": 2000,
    "sections": [
      "Project Abstract",
      "Proposed Measurable Outcomes"
    ],
    "required_attachments": [
      {
        "name": "Feasibility study",
        "condition": "in-lake or in-channel treatment"
      }
    ]
  },
  "evidence": [
    {
      "applies_to": "rubric",
      "source_type": "funder-rfp",
      "source_title": "FY27 Clean Water Fund Projects & Practices RFP",
      "source_url": "https://bwsr.state.mn.us/example-fy27-rfp.pdf"
    }
  ]
}
```

This proposed response covers much of the missing application package, but it
does not yet fully match the implemented CNB reference schema.

| Needed by CNB | Proposed mock status | Remaining change |
| --- | --- | --- |
| Opportunity description | Not explicit | Add a reviewed programme `description` or `summary` |
| Template identity | Implicit as `required_document` | Add `template_name` and optional template URL |
| Output format | Partially implied by `submission_method` | Add explicit `output_format` |
| Ordered template chapters | Section-title strings | Represent chapter ID, title, description, order, and required flag |
| Required fields | Not explicit | Add machine-readable required-field keys |
| Required applicant documents | `required_attachments` | Retain and distinguish always-required from conditional documents |
| Criteria requirement text | Criterion name only | Add the full source-stated requirement text |
| Criteria type | Not explicit | Distinguish eligibility, evaluation, application, and award criteria |
| Weights and hard gates | Points only | Add weight/maximum points and explicit hard-gate status |
| Normalized rules | Not explicit | Add optional machine-readable rule after review |
| Multiple official source documents | Evidence array supports several entries | Retain document identity independently from individual claims |
| Source date/licence/hash | Not present | Add publication date, licence status, content hash, and verification time |
| Field-level source location | Not present | Add claim target and page/section/table location |
| Known gaps and conflicts | Review status only | Return explicit unknown/conflicting fields instead of silently omitting them |

### Project-funding shape

The proposed [`project-funding.json`](../global-api/mock/cnb/project-funding.json)
separates projects from funding relationships and can represent requested,
committed, paid, and total amounts plus status history. That is a valid Global
data model, especially when projects have multiple funders or funding rounds.

The implemented CNB reference schema deliberately stores each funded-project
award as one `funding_records` row and does not have a separate funding-link
table. This is not a data loss problem if Global API owns the normalized model:
the Climate Advisor reference-data client can map a project plus its selected
funding relationship into the single funded-project candidate shape expected by
CNB.

The relationship to an exact opportunity should remain nullable. Many historic
award sources identify the funder and award but do not provide a stable programme
or cycle identifier.

## Detailed Storage Decision

### Information already suitable for direct reuse

Global API can already store and return these fields without a new CNB database:

- funder and programme names;
- funder level, provider, and funding channel;
- instrument, access route, and climate sectors;
- basic eligible-applicant data;
- opportunity dates, status, and recurrence;
- programme and legal-basis URLs;
- project identities, locations, sectors, lifecycle status, and amounts;
- rich project summaries, interventions, risks, financing structure, and
  evidence where the `project_summary` model is populated; and
- dataset and release provenance.

### Information currently storable only as unstructured text or one URL

The live opportunity schema can preserve some of the following in `notes`,
`eligible_actor_detail`, `amount_note`, `source_url`, or `legal_basis_url`, but
CNB cannot reliably query or validate it:

- programme purpose and full description;
- nuanced eligibility conditions;
- co-financing and match requirements;
- application steps and submission instructions;
- award-range explanations;
- template availability; and
- requirements contained inside an RFP or legal-basis PDF.

Putting these values in `notes` avoids total information loss but does not
provide a usable CNB contract.

### Information the current live schema cannot represent structurally

- application template chapters, descriptions, ordering, and required flags;
- required application fields;
- required and conditional applicant attachments;
- separate eligibility, evaluation, application, and award criteria;
- rubric weights, points, and hard gates;
- multiple typed official documents per opportunity;
- claim-to-source and field-to-page evidence;
- reviewed gaps and conflicts; and
- reusable stated and award-derived funder profiles.

## Minimum Global API Contract Needed to Replace the CNB Reference Database

Global API does not have to reproduce the CNB SQL tables one-for-one. It needs a
typed response that preserves equivalent information. A single aggregate detail
endpoint is sufficient for the first release:

```text
GET /api/v1/climate-finance/opportunities/{opportunity_id}/details
```

A minimum response should contain:

```json
{
  "opportunity_id": "string",
  "funder_id": "string|null",
  "funder_name": "string",
  "description": "string|null",
  "finance_route": "string|null",
  "instrument": "string|null",
  "region_scope": "string|null",
  "minimum_award": null,
  "maximum_award": null,
  "currency": "string|null",
  "status": "string|null",
  "funder_profile": {
    "stated": {},
    "derived": {}
  },
  "application_template": {
    "template_name": "string|null",
    "template_url": "string|null",
    "output_format": "string|null",
    "chapters": [
      {
        "chapter_id": "string",
        "title": "string",
        "description": "string|null",
        "position": 1,
        "required": true
      }
    ],
    "required_fields": []
  },
  "criteria": [
    {
      "criterion_id": "string",
      "criterion_type": "eligibility|evaluation|application|award",
      "label": "string",
      "requirement_text": "string",
      "weight": null,
      "maximum_points": null,
      "hard_gate": null,
      "normalized_rule": null,
      "evidence_refs": []
    }
  ],
  "required_documents": [
    {
      "name": "string",
      "description": "string|null",
      "required": true,
      "condition": null,
      "accepted_formats": []
    }
  ],
  "source_documents": [
    {
      "source_ref": "string",
      "source_type": "program-page|rfp|template|guidance|faq|award-list|report",
      "title": "string|null",
      "url": "string",
      "publication_date": "date|null",
      "license_status": "string|null",
      "content_hash": "string|null",
      "last_verified": "datetime|null"
    }
  ],
  "evidence": [
    {
      "evidence_ref": "string",
      "target_path": "string",
      "source_ref": "string",
      "source_location": "string|null",
      "quote_or_summary": "string"
    }
  ],
  "known_gaps": [],
  "conflicts": []
}
```

This response can be backed by normalized Global tables or reviewed JSONB. CNB
only depends on the contract and review guarantees, not on the physical table
layout.

## Recommended Ownership After the Extension

| Data | Recommended owner |
| --- | --- |
| Funders and profiles | Global API/data team |
| Opportunities and descriptions | Global API/data team |
| Application templates and required documents | Global API/data team |
| Criteria, rubric, and source evidence | Global API/data team |
| Funded projects and funding relationships | Global API/data team |
| CNB run status and selected external references | Climate Advisor workflow database |
| Context bundle used for one run | Climate Advisor workflow database |
| User uploads and verified Markdown pointers | Existing CityCatalyst/Climate Advisor boundary |
| Chapters, revisions, gaps, evidence review state, and exports | CNB workflow/workspace persistence |

CNB should snapshot the selected Global API data into its run context so an
in-progress concept note does not silently change when a newer Global dataset
release is published. The authoritative reusable reference record remains in
Global API; the snapshot is workflow state, not a second reference database.

## Decision

The current live Global API cannot replace the implemented CNB reference schema
as-is because it cannot represent the application template, required documents,
criteria/rubric, and opportunity evidence required for grounded drafting.

The proposed Global API examples in this pull request are close to the desired
direction. Once the funder-profile proposal is expanded to include a complete
template structure, criterion requirements and gates, typed source documents,
field-level evidence, and explicit gaps/conflicts, Global API can become the
CNB reference-data source of truth.

At that point, the separate CNB reference tables for funders, funding records,
templates, criteria, source documents, and reference evidence can be removed or
left unprovisioned. The Climate Advisor workflow and document-workspace tables
remain necessary because they store user-specific run state rather than reusable
Global reference data.
