# HIAP-MEED

`hiap-meed` is a synchronous FastAPI service that implements the MEED prioritization pipeline. It sits between the CityCatalyst frontend and the upstream Global API, fetching city context and action data before running a configurable scoring pipeline.

See [`docs/service-architecture.md`](docs/service-architecture.md) for the full system diagram.
See [`docs/prioritization-accuracy-initial-benchmark.md`](docs/prioritization-accuracy-initial-benchmark.md) for the planned validation mechanism of ranking quality.
See [`docs/mlflow-backend-logging-guide.md`](docs/mlflow-backend-logging-guide.md) for the current CityCatalyst pattern for backend MLflow runs, traces, and artifact logging.

## Repository layout

```text
hiap-meed/
  app/                 # FastAPI application code
  tests/               # Integration tests
  docs/                # Architecture and implementation docs
  Dockerfile           # Container image definition
  pyproject.toml       # Dependency source of truth (uv)
  uv.lock              # Locked dependencies (uv)
  .env.example         # Sample required environment variables
```

## Getting started

### 1. Configure the environment

Create `.env` from `.env.example` and set values:

```bash
cp .env.example .env
```

Recommended values for the standard hosted dev setup:

```env
API_HOST=0.0.0.0
API_PORT=8000
LOG_LEVEL=INFO
LOG_DIR=logs
LOCAL_ARTIFACTS_ENABLED=true
MLFLOW_ENABLED=true
MLFLOW_TRACKING_URI=https://mlflow-dev.openearth.dev
MLFLOW_EXPERIMENT_NAME=hiap-meed
MLFLOW_ENVIRONMENT=dev
MLFLOW_HTTP_REQUEST_TIMEOUT=3
MLFLOW_HTTP_REQUEST_MAX_RETRIES=1
MLFLOW_HTTP_REQUEST_BACKOFF_FACTOR=1
MLFLOW_HTTP_REQUEST_BACKOFF_JITTER=0
GIT_PYTHON_REFRESH=quiet
MLFLOW_ASYNC_LOGGING_ENABLED=true
HIAP_MEED_MLFLOW_TOOL_TRACE_TEST_ENABLED=false
HIAP_MEED_MLFLOW_TOOL_TRACE_TEST_MODEL=gpt-5.4-mini
HIAP_MEED_CITY_DATA_SOURCE=api
CCGLOBAL_API_BASE_URL=https://ccglobal.openearth.dev
UPSTREAM_HTTP_TIMEOUT_SECONDS=30
UPSTREAM_HTTP_MAX_RETRIES=2
UPSTREAM_HTTP_RETRY_BACKOFF_SECONDS=0.5
HIAP_MEED_LEGAL_DATA_SOURCE=api
HIAP_MEED_ACTION_PATHWAYS_DATA_SOURCE=api
HIAP_MEED_ACTION_POLICY_SCORES_DATA_SOURCE=api
HIAP_MEED_ACTION_MITIGATION_FEASIBILITY_SCORES_DATA_SOURCE=api
HIAP_MEED_ACTION_FINANCIAL_FEASIBILITY_SCORES_DATA_SOURCE=api
HIAP_MEED_TOP_N=20
ACTIVITY_DATA_LEVEL_MAPPING=false
OPENAI_API_KEY=
```

Variables:

