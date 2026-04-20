# HIAP-MEED

`hiap-meed` is a synchronous FastAPI service that implements the MEED prioritization pipeline. It sits between the CityCatalyst frontend and the upstream Global API, fetching city context and action data before running a configurable scoring pipeline.

See [`docs/service-architecture.md`](docs/service-architecture.md) for the full system diagram.

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

Recommended values:

```env
API_HOST=0.0.0.0
API_PORT=8000
LOG_LEVEL=INFO
LOG_DIR=logs
ARTIFACT_LOG_JSONL=true
HIAP_MEED_CITY_DATA_SOURCE=mock
HIAP_MEED_LEGAL_DATA_SOURCE=mock
HIAP_MEED_ACTION_DATA_SOURCE=mock
HIAP_MEED_POLICY_SIGNALS_DATA_SOURCE=mock
HIAP_MEED_TOP_N=20
HIAP_MEED_ALIGNMENT_OTHER_PREFERENCE_MODEL=
OPENAI_API_KEY=
OPENAI_TIMEOUT_SECONDS=30
OPENAI_MAX_RETRIES=1
```

Variables:

- `API_HOST`: server bind host (default `0.0.0.0`)
- `API_PORT`: server bind port (default `8000`)
- `LOG_LEVEL`: Python logging level (for example `DEBUG`, `INFO`)
- `LOG_DIR`: output folder for file logs and request artifacts
- `ARTIFACT_LOG_JSONL`: if `true`, writes per-request artifact files
- `HIAP_MEED_CITY_DATA_SOURCE`: city input source (`mock` or `api`)
- `HIAP_MEED_LEGAL_DATA_SOURCE`: legal input source (`mock` or `api`)
- `HIAP_MEED_ACTION_DATA_SOURCE`: action catalog source (`mock` or `api`)
- `HIAP_MEED_POLICY_SIGNALS_DATA_SOURCE`: policy-signal input source (`mock` or `api`)
- `HIAP_MEED_TOP_N`: default number of ranked actions to return per city (default `20`)
- `HIAP_MEED_ALIGNMENT_OTHER_PREFERENCE_MODEL`: OpenAI model used for alignment free-text co-benefit mapping
- `OPENAI_API_KEY`: API key used by OpenAI-backed features
- `OPENAI_TIMEOUT_SECONDS`: shared OpenAI client timeout in seconds (default `30`)
- `OPENAI_MAX_RETRIES`: shared OpenAI client retries (default `1`)

### 2. Install dependencies

From the `hiap-meed` directory:

```bash
uv sync
```

### 3. Run the API locally

From the `hiap-meed` directory:

```bash
uv run python -m app.main
```

Verify the service:

- Health check: `curl http://localhost:8000/health`
- OpenAPI docs: `http://localhost:8000/docs`
- Prioritization endpoint: `POST /v1/prioritize`

### External API contracts (modeled, integration pending)

The repository now includes explicit Pydantic contracts for upcoming request and
upstream response integrations in `app/modules/prioritizer/models.py`.

Key models:

- Frontend request envelope: `PrioritizerApiRequest`
- Frontend city input row: `FrontendCityInput`
- Global city API response: `CityApiResponse`
- Global actions API response: `ActionsApiResponse`
- Global legal alignment API response: `ActionsLegalApiResponse`
- Global policy alignment API response: `ActionsPolicySignalsApiResponse`

Design note:

- For the upcoming frontend contract, single-city and multi-city payloads both
  use `cityDataList`; single-city is represented as a list with one item.

### 4. Call the prioritization endpoint

Run commands from a Bash shell (Git Bash, WSL, Linux, macOS).

Request body:

- The endpoint accepts the frontend envelope `PrioritizerApiRequest` (see `app/modules/prioritizer/models.py`).
- Single-city and multi-city payloads both use `requestData.cityDataList`.

Exclusions:

- The frontend provides exclusions as `excludedActionsFreeText` (free text).
- Current behavior: this is a **stub** and does not exclude actions yet (the text is attached to metadata for downstream flagging).

Hard legal requirements:

