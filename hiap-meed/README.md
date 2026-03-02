# HIAP-MEED

`hiap-meed` is a FastAPI service scaffold for the MEED prioritization flow.

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
```

Variables:
- `API_HOST`: server bind host (default `0.0.0.0`)
- `API_PORT`: server bind port (default `8000`)
- `LOG_LEVEL`: Python logging level (for example `DEBUG`, `INFO`)
- `LOG_DIR`: output folder for file logs and request artifacts
- `ARTIFACT_LOG_JSONL`: if `true`, writes per-request JSONL artifacts

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

### 4. Call the prioritization endpoint

Run commands from a Bash shell (Git Bash, WSL, Linux, macOS).

Request body fields:
- `locode` (required, `string`): City identifier used to fetch city context.
- `excluded_action_ids` (optional, `string[]`, default `[]`): Action IDs to remove before scoring.
- `weights_override` (optional, `object`): Custom weights with keys `impact`, `alignment`, `feasibility`.
- `top_n` (optional, `integer >= 1`): Limits response to first `N` ranked actions.

Weight behavior:
- If `weights_override` is omitted, defaults are used: `impact=0.55`, `alignment=0.22`, `feasibility=0.23`.
- Unknown keys are rejected.
- Negative values are rejected.
- Weight sum must be exactly `1.0`; otherwise the request fails with HTTP `422`.

Response fields:
- `ranked_action_ids` (`string[]`): Ordered action IDs from highest to lowest priority.
- `metadata` (`object`): Request ID, resolved weights, timing, and action counts.

Minimal payload:

```bash
curl -X POST http://localhost:8000/v1/prioritize \
  -H 'Content-Type: application/json' \
  -d '{"locode":"CL IQQ","excluded_action_ids":[]}'
```

Payload with `top_n`:

```bash
curl -X POST http://localhost:8000/v1/prioritize \
  -H 'Content-Type: application/json' \
  -d '{"locode":"CL IQQ","excluded_action_ids":[],"top_n":5}'
```

Payload with exclusions and custom weights:

```bash
curl -X POST http://localhost:8000/v1/prioritize \
  -H 'Content-Type: application/json' \
  -d '{"locode":"CL IQQ","excluded_action_ids":["c40_0020"],"weights_override":{"impact":0.5,"alignment":0.3,"feasibility":0.2},"top_n":10}'
```

Example response:

```json
{
  "ranked_action_ids": ["c40_0010", "c40_0030"],
  "metadata": {
    "request_id": "d1db6269-4cf9-4d62-8f4c-8f4ce631fbd2",
    "locode": "CL IQQ",
    "weights": {
      "impact": 0.5,
      "alignment": 0.3,
      "feasibility": 0.2
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
      "ranked_actions": 2
    }
  }
}
```

Common validation errors:
- Missing request body -> HTTP `422`.
- Missing `locode` or empty `locode` -> HTTP `422`.
- `top_n < 1` -> HTTP `422`.
- Invalid `weights_override` keys/values -> HTTP `422` with error payload.

Note: current data clients are in-memory stubs. Real upstream API calls are not wired yet.

### 5. Logging and artifacts

The service writes:
- Console logs (stdout/stderr)
- File logs at `LOG_DIR/app.log`
- Per-request artifacts at `LOG_DIR/requests/{request_id}.jsonl` when `ARTIFACT_LOG_JSONL=true`

What `app.log` contains:
- Service startup and runtime logs
- Endpoint activity (for example health checks and prioritization completion)
- Validation errors and unexpected exceptions with stack traces
- Cross-request aggregated logs (all requests in one rolling file path)

What each `requests/{request_id}.jsonl` file contains:
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

## Testing

From the `hiap-meed` directory:

```bash
uv run pytest -c pytest.ini
```
