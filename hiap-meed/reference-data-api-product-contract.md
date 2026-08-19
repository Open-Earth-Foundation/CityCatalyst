# HIAP-MEED Reference-Data API Product Contract

## Purpose

This is the product-facing contract for the seven HIAP-MEED reference-data APIs. It shows which data each endpoint provides, the complete caller-controlled input shape, a representative response containing every public field, and the backend-owned filtering.

This contract covers only the `hiap-meed` backend. For full example payloads, see [`frontend-data-endpoint-examples.md`](frontend-data-endpoint-examples.md). For implementation details, see [`implementation-plan-proposal.md`](implementation-plan-proposal.md).

## Shared contract rules

- Callers choose domain scope: locode, country, requested languages, action, sector, and route where relevant.
- HIAP-MEED owns Global API URL construction, technical parameters, limits, validation, normalization, ordering, and post-filtering.
- Callers cannot provide `top_evidence_limit`, `eligible_actor`, catalogue limits, Global API URLs, or arbitrary upstream parameters.
- Public routes and existing processing workflows use the same internal HIAP-MEED operations.
- The guarantee is **same rules and current data**, not reuse of an exact earlier Global API snapshot.

Every successful response also contains:

```text
meta: {
  generated_at_utc,
  backend_consumer,
  upstream_provider,
  api_context,
  total_records
}
warnings: string[]
```

The JSON examples below are complete for the public contracts: every response field is shown. Dynamic lists and maps contain representative entries.

## API overview

| Data needed | HIAP-MEED request | Caller-controlled inputs | Main output |
| --- | --- | --- | --- |
| City attributes | `GET /v1/cities/{locode}/attributes` | `locode` | `city` |
| Action catalogue | `GET /v1/action-pathways` | optional repeated `language` | `actions[]` |
| Policy evidence and scores | `GET /v1/cities/{locode}/action-policy-scores` | `locode` | `scores[]`, `aggregates` |
| Mitigation feasibility | `GET /v1/cities/{locode}/action-mitigation-feasibility-scores` | `locode`, `country_code` | `scores[]` |
| Financial feasibility | `GET /v1/cities/{locode}/climate-finance/feasibility` | `locode`, `country_code` | `data[]` |
| Funding opportunities | `GET /v1/climate-finance/opportunities` | `country_code`, optional `sector`, optional `route` | `current[]`, `monitor[]` |
| Comparable projects | `GET /v1/climate-finance/projects` | `country_code`, `action_id` | `projects[]` |

## 1. City attributes

### Request

```http
GET /v1/cities/CL%20IQQ/attributes
```

| Input | Location | Type | Required | Example |
| --- | --- | --- | --- | --- |
| `locode` | path | string | yes | `CL IQQ` |

**Request body:** none.

### Response (`200`)

```json
{
  "city": {
    "locode": "CL IQQ",
    "city_name": "Iquique",
    "country_code": "CL",
    "region_name": "Tarapacá",
    "population_size": 191468,
    "area_km2": 2242.1,
    "population_density": 85.4,
    "indicators": [
      {
        "key": "unemployment_rate",
        "value": 8.1,
        "unit": "%",
        "category": "economic"
      }
    ]
  },
  "meta": {
    "generated_at_utc": "2026-08-05T12:00:00Z",
    "backend_consumer": "hiap-meed",
    "upstream_provider": "global-api",
    "api_context": {
      "endpoint": "GET /v1/cities/{locode}/attributes",
      "locode": "CL IQQ"
    },
    "total_records": 1
  },
  "warnings": []
}
```

- **Backend logic:** normalize the locode and map the current city-attributes response into a stable city record.

## 2. Action pathways

### Request

```http
GET /v1/action-pathways?language=es
```

| Input | Location | Type | Required | Example |
| --- | --- | --- | --- | --- |
| `language` | query, repeatable | string | no | `es` |

No `language` returns all available localizations. Repeating it, for example `?language=en&language=es`, returns exactly those languages.

**Request body:** none.

### Response (`200`)

