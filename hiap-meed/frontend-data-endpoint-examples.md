# HIAP-MEED Reference-Data API Examples

These detailed examples document the backend implementation in [`implementation-plan-proposal.md`](implementation-plan-proposal.md). For the lightweight product contract, see [`reference-data-api-product-contract.md`](reference-data-api-product-contract.md). Changes to CityCatalyst consumer code remain outside this backend implementation.

Each route has a direct Global API data-family mapping. HIAP-MEED owns technical query parameters, upstream validation, normalization, and post-fetch selection; responses are not raw passthroughs.

These examples use the **same rules and current data** guarantee. They do not include a snapshot identifier: a later prioritize or output-plan request applies the same canonical HIAP-MEED logic but may observe newer Global API data. An exact-snapshot guarantee would require a separately approved contract change.

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
        "unit": "%",
        "category": "economic"
      }
    ]
  },
  "meta": {
    "requestId": "example-request-id",
    "generatedAtUtc": "2026-08-05T12:00:00Z",
    "totalRecords": 1
  },
  "warnings": []
}
```

## 2. Action pathways

Maps Global API `GET /api/v1/action-pathways`. HIAP-MEED keeps the current canonical `lang=all` upstream query, applies the same prioritizable-action selector used by exclusion preview, prioritization, and output-plan generation, and then projects the requested localization set. The selector includes only actions whose normalized `action_type` is `mitigation`.

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
    "requestId": "example-request-id",
    "generatedAtUtc": "2026-08-05T12:00:00Z",
    "totalRecords": 1
  },
  "warnings": []
}
```

`missing_action_type_count` is normally `0`. If Global API returns an action
without `action_type`, HIAP-MEED excludes that malformed row and returns both a
non-zero count and a warning. Valid non-mitigation actions are intentionally
excluded without a warning.

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
    "requestId": "example-request-id",
    "generatedAtUtc": "2026-08-05T12:00:00Z",
    "totalRecords": 1
  },
  "warnings": []
}
```

`document_type`, `signal_type`, `signal_relation`, `signal_strength`, `doc_relevance`, and `evidence_strength` are passed through from Global API without combining or relabelling their values. `scope` is derived only for recognized document types: `framework` and `sector_plan` are national, `parcc` is regional, and `paccc` is municipal. Matching ignores case and surrounding whitespace. Evidence with a missing or unknown document type remains in the response with `scope: null` and does not contribute to regional or municipal aggregates.

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
    "requestId": "example-request-id",
    "generatedAtUtc": "2026-08-05T12:00:00Z",
    "totalRecords": 1
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
    "requestId": "example-request-id",
    "generatedAtUtc": "2026-08-05T12:00:00Z",
    "totalRecords": 2
  },
  "warnings": []
}
```

Every normalized financial row is returned. Numeric scores appear from highest to lowest and rows without a source score appear last with `financial_feasibility: null`. `inputs` contains the upstream explanation values used by the frontend; unknown diagnostic input keys and Global API links are not exposed. The prioritizer's neutral `0.5` fallback remains an algorithm rule and is not returned as source data. The two explicit HIAP-MEED endpoints below provide opportunity and project resources.

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
    "requestId": "example-request-id",
    "generatedAtUtc": "2026-08-05T12:00:00Z",
    "totalRecords": 2
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
    "requestId": "example-request-id",
    "generatedAtUtc": "2026-08-05T12:00:00Z",
    "totalRecords": 1
  },
  "warnings": []
}
```

The route does not accept caller-controlled `limit`.

## Validation and errors

Query validation, upstream errors, and request-trace error payloads follow the same FastAPI/Pydantic and `_error_payload()` / `_upstream_error_payload()` conventions as the existing HIAP-MEED routes. The new contracts should not introduce a separate error envelope.