- `API_HOST`: server bind host (default `0.0.0.0`)
- `API_PORT`: server bind port (default `8000`)
- `LOG_LEVEL`: Python logging level (for example `DEBUG`, `INFO`)
- `LOG_DIR`: output folder for `app.log` and optional local request artifacts
- `LOCAL_ARTIFACTS_ENABLED`: if `true`, writes per-request artifact files under `LOG_DIR/requests/...`
- `MLFLOW_ENABLED`: if `true`, enables best-effort MLflow run, direct artifact, and OpenAI trace logging
- `MLFLOW_TRACKING_URI`: MLflow tracking server URL. The standard default is the hosted dev MLflow at `https://mlflow-dev.openearth.dev`. Override it to `http://mlflow:5000` only when running the fully local Docker Compose stack, or to `http://localhost:5000` when using `kubectl port-forward`.
- `MLFLOW_EXPERIMENT_NAME`: MLflow experiment name used for all hiap-meed runs
- `MLFLOW_ENVIRONMENT`: environment tag attached to MLflow runs (use `dev`, `test`, or `prod`)
- `MLFLOW_HTTP_REQUEST_TIMEOUT`: MLflow client HTTP timeout in seconds. Keep this low, for example `3`, so bad or unreachable tracking URLs fail fast instead of blocking startup or the first traced request for minutes.
- `MLFLOW_HTTP_REQUEST_MAX_RETRIES`: number of extra MLflow HTTP retry attempts after the initial failure. Keep this low, for example `1`, so unreachable tracking URLs do not delay startup or requests for several minutes.
- `MLFLOW_HTTP_REQUEST_BACKOFF_FACTOR`: MLflow retry backoff multiplier. A value like `1` keeps the delay between retry attempts short and predictable.
- `MLFLOW_HTTP_REQUEST_BACKOFF_JITTER`: extra random delay added between MLflow retry attempts. Set this to `0` when you want deterministic fail-fast behavior during local testing.
- `GIT_PYTHON_REFRESH`: set to `quiet` to suppress mlflow related GitPython warnings when the `hiap-meed` process or `hiap-meed` container does not have a `git` executable; this only silences the warning and does not restore Git SHA capture
- `MLFLOW_ASYNC_LOGGING_ENABLED`: if `true`, MLflow tags, params, and metrics use async fluent logging; run open/close and artifact uploads remain synchronous
- `HIAP_MEED_MLFLOW_TOOL_TRACE_TEST_ENABLED`: if `true`, exposes one test-only endpoint that forces a simple OpenAI tool-calling flow for MLflow tracing checks
- `HIAP_MEED_MLFLOW_TOOL_TRACE_TEST_MODEL`: model used only by the removable MLflow tool-call trace endpoint
- `HIAP_MEED_CITY_DATA_SOURCE`: city input source (`api` or `mock`)
- `CCGLOBAL_API_BASE_URL`: shared Global API base host for upstream API-backed clients (default `https://ccglobal.openearth.dev` for local/dev)
- `UPSTREAM_HTTP_TIMEOUT_SECONDS`: shared timeout in seconds for upstream HTTP API calls (default `30`)
- `UPSTREAM_HTTP_MAX_RETRIES`: shared retry count for transient upstream HTTP failures (default `2`)
- `UPSTREAM_HTTP_RETRY_BACKOFF_SECONDS`: fixed sleep between upstream HTTP retry attempts (default `0.5`)
- `HIAP_MEED_LEGAL_DATA_SOURCE`: legal input source (`api` or `mock`)
- `HIAP_MEED_ACTION_PATHWAYS_DATA_SOURCE`: action catalog source (`api` or `mock`)
- `HIAP_MEED_ACTION_POLICY_SCORES_DATA_SOURCE`: action policy scores input source (`api` or `mock`)
- `HIAP_MEED_ACTION_MITIGATION_FEASIBILITY_SCORES_DATA_SOURCE`: mitigation feasibility scores input source (`api` or `mock`)
- `HIAP_MEED_ACTION_FINANCIAL_FEASIBILITY_SCORES_DATA_SOURCE`: climate-finance feasibility scores input source (`api` or `mock`)
- `HIAP_MEED_TOP_N`: default number of ranked actions to return per city (default `20`)
- `ACTIVITY_DATA_LEVEL_MAPPING`: guarded future Impact mapping switch; `false` keeps true subsector-only matching, `true` calls the current stub and still returns subsector-only results
- `OPENAI_API_KEY`: API key used by OpenAI-backed features

LLM-specific non-secret settings now live in `llm_config.yaml`, including:

- `models.alignment_other_preference`
- `models.free_text_exclusions`
- `models.explanations`
- `models.explanation_translations`
- `features.free_text_exclusions_enabled`
- `features.explanations_enabled`
- `openai.timeout_seconds`
- `openai.max_retries`

When `MLFLOW_ENABLED=true`, the service best-effort logs request runs, direct request artifacts, and OpenAI traces to the configured MLflow server. MLflow initialization is lazy and happens only when a request enters an MLflow-backed run. If MLflow is down or unreachable, the API still completes normally and only emits warning logs. The MLflow client retries initialization on later requests after a fixed 60-second cooldown so transient failures do not disable logging for the lifetime of the worker.

If the `hiap-meed` process or `hiap-meed` container that writes to MLflow does not have `git` installed, MLflow's GitPython integration may warn that Git SHA metadata is unavailable. This warning is about the MLflow client side in `hiap-meed`, not the MLflow server container. Setting `GIT_PYTHON_REFRESH=quiet` suppresses that warning. It does not install `git` or restore Git SHA capture; it only keeps logs quieter.

Current MLflow sync vs async behavior:

- request run lifecycle stays synchronous so runs still open and close deterministically
- tags, params, and metrics use MLflow async fluent logging when `MLFLOW_ASYNC_LOGGING_ENABLED=true`
- JSON and text artifact uploads stay synchronous because this helper path does not yet use a separate background queue

Test-only MLflow tool trace endpoint:

- `POST /v1/mlflow/trace-test/tool-calls` is intentionally isolated from the prioritization flow and exists only to inspect MLflow traces for OpenAI tool use
- it is disabled by default and returns `404` unless `HIAP_MEED_MLFLOW_TOOL_TRACE_TEST_ENABLED=true`
- the endpoint exposes exactly two local tools to the LLM: `add_numbers` and `reverse_text`
- the endpoint logs one dedicated MLflow run named `mlflow_tool_trace_test_request` plus one MLflow JSON artifact containing the response payload
- the endpoint is designed to be easy to remove later because all code lives under `app/modules/mlflow_trace_test/`

Example test request:

```bash
curl -X POST http://localhost:8000/v1/mlflow/trace-test/tool-calls \
  -H "Content-Type: application/json" \
  -d "{\"left_number\": 2, \"right_number\": 3, \"text_to_reverse\": \"climate\"}"
```

MLflow tagging notes:

- `MLFLOW_EXPERIMENT_NAME` groups runs by service, for example `hiap-meed`
- `MLFLOW_ENVIRONMENT` controls the run tag used to distinguish `dev`, `test`, and `prod` while all three write to the same hosted MLflow instance
- if `MLFLOW_ENVIRONMENT` is unset, the current implementation defaults it to `dev`

MLflow usage modes:

- Standard default: keep `MLFLOW_TRACKING_URI=https://mlflow-dev.openearth.dev` and write traces/artifacts to the shared hosted MLflow for all environments.
- Fully local fallback: run `docker compose up --build` and override `MLFLOW_TRACKING_URI=http://mlflow:5000`.
- Laptop + Kubernetes fallback: port-forward MLflow locally and override `MLFLOW_TRACKING_URI=http://localhost:5000`.

### 2. Install dependencies

From the `hiap-meed` directory:

```bash
uv sync
```

### 3. Run the API locally

You have two local options:

- Standard path: run `hiap-meed` while keeping `.env` pointed at the hosted dev MLflow
- Fully local path: use Docker Compose to run both `hiap-meed` and MLflow together on the same Docker network

Standard path:

- Keep the `.env` default `MLFLOW_TRACKING_URI=https://mlflow-dev.openearth.dev`
- Start the app with your preferred local workflow, for example `uv run fastapi dev app/main.py` or plain Docker
- Use the hosted MLflow UI at `https://mlflow-dev.openearth.dev`

Fully local Docker Compose path:

```text
docker compose up --build
```

This local-only mode requires overriding `MLFLOW_TRACKING_URI=http://mlflow:5000` because `hiap-meed` and MLflow talk over the compose network.

Plain Docker:

```text
docker build -t hiap-meed .
docker run -it --rm -p 8000:8000 --env-file .env hiap-meed
```

To persist file logs and per-request artifacts on your machine under `logs/`
including `logs/requests/`, bind-mount the host logs directory to
`/app/logs` in the container. This matches the default `LOG_DIR=logs`.

Bash / Git Bash:

```text
docker run -it --rm -p 8000:8000 --env-file .env -v "$(pwd)/logs:/app/logs" hiap-meed
```

`cmd.exe`:

```text
docker run -it --rm -p 8000:8000 --env-file .env -v "%cd%\logs:/app/logs" hiap-meed
```

If you change `LOG_DIR` in `.env`, adjust the container target path so it
still matches `/app/<LOG_DIR>`.

Plain Docker without a bind mount is still valid, but then logs stay only
inside the container and disappear when the container exits.

```text
docker run -it --rm -p 8000:8000 --env-file .env hiap-meed
```

For plain Docker, keep the hosted default `https://mlflow-dev.openearth.dev` unless you intentionally want one of these overrides:

- fully local Compose-style MLflow: `MLFLOW_TRACKING_URI=http://mlflow:5000`
- port-forwarded Kubernetes MLflow: `MLFLOW_TRACKING_URI=http://localhost:5000`

Verify the service:

- Health check: `curl http://localhost:8000/health`
- OpenAPI docs: `http://localhost:8000/docs`
- Standard MLflow UI: `https://mlflow-dev.openearth.dev`
- Local Compose MLflow UI: `http://localhost:5000`
- Prioritization endpoint: `POST /v1/prioritize`
- Explanation translation endpoint: `POST /v1/explanations/translate`
- Exclusion preview endpoint: `POST /v1/prioritize/exclusions/preview`

For deployed workloads, use the hosted MLflow URLs directly.

Example Kubernetes values:

- dev cluster service:
  - `MLFLOW_TRACKING_URI=https://mlflow-dev.openearth.dev`
  - `MLFLOW_EXPERIMENT_NAME=hiap-meed`
  - `MLFLOW_ENVIRONMENT=dev`
- test workload on the same dev cluster:
  - `MLFLOW_TRACKING_URI=https://mlflow-dev.openearth.dev`
  - `MLFLOW_EXPERIMENT_NAME=hiap-meed`
  - `MLFLOW_ENVIRONMENT=test`
- prod workload:
  - `MLFLOW_TRACKING_URI=https://mlflow-dev.openearth.dev`
  - `MLFLOW_EXPERIMENT_NAME=hiap-meed`
  - `MLFLOW_ENVIRONMENT=prod`

### External API contracts

The repository now includes explicit Pydantic contracts for upcoming request and
upstream response integrations in `app/modules/prioritizer/models.py`.

Key models:

- Frontend request envelope: `PrioritizerApiRequest`
- Frontend city input row: `FrontendCityInput`
- Global city API response: `CityApiResponse`
- Global action pathways API response: `ActionPathwaysApiResponse`
- Global legal assessment API row: `ActionLegalAssessmentApiItem`
- Global policy alignment API response: `ActionPolicyScoresApiResponse`