```json
{
  "actions": [
    {
      "action_id": "c40_0012",
      "action_name": "Improve energy efficiency in municipal buildings",
      "action_type": "mitigation",
      "description": "Retrofit municipal buildings and improve energy management.",
      "name_i18n": {
        "es": "Mejorar la eficiencia energética de los edificios municipales"
      },
      "description_i18n": {
        "es": "Rehabilitar edificios municipales y mejorar la gestión energética."
      },
      "investment_cost": "medium",
      "implementation_timeline": "5-10 years",
      "co_benefits": {
        "air_quality": {
          "impact_relationship": "direct",
          "impact_text": "Cleaner urban air",
          "impact_numeric": 2,
          "methodology": "Source assessment"
        }
      },
      "emissions": {
        "sector_number": "I",
        "subsector_number": [1],
        "gpc_reference_number": ["I.1.1"],
        "impact_relationship": "reduces",
        "impact_text": "Lower building emissions",
        "impact_numeric": -2,
        "methodology": "Source assessment"
      }
    }
  ],
  "meta": {
    "generated_at_utc": "2026-08-05T12:00:00Z",
    "backend_consumer": "hiap-meed",
    "upstream_provider": "global-api",
    "api_context": {
      "endpoint": "GET /v1/action-pathways",
      "missing_action_type_count": 0
    },
    "total_records": 1
  },
  "warnings": []
}
```

- **Backend logic:** fetch the canonical catalogue with all languages, then apply the same prioritizable-action rule used by exclusion preview, prioritization, and output-plan generation. Only actions whose normalized `action_type` is `mitigation` are included. The language parameter only changes which localizations are returned. Production uses Global API; configured mocks remain test/local behavior only.
- **Data-quality signal:** `meta.api_context.missing_action_type_count` reports malformed upstream rows excluded because `action_type` was missing. A non-zero count also adds a warning. Valid non-mitigation actions are intentionally excluded and do not produce this warning.

## 3. Action policy scores

### Request

```http
GET /v1/cities/CL%20IQQ/action-policy-scores
```

| Input | Location | Type | Required | Example |
| --- | --- | --- | --- | --- |
| `locode` | path | string | yes | `CL IQQ` |

**Request body:** none.

### Response (`200`)

```json
{
  "locode": "CL IQQ",
  "scores": [
    {
      "action_id": "c40_0012",
      "policy_support_score": 0.78,
      "policy_support_category": "strong",
      "finding_count": 4,
      "document_count": 2,
      "policy_evidence": [
        {
          "document_type": "framework",
          "scope": "national",
          "document_name": "National Energy Efficiency Plan",
          "signal_type": "funding",
          "signal_relation": "funds",
          "signal_strength": "high",
          "doc_relevance": "medium",
          "evidence_strength": 0.8
        }
      ]
    }
  ],
  "aggregates": {
    "national": 0.78,
    "regional": 0.72,
    "municipal": 0.69
  },
  "meta": {
    "generated_at_utc": "2026-08-05T12:00:00Z",
    "backend_consumer": "hiap-meed",
    "upstream_provider": "global-api",
    "api_context": {
      "endpoint": "GET /v1/cities/{locode}/action-policy-scores",
      "locode": "CL IQQ"
    },
    "total_records": 1
  },
  "warnings": []
}
```

- **Backend logic:** use the current HIAP-MEED evidence query and calculate the agreed evidence-scope aggregates from the same normalized result. Pass through `document_type`, `signal_type`, `signal_relation`, `signal_strength`, `doc_relevance`, and `evidence_strength` using the Global API field names and values; do not combine them into a separate relevance classification. Derive `scope` only for recognized document types (`framework` and `sector_plan` as national, `parcc` as regional, and `paccc` as municipal), using case-insensitive matching. Keep evidence with a missing or unknown type, return its `scope` as `null`, and exclude it only from regional and municipal aggregates.
- **Not a caller knob:** `top_evidence_limit`; HIAP-MEED does not add the prototype's value of five.

## 4. Action mitigation-feasibility scores

### Request