- The hard filter now enforces legal requirements with `strength` in `mandatory|required`.
- Actions with hard `alignment_status="not_aligned"` are discarded before scoring.
- Actions with hard `alignment_status="no_evidence"` are kept and surfaced in hard-filter evidence.

Score normalization policy:

- Each block computes named component values in `0..1`.
- Each block applies explicit internal weights that sum to `1.0`.
- Block score is the canonical weighted sum of those components (no run-relative max-normalization).

Impact block behavior (implemented):

- Impact reads action emissions targeting from `emissions`, including:
  - `gpc_reference_number` (**list** of GPC refs in the mock/API schema)
  - `impact_text` (`very low`, `low`, `medium`, `high`, `very high`)
- Impact reads city emissions from the frontend request:
  - `requestData.cityDataList[].cityEmissionsData.gpcData[*].activities[*].totalEmissions`
  - The service sums activity emissions per GPC key before scoring.
- Impact computes canonical score as:
  - `0.80 * reduction_share_of_city_emissions + 0.20 * timeline_score`
  - Timeline mapping: `<5 years -> 1.0`, `5-10 years -> 0.5`, `>10 years -> 0.0`
- Unknown `impact_text` values are rejected with `422` (raised during Impact scoring and surfaced by the API error handler).

Alignment block free-text behavior (implemented):

- Alignment maps `requestData.cityDataList[].cityStrategicPreferenceOther` to co-benefit labels using OpenAI structured output parsing.
- The mapping output is constrained to the current action-catalog taxonomy:
  - `air_quality`, `cost_of_living`, `habitat`, `housing`, `mobility`, `stakeholder_engagement`, `water_quality`
- `unmappable_preference_fragments` are captured when user intent cannot be confidently mapped to allowed labels.
- Temporary scoring heuristic (future implementation note):
  - `other_component_value = matched_preferred_co_benefits / total_preferred_co_benefits`
  - This overlap-count scoring is intentionally simple until richer co-benefit scoring semantics are defined.
- Fail-open behavior:
  - blank free-text, model misconfiguration, timeout, or parse failure results in `other_component_value = 0.0` with fallback evidence.

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
    - `evidence_summary` (`object`): compact explainability snapshot from hard-filter/impact/alignment/feasibility evidence
    - `explanation` (`string | null`): reserved placeholder for future LLM-generated explanation text
  - `metadata` (`object`): request IDs, timings, counts, and hard-filter evidence.

Ranking details:

- Top-N selection is deterministic and uses this sort order:
  1) `final_score` desc
  2) tie-break by pillar scores in descending weight priority
  3) `action_id` asc as the final fallback
- Ranks are assigned after top-N truncation using competitive ranking (`1,2,2,4`).

Example JSON request bodies (using mock data from `data/`):

```json
{
  "meta": {
    "requestId": "1234567890",
    "generatedAtUtc": "2026-02-26T11:43:40.011939+00:00",
    "backendConsumer": "hiap-meed",
    "upstreamProvider": "city_catalyst_frontend",
    "apiContext": {
      "endpoint": "POST /prioritizer/v1/start_prioritization",
      "locodes": ["CL IQQ"]
    },
    "totalRecords": 1
  },
  "requestData": {
    "requestedLanguages": ["en"],
    "topN": 20,
    "cityDataList": [
      {
        "locode": "CL IQQ",
        "countryCode": "CL",
        "populationSize": 125000,
        "excludedActionsFreeText": "Do not include new fossil fuel-based infrastructure ...",
        "cityStrategicPreferenceSectors": ["transportation"],
        "cityStrategicPreferenceOther": "Prioritize near-term air quality improvements ...",
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
              "matched_city_gpc_refs_count": 2
            }
          },
          "explanation": null
        }
      ],
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
        },
      }
    }
  ]
}
```

Common validation errors:

- Missing request body -> HTTP `422`.
- Missing `requestData.cityDataList` or empty `cityDataList` -> HTTP `422`.
- Missing `locode` or empty `locode` in a city entry -> HTTP `422`.