Design note:

- For the upcoming frontend contract, single-city and multi-city payloads both
  use `cityDataList`; single-city is represented as a list with one item.
- Boundary validation note: incoming frontend request contracts and upstream/mock
  response contracts are handled differently by design. Frontend request DTOs
  reject unexpected fields, while upstream response DTOs ignore unexpected extra
  fields and still validate the fields we actually use.
- Action API note: `ActionPathwaysApiResponse` now matches `GET /api/v1/action-pathways`
  without query parameters. The action payload includes the fields used by the
  current prioritization flow and action-pathways client.
  The action client returns the full upstream catalog; the prioritization
  pipeline then keeps only mitigation actions and records the filtered count in
  fetch artifacts.
- Current implementation note: exclusion preview and prioritization are separate flows. Exclusion preview resolves raw exclusion preferences into proposals for review, while prioritization consumes confirmed `excludedActionIds`. Prioritization uses a dedicated orchestrator for run-level artifact writing, while exclusion preview currently writes its request artifacts directly from the API layer.

### 4. Call the prioritization endpoint

Run commands from a Bash shell (Git Bash, WSL, Linux, macOS).

Request body:

- The endpoint accepts the frontend envelope `PrioritizerApiRequest` (see `app/modules/prioritizer/models.py`).
- Single-city and multi-city payloads both use `requestData.cityDataList`.
- Optional flag: `requestData.createExplanations` controls whether the post-ranking
  explanation stage is executed.
- `requestData.requestedLanguages` controls which explanation languages the backend attempts to return.
- Canonical explanation generation is always English.
- If non-English languages are requested, the backend generates English once and then translates from English into each requested target language.
- Response metadata reports `generated_languages` as the languages actually present in the returned explanation payload.

Exclusions:

- Exclusion preferences are previewed before ranking with `POST /v1/prioritize/exclusions/preview`.
- Preview input per city accepts `excludedSectorTags`, `excludedCoBenefitKeys`, and `excludedActionsFreeText`.
- `excludedSectorTags` must use only:
  - `stationary_energy`
  - `transportation`
  - `waste`
  - `ippu`
  - `afolu`
- `excludedCoBenefitKeys` must use only:
  - `air_quality`
  - `cost_of_living`
  - `habitat`
  - `housing`
  - `mobility`
  - `stakeholder_engagement`
  - `water_quality`
- Sector exclusions are deterministic from action sector metadata.
- Co-benefit exclusions are deterministic and propose actions where a selected co-benefit has negative `impact_numeric`.
- Free-text exclusions run only in the preview endpoint and only when `features.free_text_exclusions_enabled=true` and `models.free_text_exclusions.name` is configured in `llm_config.yaml`. The resolver keeps exact catalog action IDs only for clear matches and returns warnings for disabled, unmatched, or ambiguous input.
- When the free-text resolver returns unknown IDs, ambiguous matches, or blank reasons, the backend drops those rows, logs aggregate drop counts, stores dropped-row diagnostics in preview artifacts, and returns compact warnings to the frontend.
- Ranking accepts `excludedActionIds` per city. These confirmed IDs are authoritative; `/v1/prioritize` does not reinterpret raw exclusion preferences.
- `cityStrategicPreferenceSectors` on the ranking request must also use only:
  - `stationary_energy`
  - `transportation`
  - `waste`
  - `ippu`
  - `afolu`

Legal filtering:

- The hard filter now uses `verdictCategory` from `GET /api/v1/action-legal-assessments`.
- Actions with `verdictCategory="blocked"` are discarded before scoring.
- Missing `verdictCategory` does not hard-filter the action.
- The Feasibility legal component uses `verdictScore` directly.
- Missing `verdictScore` falls back to neutral `0.5`.

Score normalization policy:

- Each block computes named component values in `0..1`.
- Each block applies explicit internal weights that sum to `1.0`.
- Block score is the canonical weighted sum of those components (no run-relative max-normalization).
- For normalized components in this system, `0.5` is the neutral midpoint when a component is designed around beneficial vs harmful effects.
  - Example: the Alignment other-preference co-benefit component and missing Feasibility legal, mitigation, or financial rows use `0.5` as neutral.
  - By contrast, some one-sided components use `0.0` as the natural baseline because they measure absence of support rather than harmful effect, such as missing policy support or no preferred-sector match.

Impact block behavior (implemented):

- Impact reads action emissions targeting from `emissions`, including:
  - `sector_number`
  - `subsector_number` (**list** of subsector integers, even when only one subsector is covered)
  - `gpc_reference_number` (**list** of GPC refs in the mock/API schema)
  - `impact_text` (`very low`, `low`, `medium`, `high`, `very high`)
- Impact reads city emissions from the frontend request:
  - `requestData.cityDataList[].cityEmissionsData.gpcData[*].activities[*].activityType`
  - `requestData.cityDataList[].cityEmissionsData.gpcData[*].activities[*].totalEmissions`
  - The service normalizes each outer GPC key to `sector.subsector` and sums activity emissions at that true subsector level before scoring.