```http
GET /v1/cities/CL%20IQQ/action-mitigation-feasibility-scores?country_code=CL
```

| Input | Location | Type | Required | Example |
| --- | --- | --- | --- | --- |
| `locode` | path | string | yes | `CL IQQ` |
| `country_code` | query | two-letter country code | yes | `CL` |

**Request body:** none.

### Response (`200`)

```json
{
  "locode": "CL IQQ",
  "country_code": "CL",
  "scores": [
    {
      "action_id": "c40_0012",
      "action_score": 0.71,
      "rank_within_city": 8,
      "dimension_scores": {
        "technical": 0.8,
        "institutional": 0.62
      }
    }
  ],
  "meta": {
    "generated_at_utc": "2026-08-05T12:00:00Z",
    "backend_consumer": "hiap-meed",
    "upstream_provider": "global-api",
    "api_context": {
      "endpoint": "GET /v1/cities/{locode}/action-mitigation-feasibility-scores",
      "locode": "CL IQQ",
      "country_code": "CL"
    },
    "total_records": 1
  },
  "warnings": []
}
```

- **Backend logic:** validate and normalize the caller scope, then reuse the current action-ID mapping and missing-release behavior.
- **Important:** missing action scores remain absent; the prioritizer's neutral `0.5` fallback is not returned as source data.

## 5. Financial-feasibility scores

### Request

```http
GET /v1/cities/CL%20IQQ/climate-finance/feasibility?country_code=CL
```

| Input | Location | Type | Required | Example |
| --- | --- | --- | --- | --- |
| `locode` | path | string | yes | `CL IQQ` |
| `country_code` | query | two-letter country code | yes | `CL` |

**Request body:** none.

### Response (`200`)

```json
{
  "locode": "CL IQQ",
  "country_code": "CL",
  "data": [
    {
      "action_id": "c40_0012",
      "action_name": "Improve energy efficiency in municipal buildings",
      "sector": "stationary_energy",
      "financial_feasibility": 0.66,
      "route": "technical_assistance",
      "reason": "Several municipal support routes are available.",
      "inputs": {
        "action": {
          "capital_intensity": 0.8,
          "preparation_complexity": 0.9
        },
        "city": {
          "profile": "delivery-ready"
        },
        "finance": {
          "fund_access": "direct",
          "n_reachable_opportunities": 17
        },
        "evidence": {
          "n_existing_projects": 6
        }
      }
    },
    {
      "action_id": "c40_0099",
      "action_name": "Improve district energy systems",
      "sector": "stationary_energy",
      "financial_feasibility": null,
      "route": null,
      "reason": "No current finance score is available.",
      "inputs": {
        "action": {
          "capital_intensity": null,
          "preparation_complexity": null
        },
        "city": {
          "profile": null
        },
        "finance": {
          "fund_access": null,
          "n_reachable_opportunities": null
        },
        "evidence": {
          "n_existing_projects": null
        }
      }
    }
  ],
  "meta": {
    "generated_at_utc": "2026-08-05T12:00:00Z",
    "backend_consumer": "hiap-meed",
    "upstream_provider": "global-api",
    "api_context": {
      "endpoint": "GET /v1/cities/{locode}/climate-finance/feasibility",
      "locode": "CL IQQ",
      "country_code": "CL"
    },
    "total_records": 2
  },
  "warnings": []
}
```

- **Backend logic:** reuse the current action-ID mapping and missing-release behavior and retain every normalized row. Numeric scores are ordered from highest to lowest, followed by rows with `financial_feasibility: null`. The response passes through the typed score-explanation `inputs` while keeping unknown diagnostics and upstream links private.
- **Important:** `null` means that Global API did not provide a score. Prioritization may apply its existing neutral `0.5` algorithm fallback, but the GET response does not present that fallback as source data.

## 6. Climate-finance opportunities

### Request

```http
GET /v1/climate-finance/opportunities?country_code=CL&sector=stationary_energy&route=technical_assistance
```

