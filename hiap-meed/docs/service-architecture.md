# Service Architecture

This document describes how `hiap-meed` fits into the wider CityCatalyst system and how a prioritization request flows through the service.

---

## System overview

```mermaid
graph TD
    CC["CityCatalyst\n(frontend / caller)"]

    subgraph hiap-meed ["hiap-meed (FastAPI service)"]
        Router["POST /v1/prioritize\n(sync route → threadpool)"]
        Orch["Orchestrator\nrun_prioritization()"]

        subgraph pipeline ["Prioritization pipeline"]
            HF["Hard Filter"]
            Impact["Impact block"]
            Align["Alignment block"]
            Feas["Feasibility block"]
            WS["Weighted Sum"]
        end

        CityClient["CityDataApiClient\n(sync HTTP client)"]
        ActionClient["ActionDataApiClient\n(sync HTTP client)"]
    end

    GlobalAPI["Global API\n(upstream data service)"]

    CC -->|"POST /v1/prioritize\nJSON body: locode, weights, top_n"| Router
    Router --> Orch

    Orch -->|"getCityContext(locode)"| CityClient
    Orch -->|"listActions()"| ActionClient

    CityClient -->|"HTTP GET"| GlobalAPI
    ActionClient -->|"HTTP GET"| GlobalAPI

    GlobalAPI -->|"CityData"| CityClient
    GlobalAPI -->|"Action list"| ActionClient

    CityClient --> Orch
    ActionClient --> Orch

    Orch --> HF
    HF -->|"eligible actions"| Impact
    HF -->|"eligible actions"| Align
    HF -->|"eligible actions"| Feas
    Impact --> WS
    Align --> WS
    Feas --> WS

    WS -->|"PrioritizationResponse"| Router
    Router -->|"JSON response\nranked_action_ids + metadata"| CC
```

---

## Concurrency model

The `/v1/prioritize` route is a **synchronous** FastAPI route (`def`, not `async def`). FastAPI automatically offloads sync routes to a threadpool worker, so the event loop thread remains free to accept and dispatch other requests.

This is the right choice as long as the orchestrator and data clients are synchronous. If the data clients are later replaced with async counterparts (e.g. `httpx.AsyncClient`), the orchestrator and route should both be converted to `async def` / `await` end-to-end.

---

## Data client layer (current state)

| Client | Method | Status | Target upstream |
|---|---|---|---|
| `CityDataApiClient` | `get_city(locode)` | In-memory stub | Global API |
| `ActionDataApiClient` | `list_actions()` | In-memory stub | Global API |

Stubs are injected via FastAPI's `Depends()` pattern, which makes swapping real implementations straightforward without changing route or orchestrator code.

---

## Request lifecycle

```mermaid
sequenceDiagram
    participant CC as CityCatalyst
    participant API as hiap-meed FastAPI
    participant Orch as Orchestrator
    participant GlobalAPI as Global API

    CC->>API: POST /v1/prioritize {locode, weights, top_n}
    Note over API: FastAPI validates request body (Pydantic)
    API->>Orch: run_prioritization(request, clients)
    Orch->>GlobalAPI: getCityContext(locode)
    GlobalAPI-->>Orch: CityData
    Orch->>GlobalAPI: listActions()
    GlobalAPI-->>Orch: Action[]
    Note over Orch: Hard Filter → Impact / Alignment / Feasibility → Weighted Sum
    Orch-->>API: PrioritizationResponse
    API-->>CC: 200 {ranked_action_ids, metadata}
```

---

## Pipeline stages summary

| Stage | Purpose | Removes / produces |
|---|---|---|
| Hard Filter | Remove ineligible actions (exclusions, hard legal requirements) | Discards actions; produces eligible set |
| Impact | Score emissions reduction potential per city | Impact score per action |
| Alignment | Score alignment with city strategy and policy signals | Alignment score per action |
| Feasibility | Score realistic implementability for the city | Feasibility score per action |
| Weighted Sum | Aggregate pillar scores, sort, apply `top_n` | Final ranked action list |

See [`highlevel-architecture.md`](highlevel-architecture.md) and [`detailed-block-architecture.md`](detailed-block-architecture.md) for the scoring logic inside each block.
