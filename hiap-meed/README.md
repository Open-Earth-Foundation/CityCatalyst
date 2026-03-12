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
HIAP_MEED_LEGAL_DATA_SOURCE=mock
HIAP_MEED_ACTION_DATA_SOURCE=mock
```

Variables:

- `API_HOST`: server bind host (default `0.0.0.0`)
- `API_PORT`: server bind port (default `8000`)
- `LOG_LEVEL`: Python logging level (for example `DEBUG`, `INFO`)
- `LOG_DIR`: output folder for file logs and request artifacts
- `ARTIFACT_LOG_JSONL`: if `true`, writes per-request JSONL artifacts
- `HIAP_MEED_LEGAL_DATA_SOURCE`: legal input source (`mock`, `stub`, or `api`)
- `HIAP_MEED_ACTION_DATA_SOURCE`: action catalog source (`mock`, `stub`, or `api`)

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

Note: city data is currently an in-memory stub. Action and legal clients can use `mock` (file-backed), `stub` (empty), or `api` (placeholder returning empty data) based on `HIAP_MEED_ACTION_DATA_SOURCE` and `HIAP_MEED_LEGAL_DATA_SOURCE`. Real upstream HTTP wiring is still pending for all clients; when wired, clients should use a synchronous HTTP client (e.g. `httpx.Client`). FastAPI runs synchronous routes in a threadpool, so the event loop stays free to handle concurrent requests.

### 5. Logging and artifacts

The service writes:

- Console logs (stdout/stderr)
- File logs at `LOG_DIR/app.log`
- Per-request artifacts at `LOG_DIR/requests/{UTC_TIMESTAMP}Z_{internal_request_id}.jsonl` when `ARTIFACT_LOG_JSONL=true`

What `app.log` contains:

- Service startup and runtime logs
- Endpoint activity (for example health checks and prioritization completion)
- Validation errors and unexpected exceptions with stack traces
- Cross-request aggregated logs (all requests in one rolling file path)

What each `requests/{UTC_TIMESTAMP}Z_{internal_request_id}.jsonl` file contains:

- One JSON line per pipeline event for that single request
- Event metadata such as timestamp, request ID, event type, and payload
- Timing/count summaries for fetch/filter/score steps
- Request-scoped traceability (one file per request ID)

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
- `block_scores.completed`
- `response.completed`

### 6. Docker

From the `hiap-meed` directory:

```bash
docker build -t hiap-meed-app .
docker run -it --rm -p 8000:8000 --env-file .env hiap-meed-app
```

The Docker image includes both `app/` and `data/`, so mock payloads under
`data/mock` are available in-container at `/app/data/mock`.
Data folder needs to be removed once real APIs are available.

## Testing

From the `hiap-meed` directory:

```bash
uv run pytest -c pytest.ini
```