- `gpc_reference_number` remains stored as passive reference data, but the active Impact join now uses `sector_number + subsector_number[]`.
- `coBenefits[*]` now only carry co-benefit impact metadata (`impact_numeric`, optional relationship/text/methodology). They do not carry sector or GPC targeting fields.
- `ACTIVITY_DATA_LEVEL_MAPPING=false` keeps the new true subsector matching path.
- `ACTIVITY_DATA_LEVEL_MAPPING=true` calls the current activity-data stub, logs `not implemented`, and still returns the same subsector-level result.
- Negative `V.*` AFOLU inventory values remain valid request data, and Impact now scores them by absolute magnitude.
  - Matching for Impact uses `abs(totalEmissions)` for AFOLU `V.*`.
  - The reduction-share denominator also includes `abs(totalEmissions)` for AFOLU `V.*`.
  - Non-AFOLU subsectors still contribute only when the city inventory value is strictly positive.
  - This is intentional so AFOLU removals are not ignored, while non-AFOLU negative values still do not affect Impact scoring.
  - Net city emissions remain signed and can be negative, but the Impact denominator is a separate ranking-only metric.
  - In other words, Impact is not asking "what share of the city's net emissions could this action affect?"
  - It is asking something closer to "what share of the city's total climate-relevant emissions magnitude could this action affect?"
- Impact computes canonical score as:
  - `0.80 * reduction_share_of_city_emissions + 0.20 * timeline_score`
  - Timeline mapping: `<5 years -> 1.0`, `5-10 years -> 0.5`, `>10 years -> 0.0`, missing or unknown timeline `-> 0.5`
- Unknown `impact_text` values are rejected with `422` (raised during Impact scoring and surfaced by the API error handler).

Alignment block behavior (implemented):

- Alignment also reads `requestData.cityDataList[].cityStrategicPreferenceTimeframes` and compares it against each action's `timelineForImplementation`.
- `requestData.cityDataList[].cityStrategicPreferenceSectors[]` is validated against the same five supported sector tags used by the exclusion preview API.
- Allowed request values are `short`, `medium`, `long`, and `no_preference`.
- `no_preference` is mutually exclusive with the other values and is treated as a neutral `0.5` score across all actions.
- Multiple selected timeframes use the best match across selections, with `1.0` for exact match, `0.5` for adjacent, and `0.0` for far mismatch.
- Missing or unknown action timelines are treated as neutral `0.5` for this alignment component.
- Alignment now uses weights: `policy=0.75`, `sector=0.15`, `other=0.05`, `timeframe=0.05`.
- Alignment reads `requestData.cityDataList[].cityStrategicPreferenceCoBenefitKeys` directly from the request.
- The mapping output is constrained to the current action-catalog taxonomy:
  - `air_quality`, `cost_of_living`, `habitat`, `housing`, `mobility`, `stakeholder_engagement`, `water_quality`
- Other-preference scoring:
  - Only co-benefits selected by the city are scored.
  - The denominator is the city's resolved preferred co-benefit set for that request.
  - Each selected co-benefit reads the action's `impact_numeric` value in `-2..2`.
  - Upstream action payload validation enforces `coBenefits[*].impact_numeric` in `[-2, 2]` and rejects out-of-range values.
  - Missing co-benefit keys on the action are treated as `0`.
  - Co-benefits present on the action but not selected by the city do not affect this component.
  - The summed selected impacts are normalized into `0..1`, where `0.5` is neutral.
- With no selected co-benefit keys, Alignment uses a neutral `other_component_value = 0.5`.

Response fields:

- `results` (`array`): one entry per requested city.
  - `locode` (`string`)
  - `ranked_action_ids` (`string[]`): ordered action IDs.
  - `ranked_actions` (`array`): public ranking payload with one item per returned action.
    - `action_id` (`string`)
    - `rank` (`int`) uses competitive ranking (`1,2,2,4`) by `final_score` over the returned top-N slice
    - `final_score` (`float`)
    - `impact_score` (`float`)
    - `alignment_score` (`float`)
    - `feasibility_score` (`float`)
    - `evidence_summary` (`object`): compact explainability snapshot from hard-filter/impact/alignment/feasibility evidence; the feasibility section now keeps `feasibility_score` at the top level and groups details under `legal`, `mitigation_feasibility`, and `financial_feasibility`
    - `explanations` (`object`): optional explanation texts keyed by language code when `createExplanations=true`
  - `metadata` (`object`): request IDs, timings, counts, and hard-filter evidence.
  - `warnings` (`string[]`): human-readable translation warnings when canonical English inputs appear non-English or mixed-language

Ranking details:

- Top-N selection is deterministic and uses this sort order:
  1. `final_score` desc
  2. tie-break by pillar scores in descending weight priority
  3. `action_id` asc as the final fallback
- Ranks are assigned after top-N truncation using competitive ranking (`1,2,2,4`).

Explanation stage behavior:

