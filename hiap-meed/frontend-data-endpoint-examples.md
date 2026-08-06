# Proposed HIAP-MEED Reference-Data API Examples

These detailed examples support the backend implementation proposed in [`implementation-plan-proposal.md`](implementation-plan-proposal.md). For the lightweight product review, see [`reference-data-api-product-contract.md`](reference-data-api-product-contract.md). The seven HIAP-MEED endpoints are not implemented yet and should be finalized through the CC-594 contract review. Changes to CityCatalyst consumer code are outside this proposal.

Each route has a direct Global API data-family mapping. HIAP-MEED owns technical query parameters, upstream validation, normalization, and post-fetch selection; responses are not raw passthroughs.

These examples use the proposed **same rules and current data** guarantee. They do not include a snapshot identifier: a later prioritize or output-plan request applies the same canonical HIAP-MEED logic but may observe newer Global API data. An exact-snapshot guarantee would require a separately approved contract change.

## 1. City attributes

Maps Global API `GET /api/v0/city_attributes/{locode}`.

```http
GET /v1/cities/CL%20IQQ/attributes
```

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
        "unit": "%"
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

## 2. Action pathways

Maps Global API `GET /api/v1/action-pathways`. HIAP-MEED keeps the current canonical `lang=all` upstream query and projects the requested localization set in the public response.

```http
GET /v1/action-pathways?language=es
```

With no `language` query, the response includes all available localizations. Repeating the query, for example `?language=en&language=es`, returns those two languages.

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
      "implementation_timeline": "5-10 years"
    }
  ],
  "meta": {
    "generated_at_utc": "2026-08-05T12:00:00Z",
    "backend_consumer": "hiap-meed",
    "upstream_provider": "global-api",
    "api_context": {
      "endpoint": "GET /v1/action-pathways"
    },
    "total_records": 1
  },
  "warnings": []
}
```

## 3. Action policy scores

Maps Global API `GET /api/v1/cities/{locode}/action-policy-scores`. The public route does not accept `top_evidence_limit`; HIAP-MEED uses the canonical query shared with processing consumers.

```http
GET /v1/cities/CL%20IQQ/action-policy-scores
```

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
          "scope": "national",
          "document_name": "National Energy Efficiency Plan",
          "relevance": "supporting"
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

## 4. Action mitigation-feasibility scores

Maps the corresponding current direct Global API data request:

```http
GET /v1/cities/CL%20IQQ/action-mitigation-feasibility-scores?country_code=CL
```

The caller supplies both city and country scope. HIAP-MEED normalizes and validates the values, including their consistency where applicable, before constructing the canonical backend upstream request.

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

Missing action rows remain absent. The route does not add the prioritizer's neutral `0.5` scoring fallback to source data.

## 5. Financial-feasibility scores

Maps Global API `GET /api/v1/cities/{locode}/climate-finance/feasibility?country_code={CC}`.

```http
GET /v1/cities/CL%20IQQ/climate-finance/feasibility?country_code=CL
```

The caller supplies both city and country scope. HIAP-MEED validates and forwards them while retaining ownership of the canonical upstream query and result projection.

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
      "reason": "Several municipal support routes are available."
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
    "total_records": 1
  },
  "warnings": []
}
```

The response does not expose Global API opportunity/project links. The two explicit HIAP-MEED endpoints below provide those resources.

## 6. Climate-finance opportunities

Maps Global API `GET /api/v1/climate-finance/opportunities`. The caller supplies the country, sector, and route scope. HIAP-MEED validates and forwards that scope, forces `eligible_actor=municipality` and the current backend screening limit, then applies the existing current/monitor and finance-route selector.

```http
GET /v1/climate-finance/opportunities?country_code=CL&sector=stationary_energy&route=technical_assistance
```

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

The route does not accept caller-controlled `eligible_actor` or `limit`.

## 7. Climate-finance projects

Maps Global API `GET /api/v1/climate-finance/projects`. The caller supplies country and action scope. HIAP-MEED validates and forwards that scope, forces the canonical project limit, and returns the same selected set used by output-plan generation.

```http
GET /v1/climate-finance/projects?country_code=CL&action_id=c40_0012
```

```json
{
  "projects": [
    {
      "project_name": "Municipal Building Retrofit Programme",
      "jurisdiction": "Valparaíso",
      "lifecycle_stage": "implementation",
      "funding_channel": "public investment"
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

The route does not accept caller-controlled `limit`.

## Validation and errors

Query validation, upstream errors, and request-trace error payloads follow the same FastAPI/Pydantic and `_error_payload()` / `_upstream_error_payload()` conventions as the existing HIAP-MEED routes. The new contracts should not introduce a separate error envelope.
