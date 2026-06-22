# API Design Standards — Global API

This document defines the conventions for the CityCatalyst Global API. It covers URL structure, versioning, query parameters, file naming, and known technical debt. New endpoints must follow these standards. Existing endpoints should be migrated opportunistically when they are being touched as part of other work.

---

## Guiding Principles

- **Resources, not actions.** URLs identify things (nouns), not operations (verbs). The HTTP method communicates the action.
- **Path params identify; query params filter.** If removing a segment would change *which resource* you are addressing, it belongs in the path. If it narrows or shapes the response, it belongs in a query parameter.
- **Predictable hierarchy.** The URL structure should reflect how resources relate: `/cities/{locode}/emissions` is readable without documentation.
- **Consistency over cleverness.** When in doubt, follow the closest existing pattern rather than introducing a new shape.

---

## URL Structure

### Grammar

```
/api/{version}/{resource}/{id}/{sub-resource}?{filters}
```

- URL path segments use **kebab-case** (hyphens).
- Query parameter names use **snake_case** (underscores).
- Resource names are **plural nouns**.
- Do not encode verbs, logic, or context qualifiers in the path beyond what is needed to identify the resource.

### Resource hierarchy

The top-level resources in this API are:

| Top-level resource | What it represents |
|---|---|
| `/cities` | A city, identified by its UN/LOCODE (`locode`) |
| `/reference` | Shared lookup tables (emission factors, formula inputs) |
| `/ccra` | Climate Change Risk Assessment data |
| `/catalog` | Dataset and datasource catalogue |
| `/action-pathways` | Mitigation action pathways (per catalog release) |
| `/action-legal-assessments` | SSG legal viability assessments per action and release (``modelled.action_legal_assessement``) |

### City sub-resources

City collection endpoints:

```
/cities/search?q={query}&country_code={country_code}
```

City-scoped data hangs off `/cities/{locode}`:

```
/cities/{locode}
/cities/{locode}/boundary
/cities/{locode}/boundary/area
/cities/{locode}/emissions
/cities/{locode}/emissions/forecast
/cities/{locode}/population
/cities/{locode}/context
/cities/{locode}/attributes
/cities/{locode}/climate-actions
/cities/{locode}/ghgi/notation-key
```

Do not repeat the resource name in the path. `/city_context/city/{locode}` and `/cityboundary/city/{locode}` are examples of the anti-pattern — `city` is already implied by the `/cities/{locode}` prefix.

### Reference sub-resources

Reference data that is not city-scoped lives under `/reference`:

```
/reference/emission-factors
/reference/emission-factors/methodologies
/reference/emission-factors/publishers
/reference/emission-factors/datasources
/reference/formula-inputs
/reference/formula-inputs/methodologies
/reference/formula-inputs/publishers
/reference/formula-inputs/datasources
```

### CCRA sub-resources

```
/ccra/cities/{country_code}
/ccra/cities/{locode}/risk-assessments/{scenario_name}
/ccra/cities/{locode}/impact-chain/{scenario_name}
```

---

## Path Parameters vs Query Parameters

### Use path parameters to identify a resource

A path parameter is part of the resource address. Omitting it would make the URL ambiguous or invalid.

```
/cities/{locode}              ✓  locode uniquely identifies the city
/cities/{locode}/emissions    ✓  emissions is a sub-resource of the city
```

### Use query parameters to filter or shape the response

Anything that narrows a result set, selects a time period, or switches a calculation mode is a query parameter.

```
GET /cities/{locode}/emissions
    ?datasource={datasource_name}
    &year={emissions_year}
    &gpc_ref={gpc_reference_number}
    &granularity={spatial_granularity}
    &gwp={ar5}
```

**Avoid packing multiple filter values into the path.** The existing pattern `/source/{datasource_name}/{spatial_granularity}/{actor_id}/{emissions_year}/{gpc_reference_number}` is position-dependent, hard to extend, and unreadable — all of those except `actor_id` are filters.