- Explanations are generated only when `requestData.createExplanations=true`.
- Explanations are generated from post-ranking evidence and do not change ranks.
- Explanations are always authored canonically in English.
- Requested non-English explanations are translations of the canonical English text.
- In response metadata, `generated_languages` is the response-level union of explanation languages actually returned across `ranked_actions[].explanations`.
- Explanations receive the selected `cityStrategicPreferenceCoBenefitKeys` directly.
- If translation detects that a canonical explanation labeled as English appears non-English or mixed-language, translation still returns results and adds a warning to logs and the API response.
- That language-check warning is determined internally per action, then aggregated by the backend into the public top-level `warnings` list returned by the API.
- The backend logs a warning if the final explanation prompt becomes unusually large.
- If explanation generation fails or times out, the endpoint fails open and
  returns normal ranking output with `explanations={}`.

### 5. Call the explanation translation endpoint

- The endpoint accepts the frontend envelope `ExplanationTranslationApiRequest`.
- `requestData.sourceLanguage` must be `en`.
- `requestData.targetLanguages` must contain only non-English target languages.
- `requestData.rankedActions[*]` includes:
  - `actionId`
  - `canonicalExplanation`
- The endpoint is stateless: the frontend sends the canonical English explanations it wants translated.
- The endpoint returns only the requested target-language translations, not the original English text.

Example JSON request bodies (using mock data from `data/`):

```json
{
  "meta": {
    "requestId": "1234567890",
    "generatedAtUtc": "2026-02-26T11:43:40.011939+00:00",
    "backendConsumer": "hiap-meed",
    "upstreamProvider": "city_catalyst_frontend",
    "apiContext": {
      "endpoint": "POST /v1/prioritize/exclusions/preview",
      "locodes": ["CL IQQ"]
    },
    "totalRecords": 1
  },
  "requestData": {
    "requestedLanguages": ["en"],
    "topN": 20,
    "createExplanations": false,
    "cityDataList": [
      {
        "locode": "CL IQQ",
        "excludedSectorTags": ["waste"],
        "excludedCoBenefitKeys": ["air_quality"],
        "excludedActionsFreeText": "Do not include new fossil fuel-based infrastructure"
      }
    ]
  }
}
```

Example exclusion preview response:

```json
{
  "results": [
    {
      "locode": "CL IQQ",
      "proposedExcludedActions": [
        {
          "actionId": "c40_0029",
          "actionName": "Waste-to-energy plant",
          "reasons": ["Action belongs to excluded sector(s): waste"],
          "matchedBy": ["sector"]
        }
      ],
      "exclusionSummary": {
        "totalProposed": 1,
        "byReasonType": {
          "sector": {
            "count": 1,
            "actionIds": ["c40_0029"]
          }
        }
      },
      "warnings": []
    }
  ]
}
```

Example ranking request after review:

```json
{
  "meta": {
    "requestId": "1234567890",
    "generatedAtUtc": "2026-02-26T11:43:40.011939+00:00",
    "backendConsumer": "hiap-meed",
    "upstreamProvider": "city_catalyst_frontend",
    "apiContext": {
      "endpoint": "POST /v1/prioritize",
      "locodes": ["CL IQQ"]
    },
    "totalRecords": 1
  },
  "requestData": {
    "requestedLanguages": ["en"],
    "topN": 20,
    "createExplanations": false,
    "cityDataList": [
      {
        "locode": "CL IQQ",
        "countryCode": "CL",
        "populationSize": 125000,
        "excludedActionIds": ["c40_0029"],
        "cityStrategicPreferenceSectors": ["transportation"],
        "cityStrategicPreferenceTimeframes": ["short", "medium"],
        "cityStrategicPreferenceCoBenefitKeys": ["air_quality", "mobility"],
        "cityEmissionsData": {
          "inventoryYear": null,
          "gpcData": {}
        }
      }
    ]
  }
}
```

Example response:

```json
{
  "results": [
    {
      "locode": "CL IQQ",
      "ranked_action_ids": ["c40_0010", "c40_0030"],
      "ranked_actions": [
        {
          "action_id": "c40_0010",
          "rank": 1,
          "final_score": 0.744,
          "impact_score": 0.88,
          "alignment_score": 0.62,
          "feasibility_score": 0.59,
          "evidence_summary": {
            "impact": {
              "impact_block_score": 0.88,
              "matched_city_subsector_keys_count": 1
            },
            "feasibility": {
              "feasibility_score": 0.59,
              "legal": {
                "component_score": 0.5,
                "component_source": "neutral_fallback"
              },
              "mitigation_feasibility": {
                "component_score": 0.78,
                "component_source": "action_mitigation_feasibility_score"
              },
              "financial_feasibility": {
                "component_score": 0.6,
                "route": "needs technical assistance",
                "reason": "Capacity is the constraint, not money; needs technical assistance."
              }
            }
          },
          "explanations": {}
        }
      ],
      "warnings": [],
      "metadata": {
        "internal_request_id": "d1db6269-4cf9-4d62-8f4c-8f4ce631fbd2",
        "frontend_request_id": "1234567890",
        "locode": "CL IQQ",
        "weights": {
          "impact": 0.55,
          "alignment": 0.22,
          "feasibility": 0.23
        },
        "timings": {
          "fetch_city": 0.001,
          "fetch_actions": 0.001,
          "validate_weights": 0.0,
          "hard_filter": 0.0,
          "impact": 0.0,
          "alignment": 0.0,
          "feasibility": 0.0,
          "final_scoring": 0.0
        },
        "counts": {
          "total_actions": 2,
          "valid_actions": 2,
          "discarded_excluded": 0,
          "discarded_legal": 0,
          "ranked_actions": 2
        }
      }
    }
  ]
}
```

