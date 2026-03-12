## HIAP architecture (overview)

This document complements `hiap/README.md` with a slightly more detailed view of how HIAP is structured and what it depends on.

### Component diagram

```mermaid
flowchart TB
  Client["Client application"] -->|HTTP| FastAPI["FastAPI app (hiap/app/main.py)"]

  subgraph Routers["API routers mounted by FastAPI"]
    Prioritizer["/prioritizer/*"]
    PlanCreator["/plan-creator/*"]
    LegacyPlanCreator["/plan-creator-legacy/*"]
  end

  FastAPI --> Prioritizer
  FastAPI --> PlanCreator
  FastAPI --> LegacyPlanCreator

  subgraph Execution["Background execution"]
    Exec["Async workers (threads and process pool)"]
    Memory["In-memory task stores"]
  end

  Prioritizer --> Exec
  PlanCreator --> Exec
  LegacyPlanCreator --> Exec
  Exec --> Memory

  subgraph External["External services"]
    GlobalAPI["CityCatalyst Global APIs (ccglobal.openearth.dev)"]
    OpenAI["OpenAI provider (env configured)"]
    S3["AWS S3 bucket (artefacts and vector stores)"]
  end

  Prioritizer --> GlobalAPI
  PlanCreator --> GlobalAPI
  Prioritizer --> OpenAI
  PlanCreator --> OpenAI
  LegacyPlanCreator --> OpenAI

  RunSh["Docker startup: app/run.sh"] -->|starts| FastAPI
  RunSh -. downloads on container start .-> S3
```

### Operational notes

- **Docs-first usage**: once the server is running, the canonical interface is `GET /docs` (Swagger UI).
- **Async workflow**: many endpoints return a `taskId` and require polling a progress endpoint before fetching results.
- **Task persistence**: task state is stored **in memory**, so restarting the server loses tasks.
- **Upstream dependencies**:
  - Actions/context/CCRA data is fetched from `ccglobal.openearth.dev`.
  - LLM functionality requires OpenAI-related env vars from `.env`.
  - Docker startup downloads artefacts from S3; if you don’t have bucket access, run locally via `python main.py` instead of Docker.
