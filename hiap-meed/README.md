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
HIAP_MEED_TOP_N=20
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
- `HIAP_MEED_TOP_N`: default number of ranked actions to return per city (default `20`)

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

- Impact, alignment, and feasibility block scores are normalized to `0..1` per action.
- Blocks use **max-normalization per run** (`score / max(score)`), not sum-normalization.
- Scores therefore do not sum to 1 across all actions; `1.0` means “best action in that block for this run”.

Impact block behavior (implemented):

- Impact reads action emissions targeting from `mitigationImpact.emissions`, including:
  - `gpc_reference_number` (**list** of GPC refs in the mock/API schema)
  - `impact_text` (`very low`, `low`, `medium`, `high`, `very high`)
- Impact reads city emissions from the frontend request:
  - `requestData.cityDataList[].cityEmissionsData.gpcData[*].activities[*].totalEmissions`
  - The service sums activity emissions per GPC key before scoring.
- Impact computes raw score as:
  - `0.80 * reduction_share_of_city_emissions + 0.20 * timeline_score`
  - Timeline mapping: `<5 years -> 1.0`, `5-10 years -> 0.5`, `>10 years -> 0.0`
- Unknown `impact_text` values are rejected with `422` (raised during Impact scoring and surfaced by the API error handler).

Response fields:

- `results` (`array`): one entry per requested city.
  - `locode` (`string`)
  - `ranked_action_ids` (`string[]`): ordered action IDs.
  - `metadata` (`object`): request ID, timings, counts, hard-filter evidence, and frontend trace fields.

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
      "metadata": {
        "internal_request_id": "d1db6269-4cf9-4d62-8f4c-8f4ce631fbd2",
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
        "frontend_request_id": "1234567890",
        "requested_languages": ["en"],
        "excluded_actions_free_text": "Do not include new fossil fuel-based infrastructure ..."
      }
    }
  ]
}
```

Common validation errors:

- Missing request body -> HTTP `422`.
- Missing `requestData.cityDataList` or empty `cityDataList` -> HTTP `422`.
- Missing `locode` or empty `locode` in a city entry -> HTTP `422`.

Note: city, action, and legal clients now resolve to `mock` (file-backed) or `api` (placeholder until real upstream wiring is added). Default source for all three is `mock`, so local and Docker runs use checked-in mock payloads by default. Real upstream HTTP wiring is still pending; when wired, clients should use a synchronous HTTP client (e.g. `httpx.Client`). FastAPI runs synchronous routes in a threadpool, so the event loop stays free to handle concurrent requests.

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
- `NNN_<step>.json`: concise per-step detail files (fetch, filter, score, response)
- Event metadata such as timestamp, request ID, event index, event/step type, and payload
- `event_index` is shared between a summary event and its matching detail file, so `summary.jsonl` and `NNN_<step>.json` are directly pairable
- Timing/count summaries plus request-scoped traceability in a single run directory

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
- `validate_weights.completed`
- `hard_filter.completed`
- `pillar_scores.completed`
- `final_scoring.completed`
- `run_summary.completed`
- `response.completed`

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
