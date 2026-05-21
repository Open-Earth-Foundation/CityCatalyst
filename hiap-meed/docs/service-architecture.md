# Service Architecture

This document describes how `hiap-meed` fits into the current caller setup and how a prioritization request flows through the service.

---

## System overview

```mermaid
graph TD
    FE["External hiap-meed frontend / caller"]

    subgraph hiap-meed ["hiap-meed (FastAPI service)"]
        Router["POST /v1/prioritize (sync route -> threadpool)"]
        Orch["Orchestrator run_prioritization()"]

        subgraph pipeline ["Prioritization pipeline"]
            HF["Hard Filter"]
            Impact["Impact block"]
            Align["Alignment block"]
            Feas["Feasibility block"]
            WS["Weighted Sum"]
        end

        CityClient["City data client (sync data client)"]
        ActionClient["Action pathways data client (sync data client)"]
        LegalClient["Legal data client (sync data client)"]
        PolicyClient["Action policy scores data client (sync data client)"]
    end

    GlobalAPI["Global API (future upstream integration)"]

    FE -->|"POST /v1/prioritize JSON body: PrioritizerApiRequest (meta + requestData.cityDataList)"| Router
    Router --> Orch

    Orch -->|"getCityContext(locode)"| CityClient
    Orch -->|"listActions()"| ActionClient
    Orch -->|"getActionLegalAssessments(country_code)"| LegalClient
    Orch -->|"getActionPolicyScores(locode)"| PolicyClient
    Orch -->|"getActionMitigationFeasibilityScores(locode, country_code)"| FeasibilityClient

    CityClient -.->|"API mode: GET /api/v0/city_attributes/{locode}"| GlobalAPI
    ActionClient -.->|"API mode: GET /api/v1/action-pathways"| GlobalAPI
    LegalClient -.->|"API mode: GET /api/v1/action-legal-assessments?countryCode=..."| GlobalAPI
    PolicyClient -.->|"API mode: GET /api/v1/cities/{locode}/action-policy-scores"| GlobalAPI
    FeasibilityClient -.->|"API mode: GET /api/v1/cities/{locode}/action-mitigation-feasibility-scores?country_code=..."| GlobalAPI

    GlobalAPI -.->|"CityData"| CityClient
    GlobalAPI -.->|"Action list"| ActionClient
    GlobalAPI -.->|"Action legal assessments"| LegalClient
    GlobalAPI -.->|"Action policy scores"| PolicyClient

    CityClient --> Orch
    ActionClient --> Orch
    LegalClient --> Orch
    PolicyClient --> Orch

    Orch --> HF
    HF -->|"eligible actions"| Impact
    HF -->|"eligible actions"| Align
    HF -->|"eligible actions"| Feas
    Impact --> WS
    Align --> WS
    Feas --> WS

    WS -->|"PrioritizationResponse (per city: ranked_action_ids + ranked_actions + metadata)"| Router
    Router -->|"JSON response PrioritizerApiResponse (results[])"| FE
```

---

## Concurrency model

The `/v1/prioritize` route is a **synchronous** FastAPI route (`def`, not `async def`). FastAPI automatically offloads sync routes to a threadpool worker, so the event loop thread remains free to accept and dispatch other requests.

This is the right choice as long as the orchestrator and data clients are synchronous. If the data clients are later replaced with async counterparts (e.g. `httpx.AsyncClient`), the orchestrator and route should both be converted to `async def` / `await` end-to-end.

---

## Data client layer (current state)