Note: city, action, legal, and policy-signal clients now resolve to `mock` (file-backed) or `api` (placeholder until real upstream wiring is added). Default source for all four is `mock`, so local and Docker runs use checked-in mock payloads by default. Real upstream HTTP wiring is still pending; when wired, clients should use a synchronous HTTP client (e.g. `httpx.Client`). FastAPI runs synchronous routes in a threadpool, so the event loop stays free to handle concurrent requests.

Known limitation (mock data):

- The Feasibility socio-economic lookup currently expects city keys like `transport_logistics_employment` and `electricity_access`.
- `actions_api_mock_v2.json` currently uses `employment_in_transport_and_logistics` and `electricity_access_rate` for some `indicator_key` values.
- Until key normalization or aligned naming is implemented, those indicators are treated as missing and contribute `0` in the socio-economic feasibility component.

### 5. Logging and artifacts

The service writes:

- Console logs (stdout/stderr)
- File logs at `LOG_DIR/app.log`
- Per-request artifacts at `LOG_DIR/requests/{UTC_TIMESTAMP}Z_{internal_request_id}/` when `ARTIFACT_LOG_JSONL=true`

To disable `app.log` file writes (for example, during tests), set `LOG_FILE_ENABLED=false`.

What `app.log` contains:

- Service startup and runtime logs
- Endpoint activity (for example health checks and prioritization completion)
- Validation errors and unexpected exceptions with stack traces
- High-level pipeline milestone logs (fetch counts, hard-filter counts, completion)
- Cross-request aggregated logs (all requests in one rolling file path)

What each `requests/{UTC_TIMESTAMP}Z_{internal_request_id}/` run folder contains:

- `summary.jsonl`: one JSON line per high-level pipeline event for that request
- `NNN_<step>.json`: concise per-step detail files (fetch, filter, score, response summary)
- `response_full.json`: full per-city API response payload in the same shape returned by `/v1/prioritize`
- `input_snapshot.json`: reproducibility-critical run inputs (`locode`, resolved weights, resolved `top_n`, frontend city preference fields, emissions by GPC ref)
- `manifest.json`: run-level index of generated files, key counts, and pointers for top-ranked rows vs full evidence files
- Event metadata such as timestamp, request ID, event index, event/step type, and payload
- `event_index` is shared between a summary event and its matching detail file, so `summary.jsonl` and `NNN_<step>.json` are directly pairable
- Timing/count summaries plus request-scoped traceability in a single run directory
- For the free-text other-preference feature, the `alignment` step detail includes mapping evidence such as `resolved_preferred_co_benefits`, `unmappable_preference_fragments`, `matched_preferred_co_benefits`, and mapping source/model fields
- There are currently no dedicated LLM prompt/response artifact files for co-benefit mapping; the traceability lives inside the standard alignment evidence artifacts

Inspect logs:

```bash
tail -f logs/app.log
```

```bash
ls -1 logs/requests/
```

Typical per-request artifact events:

- `fetch_city.completed`
- `fetch_actions.completed`
- `fetch_policy_signals.completed`
- `validate_weights.completed`
- `hard_filter.completed`
- `pillar_scores.completed`
- `final_scoring.completed`
- `run_summary.completed`
- `response_summary.completed`

### 6. Docker

From the `hiap-meed` directory:

```bash
docker build -t hiap-meed-app .
docker run -it --rm -p 8000:8000 --env-file .env hiap-meed-app
```

To persist file logs and per-request artifacts on your machine (under `logs/`, including `logs/requests/`), bind-mount the host `logs` directory to `/app/logs` in the container (this matches default `LOG_DIR=logs`):

```bash
docker run -it --rm -p 8000:8000 --env-file .env -v "%cd%\logs:/app/logs" hiap-meed-app
```

On **Windows Command Prompt**, from the `hiap-meed` directory:

```cmd
docker run -it --rm -p 8000:8000 --env-file .env -v "%cd%\logs:/app/logs" hiap-meed-app
```

If you change `LOG_DIR` in `.env`, adjust the container path in `-v` so it matches `/app/<LOG_DIR>`.

The Docker image includes both `app/` and `data/`, so mock payloads under
`data/mock` are available in-container at `/app/data/mock`.
Data folder needs to be removed once real APIs are available.

## Testing

From the `hiap-meed` directory:

```bash
uv run pytest -c pytest.ini
```