Common validation errors:

- Missing request body -> HTTP `422`.
- Missing `requestData.cityDataList` or empty `cityDataList` -> HTTP `422`.
- Missing `locode` or empty `locode` in a city entry -> HTTP `422`.

Note: city, action, legal, policy-score, mitigation-feasibility, and financial-feasibility clients resolve to `mock` (file-backed) or `api`. The city client uses synchronous HTTP for `GET /api/v0/city_attributes/{locode}`. The action client uses `GET /api/v1/action-pathways` without query parameters and returns the full upstream catalog plus fetch metadata. The prioritization pipeline then keeps only mitigation actions and records fetched-versus-kept counts in the `fetch_actions` artifacts. The legal client uses `GET /api/v1/action-legal-assessments?countryCode=...`. Policy scores use `GET /api/v1/cities/{locode}/action-policy-scores`. Mitigation feasibility uses `GET /api/v1/cities/{locode}/action-mitigation-feasibility-scores?country_code=...`; 404 or missing rows are treated as neutral `0.5` in scoring. Financial feasibility uses `GET /api/v1/cities/{locode}/climate-finance/feasibility?country_code=...`; the first implementation consumes the compact batch evidence only and does not fetch linked named opportunities or projects. These API-backed clients default to `api`. The shared `CCGLOBAL_API_BASE_URL` defaults to `https://ccglobal.openearth.dev` for local/dev use; the hiap-meed GitHub workflows override it per environment, with dev using `https://ccglobal.openearth.dev` and test/prod using `https://api.citycatalyst.io/`. If that host mapping changes, update both the runtime config and the hiap-meed deploy workflows together. The shared upstream HTTP path also includes simple retries for transient failures, explicit timeout config, and route-level `404/502/503/504` error mapping. Upstream response DTOs are intentionally additive-tolerant right now: they ignore unexpected extra fields while still validating the fields the pipeline depends on. FastAPI runs synchronous routes in a threadpool, so the event loop stays free to handle concurrent requests. Legal fetch artifacts intentionally keep `source_metadata.upstream_generated_at_utc = null` because the current legal assessments endpoint does not expose a top-level generated-at field.

### 5. Logging and artifacts

The service writes:

- Console logs (stdout/stderr)
- File logs at `LOG_DIR/app.log`
- Optional local per-request artifacts at:
  - `LOG_DIR/requests/prioritization/{UTC_TIMESTAMP}Z_{internal_request_id}/`
  - `LOG_DIR/requests/exclusion_preview/{UTC_TIMESTAMP}Z_{internal_request_id}/`
- Direct MLflow artifacts on the active request run when `MLFLOW_ENABLED=true`
- Local request artifact folders only when `LOCAL_ARTIFACTS_ENABLED=true`

Fetch-step artifacts record the active data source for each upstream/mock dependency. API-backed fetches include upstream request metadata such as endpoint templates, resolved URLs, request keys, HTTP status codes, and upstream timestamps when available. Mock-backed fetches include the resolved `mock_file_path` plus the relevant request key such as `requested_locode` or `requested_country_code`.

To disable `app.log` file writes (for example, during tests), set `LOG_FILE_ENABLED=false`.

What `app.log` contains:

- Service startup and runtime logs
- Endpoint activity (for example health checks and prioritization completion)
- Validation errors and unexpected exceptions with stack traces
- High-level pipeline milestone logs (fetch counts, hard-filter counts, completion)
- Cross-request aggregated logs (all requests in one rolling file path)

What each local request run folder contains:

- `summary.jsonl`: one JSON line per high-level pipeline event for that request
- `NNN_<step>.json`: concise per-step detail files (fetch, filter, score, response summary)
- Impact step details include true subsector matching diagnostics plus the `ACTIVITY_DATA_LEVEL_MAPPING` flag/stub metadata.
- `response_full.json`: full API response payload for that request
- `input_snapshot.json`: reproducibility-critical request inputs
- `manifest.json`: run-level index of generated files, key counts, and pointers for top-ranked rows vs full evidence files
- Event metadata such as timestamp, request ID, event index, event/step type, and payload
- `request_kind`: included in summary events, detail files, and manifests so artifacts can be filtered by API type
- `event_index` is shared between a summary event and its matching detail file, so `summary.jsonl` and `NNN_<step>.json` are directly pairable
- Timing/count summaries plus request-scoped traceability in a single run directory
- When MLflow is enabled, it uses the same default relative artifact paths as the optional local request folder so both outputs keep one consistent hierarchy
- Prioritization request folders additionally include:
  - `llm/explanations_io.json`: explanation-stage LLM request/response artifact (only when explanations are generated successfully)
  - `llm/explanations_prompt.txt`: plain-text rendered user prompt with preserved newlines (only when explanations are generated successfully)
  - `llm/explanations_error.json`: explanation-stage failure artifact with request context and error (only when explanation generation fails)
  - `llm/explanation_translations_io.json`: translation-stage LLM request/response artifact (only when translations are generated successfully)
  - `llm/explanation_translations_prompt.txt`: plain-text rendered translation prompt (only when translations are generated successfully)
  - `llm/explanation_translations_error.json`: translation-stage failure artifact with request context and error (only when translation fails)
- Prioritization explanation artifacts and response metadata record the original `requestedLanguages`, canonical language `en`, generated languages actually returned in the response, and any translation warnings.
- Explanation translation request folders additionally include:
  - `llm/explanation_translations_io.json`
  - `llm/explanation_translations_prompt.txt`
- Explanation translation artifacts record the source language contract, requested target languages, and any LLM language-check warnings.
- For the direct other-preference feature, the `alignment` step detail includes evidence such as `resolved_preferred_co_benefits`, `matched_preferred_co_benefits`, and mapping source fields
- The active request flow does not emit dedicated LLM prompt/response artifact files for Alignment because direct co-benefit selections are deterministic
- Exclusion preview step-detail artifacts keep the city-level diagnostics, including:
  - the selected exclusion inputs for that city
  - free-text exclusion LLM resolution and validation diagnostics when applicable
  - dropped-row diagnostics for unknown IDs, ambiguous matches, and empty reasons inside the free-text exclusion validation payload
- Current implementation note:
  - prioritization artifacts are assembled from the orchestrator layer
  - exclusion preview artifacts are currently assembled from `api.py`
  - the folder structure is already split by request kind, but the internal ownership is not yet symmetrical

Inspect logs:

```bash
tail -f logs/app.log
```

```bash
ls -1 logs/requests/
```

```bash
ls -1 logs/requests/prioritization/
```

```bash
ls -1 logs/requests/exclusion_preview/
```

Typical per-request artifact events:

- `fetch_city.completed`
- `fetch_actions.completed`
- `fetch_action_policy_scores.completed`
- `validate_weights.completed`
- `hard_filter.completed`
- `pillar_scores.completed`
- `final_scoring.completed`
- `run_summary.completed`
- `response_summary.completed`

### 6. Docker

For local development, the normal path is to keep `hiap-meed` pointed at the hosted dev MLflow. Docker Compose remains available when you want the whole stack, including MLflow, fully local.

Docker Compose:

From the `hiap-meed` directory:

```text
docker compose up --build
```

This starts:

- `hiap-meed` on `http://localhost:8000`
- `mlflow` on `http://localhost:5000`

Before using this path, override `MLFLOW_TRACKING_URI=http://mlflow:5000` in `.env` or the container environment.

The compose file intentionally runs MLflow with permissive `--allowed-hosts "*"` because this setup is for local development only.

The compose file already bind-mounts `./logs` to `/app/logs`, so `app.log` and optional local request artifacts persist on your machine under `logs/`.
MLflow keeps its own SQLite metadata store and artifact store in its own named Docker volume. `hiap-meed` does not share that filesystem; it talks to MLflow only through `MLFLOW_TRACKING_URI`, which is the same tracking API contract used by the hosted MLflow deployment.

If you change `LOG_DIR` in `.env`, update the `hiap-meed` volume mount in `compose.yaml` so it still matches `/app/<LOG_DIR>`.

Plain Docker:

```text
docker build -t hiap-meed .
docker run --rm -p 8000:8000 --env-file .env -v "$(pwd)/logs:/app/logs" hiap-meed
```

Notes for plain Docker:

- keep `LOG_DIR=logs` so the bind mount writes `app.log` and optional local request artifacts into the local `logs/` folder
- if you are writing to the Kubernetes-hosted MLflow from your laptop, use `kubectl port-forward -n default svc/mlflow-service-dev 5000:5000` and set `MLFLOW_TRACKING_URI=http://localhost:5000`
- otherwise, keep the standard hosted value `MLFLOW_TRACKING_URI=https://mlflow-dev.openearth.dev`
- if you change `LOG_DIR`, update the bind mount so it still maps your host log folder to `/app/<LOG_DIR>`

The Docker image includes both `app/` and `data/`, so mock payloads under
`data/mock` are available in-container at `/app/data/mock`.
Data folder needs to be removed once real APIs are available.

If you previously ran the older local setup that shared an MLflow data volume with `hiap-meed`, reset the local MLflow state once before retesting:

```text
docker compose down -v
docker compose up --build
```

## Testing

From the `hiap-meed` directory:

```bash
uv run pytest -c pytest.ini
```