### Query parameter conventions

- Names use **snake_case**.
- Boolean flags use `is_` prefix where the meaning would be ambiguous without it: `?is_latest=true`.
- Year fields use `_year` suffix where ambiguity is possible: `emissions_year`, `forecast_year`.
- Optional parameters must have clearly documented defaults.
- Validate and reject unexpected values early — return `400 Bad Request` with a descriptive message rather than silently ignoring the parameter.

---

## Spelling and Casing

| Term | Convention | Notes |
|---|---|---|
| URL path segments | `kebab-case` | `/cities`, `/emission-factors`, `/climate-actions` |
| Query parameter names | `snake_case` | `emissions_year`, `gpc_ref`, `datasource_name` |
| Catalog (noun) | `catalog` | American English spelling throughout |
| GPC reference | `gpc_ref` | Shortened form acceptable in query params; full form `gpc_reference_number` in code |
| Locode | `locode` | Lowercase throughout — this is the standard city identifier |
| JSON response property names | `camelCase` | ``GET /action-legal-assessments``; other endpoints may still use ``snake_case`` until migrated |

---

## API Versioning

The API prefix is `/api/v{n}`. The version is incremented when a **breaking change** is introduced — one that would cause existing callers to receive incorrect or missing data without updating their integration.

### What constitutes a breaking change

- Removing a field from a response.
- Renaming a path parameter or query parameter.
- Changing the type or format of a returned value.
- Removing an endpoint.
- Changing the meaning of an existing parameter value.

### What does not require a version bump

- Adding new optional query parameters.
- Adding new fields to a response (callers should ignore unknown fields).
- Adding new endpoints.
- Performance improvements with identical contract.

### Version lifecycle

When a breaking change is introduced:

1. The new endpoint is released under the new version (e.g. `v1` → `v2`).
2. The previous version is kept live for a documented deprecation window (minimum one release cycle).
3. The old version is marked deprecated in OpenAPI docs with a sunset date.
4. After the window, the old version is moved to `routes/deprecated/` and removed from the active router.

**Do not silently change the behaviour of an existing versioned endpoint.** If the contract changes, bump the version.

### Current state

Most endpoints are on `v0`. A small number (`ghgi_emissions`, `population`) were moved to `v1` without a documented rationale. This is known debt — see the Known Debt section below.

---

## Route File Naming

Route files live in `global-api/routes/`. Each file groups endpoints for one top-level resource or closely related sub-resources.

| Convention | Rule |
|---|---|
| File name | `snake_case`, named after the **resource**, not the model or function |
| Suffix | No `_endpoint` suffix — everything in `routes/` is an endpoint |
| One router per file | Each file defines one `api_router` instance |
| Grouping | Group by resource, not by operation. All `/cities/...` endpoints in `cities.py`. |

### Examples

```
routes/
  cities.py               → /cities/{locode}/...
  catalog.py              → /catalog, /catalog/...
  emission_factors.py     → /reference/emission-factors/...
  formula_inputs.py       → /reference/formula-inputs/...
  ccra.py                 → /ccra/...
  ghgi.py                 → /cities/{locode}/ghgi/...
  health.py               → /health
```

Avoid files named after operations (`get_climate_actions.py`) or that duplicate the sub-resource name in the file name (`emissionfactor_emissionsfactor_endpoint.py`).

---

## Error Responses

Use standard HTTP status codes and return a consistent error body:

```json
{
  "detail": "No emissions data found for the requested city and year."
}
```

FastAPI's default `HTTPException` format matches this — use it consistently. Do not return `200 OK` with an empty body or a `null` result when the resource was not found; use `404`.

| Situation | Status code |
|---|---|
| Resource not found | `404 Not Found` |
| Invalid parameter value (e.g. unknown GWP) | `400 Bad Request` |
| Valid request but no data available | `404 Not Found` |
| Unexpected server error | `500 Internal Server Error` |
