# CC-720 — Modular HIAP architecture RFC

- Status: Revised draft for team review
- Date: 2026-09-10
- Linear: [CC-720 — Investigate modular HIAP module setup](https://linear.app/openearth/issue/CC-720/investigate-modular-hiap-module-setup)
- Scope: architecture investigation and documentation only
- Product code changed by this RFC: no

## Executive summary

Legacy HIAP, HIAP-MEED, and the planned Brazil v3 variant share a broad product goal, but they do not currently share interchangeable runtime contracts. They differ in API shape, ranking semantics, task lifecycle, data sources, LLM workflows, dependency sets, resource profiles, deployment configuration, and failure domains.

The recommended end state is one HIAP microservice with a shared deterministic kernel and explicit country/variant adapters. A canonical prioritization endpoint should accept an explicit country or variant flag and route to the correct adapter. Country-specific compatibility routes may exist during migration, but they should not create separate long-term services.

Migration should be incremental. Keep the existing services running, stand up the unified service alongside them, compare outputs with fixtures and regression tests, migrate consumers gradually, and retire the old services only after parity and operational gates pass. Separate deployments are a transitional safety boundary, not the final architecture.

This RFC answers CC-720 using the current source tree and the 2026-09-10 architecture direction discussed with Mirco. It treats `hiap-meed/docs/methodology-variants-and-migration.md` as prior art. That document remains unchanged because it is a draft and contains stale as-built counts and an Anthropic/OpenAI labeling mismatch.

## Investigation scope

The comparison considered:

- service entrypoints and public HTTP routes;
- request and response models;
- internal domain models and ranking units;
- orchestration and task lifecycle;
- filtering, scoring, ranking, and tie-breaking;
- upstream data clients, mock/API/S3 selection, and provenance;
- LLM call sites, prompts, structured outputs, and model configuration;
- plan-creation workflows and vector-store dependencies;
- Dockerfiles and Python dependency graphs;
- Kubernetes Deployments, Services, resources, probes, secrets, and environment variables;
- GitHub Actions build, test, image, and deployment workflows;
- existing methodology documentation and recent repository history.

## Stakeholder direction

The 2026-09-10 1:1 with Mirco clarified the target architecture. All HIAP variants share a fundamental product surface, including prioritizing climate actions and creating plans, while country implementations may use different inputs, formulas, outputs, and orchestration. The goal is one HIAP microservice to reduce repeated package maintenance and infrastructure overhead.

The preferred routing shape is one shared endpoint with an explicit country/variant flag, for example `/prioritize` with `country=chile` or `country=brazil`, which selects the corresponding adapter. Per-country endpoint paths remain a possible compatibility or migration surface, but are not the preferred long-term contract.

This direction does not require a big-bang migration. Existing services can remain live while the unified service is built beside them, with fixtures and regression tests comparing current outputs against adapter-based outputs before traffic moves.

## Current state

### Legacy `hiap`

`hiap/app/main.py` mounts three feature areas in one FastAPI process:

- `/prioritizer`;
- `/plan-creator`;
- `/plan-creator-legacy`.

The prioritizer API provides asynchronous single-city and bulk starts, progress polling, result polling, explanation generation, explanation translation, and task diagnostics. Requests use camelCase Pydantic models. The city request contains population plus five emissions categories. Results contain separate mitigation and adaptation ranked-action lists.

`hiap/app/prioritizer/tasks.py` converts typed request data into dictionaries, fetches city context and CCRA data, filters actions by action type, ranks mitigation and adaptation actions separately, and stores progress/results in in-memory `task_storage`. The normal ranking path uses `tournament_ranking` with the `ml_compare` comparator. Bulk work uses a process pool; single work and explanation/translation flows use background threads.

The current and legacy plan creators are separate LangGraph graphs. They contain multiple LLM agent nodes for actions, sub-actions, municipalities, goals, MER, adaptation, mitigation, SDGs, and translation. The legacy graph also contains a combine node. Agent modules instantiate `ChatOpenAI` with environment-selected models.

### `hiap-meed`

`hiap-meed` has a more explicit modular boundary:

```text
API -> orchestrator -> scoring blocks -> injected data clients -> upstream sources
```

`app/modules/prioritizer/orchestrator.py` runs a request-scoped pipeline that fetches city data, actions, legal assessments, policy scores, mitigation-feasibility scores, and financial-feasibility scores. It then validates weights, records an input snapshot, applies hard filtering, computes Impact, Alignment, and Feasibility, performs weighted ranking, and optionally generates/translates explanations.

The service uses typed internal models for city data, actions, block results, hard-filter results, scored actions, evidence, and response metadata. The current ranking unit is `Action`.

The data layer exposes separate clients for city, action pathways, legal, policy, mitigation-feasibility, and financial-feasibility data. Most support mock/API selection. Legal data supports S3/mock with a deprecated API guard. Clients are injected through FastAPI dependencies.

The service also has a separate output-plan report path. It validates a supplied prioritization snapshot, enriches source data, generates isolated English chapters concurrently, translates the completed report, and returns structured localized chapters. This path belongs to the service boundary, not the deterministic scoring kernel.

## Contract comparison

| Dimension | Legacy `hiap` | `hiap-meed` | Consequence |
|---|---|---|---|
| Public API | Async `/prioritizer/v1/*`; camelCase DTOs | Typed `/v1/*`; synchronous route handlers with injected clients | Keep HTTP DTOs variant-owned and versioned |
| City input | Population and five sector emissions in request payload | Normalized city/emissions context and source metadata | Map both into an internal domain contract |
| Ranking unit | Raw action dictionaries | Typed `Action` model | Use a rankable-item protocol; do not force identical DTOs |
| Ranking method | Pairwise ML comparator plus tournament/quick-select | Deterministic pillar scores plus weighted sum | Preserve behavior until characterization tests measure differences |
| Filtering | Action-type filtering and request-specific behavior | Legal and confirmed-exclusion hard filter with evidence | Share filter contracts, not assumptions about policy |
| Data access | Global API helpers, city context, CCRA, action catalog, S3/vector artifacts | Six injected clients with mock/API/S3 variants | Adapters own normalization, source policy, and provenance |
| LLM workflows | Per-action explanations plus two LangGraph plan creators | Exclusion resolution, explanations, translations, reports | Keep LLM orchestration outside deterministic kernel |
| State | In-memory task storage and background workers | Request-scoped artifacts and stateless report snapshots | Keep state/lifecycle service-specific |
| Dependencies | LangChain, LangGraph, Chroma, XGBoost, scikit-learn, OpenAI | FastAPI, typed services, OpenAI, MLflow, S3 | A single image would couple unrelated runtime surfaces |
| Deployment | `citycatalyst-hiap` image and Deployment | `citycatalyst-hiap-meed` image and Deployment | Independent rollout is an existing boundary |

## Answers to CC-720

### Can one service expose standardized APIs?

Yes at the internal contract level, with adapters translating each public API into the shared domain model. No as an immediate single-process migration target. The current services have too many independent runtime concerns to merge safely before contract and behavior compatibility are proven.

Standardized contracts should cover rankable items, score vectors, scoring policies, filter decisions, ranking results, evidence, provenance, and run metadata. Public DTOs, route paths, async behavior, and task storage should remain service-specific.

### What should adapters look like?

**Legacy adapter:** translate camelCase requests, raw action dictionaries, city context, CCRA, action types, and legacy ranking behavior. Keep `tournament_ranking` and `ml_compare` behind a legacy strategy until output differences are measured.

**MEED adapter:** translate typed `Action`, city context, six data-client results, legal evidence, policy scores, feasibility components, and request artifacts. MEED is the best first consumer because its scoring and client boundaries already exist.

**Brazil v3 adapter:** remain proposed until methodology and data contracts are approved. It will likely need transition-element taxonomy, shift/intervention ranking, adaptation risk inputs, financing feasibility, policy exclusions, and partner-owned parameters.

### What data and configuration differences complicate unification?

The main differences are:

- legacy camelCase/raw dictionary payloads versus MEED typed snake_case internal models;
- legacy city-context/CCRA helpers versus MEED injected clients;
- legacy action-type filtering versus MEED legal and confirmed-exclusion filtering;
- legacy pairwise/tournament ranking versus MEED I/F/A weighted scoring;
- legacy in-memory async task state versus MEED request artifacts and stateless report snapshots;
- legacy vector-store startup and LangGraph dependencies versus MEED MLflow, S3 legal data, and report concurrency controls;
- different LLM role configuration and prompt/orchestration boundaries;
- future Brazil taxonomy, regional data, and partner-owned methodology inputs.

These differences support an adapter boundary. They do not support copying one variant's DTOs or runtime assumptions into every other variant.

### What are infrastructure and deployment implications?

Current Kubernetes and CI configuration separates the services. This is the migration bridge, not the desired final topology:

- different GHCR images;
- different Deployment and Service names;
- different build contexts and workflows;
- different secrets and environment variables;
- different resource requests and limits;
- different startup, probe, data-source, MLflow, and vector-store behavior.

Legacy production uses materially larger resource limits than MEED. MEED has additional MLflow, S3 legal-data, report-concurrency, upstream retry, and source-selection configuration. A final single Deployment will require deliberate consolidation of secrets, resource sizing, scaling, rollout, observability, startup behavior, and rollback. These concerns explain why the unified service should be introduced beside the current services and validated before cutover.

### Which deployment option is best?

| Option | Assessment |
|---|---|
| One HIAP microservice with country adapters | Recommended final target. One canonical endpoint receives an explicit country/variant flag and dispatches to the selected adapter. |
| Side-by-side unified service and existing Deployments | Recommended migration topology. Keeps current services available for comparison and rollback while consumers move gradually. |
| Shared internal library/package with separate long-term services | Useful intermediate extraction strategy, but not the desired final operating model if it preserves one microservice per country. Start inside the monorepo and use it to build the unified service. |

### What is the smallest shared core?

The smallest defensible core contains:

- `CityContext` and emissions/activity context;
- `RankableItem` with stable identity, display metadata, type, and provenance;
- `ScoreVector` for named pillar/component scores;
- `ScoringPolicy` for weights, ranking levels, top-N, and missing-data policy;
- `FilterDecision` with eligibility, reason, and evidence;
- `RankingResult` with ordered identities, rank semantics, scores, and evidence;
- `RunMetadata` with source versions, configuration, timing, and reproducibility data;
- deterministic weight validation, score aggregation, tie-breaking, evidence, and provenance helpers.

The core must support action, transition-element outcome, shift, intervention, and future adaptation items. It must not own HTTP routes, S3 keys, upstream URLs, partner taxonomy, prompts, LLM selection, task storage, or country-specific policy.

### What is the migration path?

1. Freeze representative legacy and MEED characterization fixtures.
2. Define shared contracts and conformance tests without changing public APIs.
3. Extract or wrap the MEED deterministic kernel behind the contracts.
4. Stand up the unified service beside the current services with explicit country/variant routing.
5. Add legacy and MEED adapters while preserving their current ranking semantics.
6. Add explicit one-level and two-level ranking primitives.
7. Prototype Brazil v3 as a country adapter with offline/shadow evaluation.
8. Migrate consumers gradually and retire old services only after parity, operational, and rollback gates pass.

### What are the main trade-offs?

One service reduces repeated package maintenance and infrastructure duplication, which is the main stakeholder benefit. It also increases the shared failure domain and couples resource, rollout, and dependency management. Country adapters, explicit routing, source/version metadata, per-variant configuration, fixtures, canarying, and rollback paths are required to control that risk.

Separate deployments retain infrastructure duplication but provide the safe migration bridge and rollback boundary. They should not become the permanent default if the goal is one service to maintain.

### What does this mean for regions and divergent methodologies?

Regional and partner-owned data should enter through adapters with explicit source versions, provenance, configuration, and ownership. The kernel should model ranking and scoring mechanics, not decide which country taxonomy, risk index, financing model, or policy source is authoritative.

The exact Chile and Brazil pillar attachment rules remain open. Chile may rank outcomes at one level; Brazil may rank shifts and interventions at two levels. The shared orchestration contract must support both without pretending that their scores have identical meaning. Country-specific formulas and functions remain valid inside adapters/configuration.

## Validation and rollback gates

Before any implementation changes production behavior:

1. **Contract gate:** adapters serialize/deserialize without losing identity, provenance, or required evidence.
2. **Behavior gate:** legacy and MEED outputs stay within an agreed difference budget, or every difference has an intentional explanation.
3. **Data gate:** mock/live adapters agree on normalized shapes, missing-data behavior, source metadata, and error classification.
4. **Operational gate:** independent services pass health, startup, load, concurrency, and observability checks.
5. **Canary gate:** new package/adapter versions run in shadow or canary mode first.
6. **Rollback gate:** previous image, package version, route, and configuration can be restored without mutating source data.

## Rough impact

These ranges are planning guidance, not an implementation estimate.

| Area | Impact | Main work |
|---|---|---|
| Shared contracts/kernel | Medium | Package, protocols, result types, evidence, provenance, and conformance fixtures |
| MEED integration | Medium | Map existing typed models, scoring blocks, clients, and artifacts |
| Legacy integration | Medium-high | Normalize raw/camelCase data, preserve async/task behavior, and isolate ranking strategy |
| Brazil v3 | High/uncertain | Define taxonomy, sources, multi-level ranking, adaptation, and financing semantics |
| Unified service with country adapters | Medium-high | New routing boundary, adapter wiring, contract compatibility, and unified operational controls |
| Side-by-side migration deployments | Low-medium | New service rollout, CI/package wiring, fixtures, traffic migration, and rollback support |
| Single long-term service plus retired old deployments | Medium after migration | Decommission images, Deployments, workflows, secrets, and compatibility routes only after migration gates |

## Open decisions

- Who owns the canonical OEF methodology-kernel specification?
- Which `RankableItem` fields are mandatory, and which remain adapter metadata?
- Should legacy plan creation consume the shared package or remain a separate workflow?
- What are approved sources and owners for Chile outcomes and Brazil shifts/interventions?
- What ranking difference budget is acceptable during shadow migration?
- Should the first shared package remain monorepo-internal or be independently versioned?
- Which operational metrics and migration gates authorize retiring the old country deployments?
- Should compatibility endpoint paths be retained permanently or only during migration?

## Source map

- Legacy entrypoint: `hiap/app/main.py`
- Legacy API: `hiap/app/prioritizer/api.py`
- Legacy prioritization worker: `hiap/app/prioritizer/tasks.py`
- Legacy ranking helpers: `hiap/app/prioritizer/utils/tournament.py`, `ml_comparator.py`
- Legacy plan creators: `hiap/app/plan_creator_bundle/`
- MEED API: `hiap-meed/app/modules/prioritizer/api.py`
- MEED internal models: `hiap-meed/app/modules/prioritizer/internal_models.py`
- MEED orchestrator: `hiap-meed/app/modules/prioritizer/orchestrator.py`
- MEED scoring: `hiap-meed/app/modules/prioritizer/blocks/`, `scoring_config.py`
- MEED data clients: `hiap-meed/app/services/data_clients.py`
- MEED LLM configuration: `hiap-meed/llm_config.yaml`, `app/config/llm_settings.py`
- MEED service architecture: `hiap-meed/docs/service-architecture.md`
- Prior art: `hiap-meed/docs/methodology-variants-and-migration.md`
- Stakeholder direction: Mirco 1:1, 2026-09-10; transcript supplied in CC-720 work context
- Deployments: `hiap/k8s/`, `hiap-meed/k8s/`
- CI workflows: `.github/workflows/hiap-*.yml`, `.github/workflows/hiap-meed-*.yml`