| Client                    | Method                                | Status                                                                                  | Target upstream |
| ------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------- | --------------- |
| City data client          | `get_city(locode)`                    | Mock/API switch (`HIAP_MEED_CITY_DATA_SOURCE`); `mock` is file-backed, `api` performs synchronous HTTP GET `/api/v0/city_attributes/{locode}` against the shared `CCGLOBAL_API_BASE_URL` (default `https://ccglobal.openearth.dev` locally; overridden in workflows per environment) | configurable city attributes API host |
| Action pathways data client | `list_actions()`                      | Mock/API switch (`HIAP_MEED_ACTION_PATHWAYS_DATA_SOURCE`); `api` performs synchronous HTTP GET `/api/v1/action-pathways` with no query parameters and returns the full upstream catalog; `mock` is file-backed | Global API |
| Legal data client         | `get_action_legal_assessments(country_code)` | Mock/API switch (`HIAP_MEED_LEGAL_DATA_SOURCE`); `mock` is file-backed, `api` performs synchronous HTTP GET `/api/v1/action-legal-assessments?countryCode=...` against the shared `CCGLOBAL_API_BASE_URL` | configurable legal assessments API host |
| Action policy scores data client | `get_action_policy_scores(locode)`    | Mock/API switch (`HIAP_MEED_ACTION_POLICY_SCORES_DATA_SOURCE`); `api` performs synchronous HTTP GET `/api/v1/cities/{locode}/action-policy-scores`; `mock` is file-backed | Global API (future) |
| Action mitigation feasibility scores data client | `get_action_mitigation_feasibility_scores(locode, country_code)` | Mock/API switch (`HIAP_MEED_ACTION_MITIGATION_FEASIBILITY_SCORES_DATA_SOURCE`); `api` performs synchronous HTTP GET `/api/v1/cities/{locode}/action-mitigation-feasibility-scores?country_code=...`; `mock` is file-backed | Global API |

Clients are injected via FastAPI's `Depends()` pattern. The city, action, legal, action policy scores, and mitigation feasibility clients default to their live upstream APIs.

Action API note:
- `GET /api/v1/action-pathways` is called without `limit`, `lang`, or other query parameters
- mitigation feasibility now comes from the separate city-scoped scores endpoint and missing action rows use the neutral `0.5` fallback in Feasibility scoring

---

## Request lifecycle

```mermaid
sequenceDiagram
    participant FE as External hiap-meed frontend
    participant API as hiap-meed FastAPI
    participant Orch as Orchestrator
    participant Clients as Data clients (mock by default)

    FE->>API: POST /v1/prioritize PrioritizerApiRequest (meta + requestData.cityDataList)
    Note over API: FastAPI validates request body (Pydantic)
    API->>Orch: run_prioritization(locode, city_emissions_context, clients, per_city_options...)
    Orch->>Clients: get_city / list_actions / get_action_legal_assessments / get_action_policy_scores
    Clients-->>Orch: CityData / Action[] / legal assessments / action policy scores
    Note over Orch: Hard Filter -> Impact -> Alignment -> Feasibility -> Weighted Sum
    Orch-->>API: PrioritizationResponse (per city)
    API-->>FE: 200 PrioritizerApiResponse (results[])
```

---

## Pipeline stages summary

| Stage        | Purpose                                                         | Removes / produces                      |
| ------------ | --------------------------------------------------------------- | --------------------------------------- |
| Hard Filter  | Remove ineligible actions (exclusions, blocked legal verdicts) | Discards actions; produces eligible set |
| Impact       | Score emissions reduction potential per city                    | Impact score per action                 |
| Alignment    | Score alignment with city strategy and action policy scores           | Alignment score per action              |
| Feasibility  | Score realistic implementability for the city                   | Feasibility score per action            |
| Weighted Sum | Aggregate pillar scores, sort, apply `top_n`                    | `ranked_action_ids` + `ranked_actions`  |

See [`highlevel-architecture.md`](highlevel-architecture.md) and [`detailed-block-architecture.md`](detailed-block-architecture.md) for the scoring logic inside each block.

Current flow note:
- exclusion preview and prioritization are intentionally separate request flows
- exclusion preview resolves raw exclusion preferences into proposals for user review
- prioritization consumes confirmed `excludedActionIds` and runs the scoring pipeline
- prioritization artifacts are assembled in the orchestrator layer, while exclusion preview artifacts are currently assembled from `api.py`