| Input | Location | Type | Required | Example |
| --- | --- | --- | --- | --- |
| `country_code` | query | two-letter country code | yes | `CL` |
| `sector` | query | string | no, but required to fetch | `stationary_energy` |
| `route` | query | string | no | `technical_assistance` |

**Request body:** none.

### Response (`200`)

```json
{
  "current": [
    {
      "opportunity_name": "Municipal Energy Technical Assistance Facility",
      "funder_name": "Example Development Bank",
      "instrument": "technical_assistance",
      "status": "open",
      "source_url": "https://example.org/facility"
    }
  ],
  "monitor": [
    {
      "opportunity_name": "Annual Sustainable Cities Call",
      "funder_name": "Example Climate Fund",
      "instrument": "grant",
      "status": "closed",
      "recurrence": "annual",
      "source_url": "https://example.org/annual-call"
    }
  ],
  "meta": {
    "generated_at_utc": "2026-08-05T12:00:00Z",
    "backend_consumer": "hiap-meed",
    "upstream_provider": "global-api",
    "api_context": {
      "endpoint": "GET /v1/climate-finance/opportunities",
      "country_code": "CL",
      "sector": "stationary_energy",
      "route": "technical_assistance"
    },
    "total_records": 2
  },
  "warnings": []
}
```

- **Backend logic:** force municipal eligibility and a screening limit of 50; exclude inactive rows from the current list; keep recurring closed rows for monitoring; prefer explicit climate relevance, direct municipal application, and technical assistance; narrow current rows to technical assistance when that route is requested and matching rows exist; return up to five current and five monitoring entries.
- **Missing sector:** preserve the current backend behavior—skip the upstream fetch and return an empty result with a warning.
- **Not caller knobs:** `eligible_actor` and `limit`.

## 7. Climate-finance projects

### Request

```http
GET /v1/climate-finance/projects?country_code=CL&action_id=c40_0012
```

| Input | Location | Type | Required | Example |
| --- | --- | --- | --- | --- |
| `country_code` | query | two-letter country code | yes | `CL` |
| `action_id` | query | string | yes | `c40_0012` |

**Request body:** none.

### Response (`200`)

```json
{
  "projects": [
    {
      "project_name": "Municipal Building Retrofit Programme",
      "project_name_i18n": {
        "en": "Municipal Building Retrofit Programme",
        "es": "Programa municipal de rehabilitación de edificios"
      },
      "sector": "stationary_energy",
      "jurisdiction": "Valparaíso",
      "lifecycle_stage": "implementation",
      "funding_channel": "public investment",
      "cost_total": 71987,
      "amount_unit": "CLP_thousands",
      "funding_sources": [
        {
          "cycle": "2025",
          "amount": 71987,
          "amount_unit": "CLP_thousands",
          "funder_name": "Regional Development Fund"
        }
      ],
      "action_matches": [
        {
          "action_id": "c40_0012",
          "confidence": "goal_aligned"
        }
      ]
    }
  ],
  "meta": {
    "generated_at_utc": "2026-08-05T12:00:00Z",
    "backend_consumer": "hiap-meed",
    "upstream_provider": "global-api",
    "api_context": {
      "endpoint": "GET /v1/climate-finance/projects",
      "country_code": "CL",
      "action_id": "c40_0012"
    },
    "total_records": 1
  },
  "warnings": []
}
```

- **Backend logic:** query by the caller-selected country and action and return the same maximum of five projects used by output-plan generation.
- **Not a caller knob:** `limit`.

## Empty and error behavior

- Malformed or unsupported inputs use the existing FastAPI/Pydantic `422` behavior.
- Unknown required city/action resources use `404` where that is the current endpoint convention.
- Upstream failures or invalid upstream payloads use the existing HIAP-MEED `502` error handling.
- Data families with current “no release” semantics return `200`, an empty data section, and a warning.
- No new error envelope is introduced.

## Implemented product decisions

- The seven routes expose the caller-controlled inputs and output sections shown above.
- Technical upstream parameters, limits, raw payloads, and diagnostics are not public inputs or response fields.
- Consistency means **same rules and current data**; exact snapshot reuse is not included.
