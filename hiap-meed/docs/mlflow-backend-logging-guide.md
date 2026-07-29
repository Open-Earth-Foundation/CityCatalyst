# MLflow Backend Logging Guide

This guide describes the current CityCatalyst pattern for adding MLflow logging to backend services.

Right now the reference implementation lives in `hiap-meed`. Other services should follow the same shape so runs, traces, tags, and artifacts stay aligned in the shared MLflow backend.

## Purpose

Use this guide when a backend service needs to log any of the following to the shared MLflow instance:

- request-level runs
- LLM traces
- service-specific artifacts
- request parameters and summary metrics

For now, the canonical example implementation is:

- helper module: `app/utils/mlflow_logging.py`
- artifact bridge: `app/utils/artifacts.py`
- request integrations: `app/modules/prioritizer/api.py`

## Scope Split

This guide is about MLflow client-side integration inside a backend service.

It is not the guide for:

- running the MLflow server
- Kubernetes deployment of MLflow
- PVC or storage operations
- CORS or ingress setup

Those belong in the `mlflow` repo.

## Current Shared Defaults

Current CityCatalyst defaults:

- tracking URI: `https://mlflow-dev.openearth.dev`
- one shared backend for multiple services
- environment separation via run tags, not separate backends

Recommended baseline env vars:

```env
MLFLOW_ENABLED=true
MLFLOW_TRACKING_URI=https://mlflow-dev.openearth.dev
MLFLOW_TRACKING_USERNAME=<service-user>
MLFLOW_TRACKING_PASSWORD=<service-password>
MLFLOW_EXPERIMENT_NAME=<service-name>
MLFLOW_ENVIRONMENT=dev
GIT_PYTHON_REFRESH=quiet
MLFLOW_ASYNC_LOGGING_ENABLED=true
```

Recommended meanings:

- `MLFLOW_ENABLED`: master on/off switch for MLflow logging
- `MLFLOW_TRACKING_URI`: shared MLflow backend URL
- `MLFLOW_TRACKING_USERNAME`: shared non-admin service-account username
- `MLFLOW_TRACKING_PASSWORD`: matching password; keep real values out of Git
- `MLFLOW_EXPERIMENT_NAME`: usually the service name, for example `hiap-meed`
- `MLFLOW_ENVIRONMENT`: `dev`, `test`, or `prod`
- `GIT_PYTHON_REFRESH=quiet`: suppresses GitPython warnings when the service runtime has no `git` executable
- `MLFLOW_ASYNC_LOGGING_ENABLED`: enables async logging for tags, params, and metrics where supported

For Kubernetes deployments, store the credentials in GitHub Secrets and follow
the service's established credential-injection pattern. HIAP-MEED and Climate
Advisor add them through their existing `kubectl set env` deployment commands.
Never put a real password in a manifest, example file, container image, or
README.

## What To Log

Every service should aim to log the same basic layers:

1. One request-level run
2. Optional nested sub-runs when one request fans out into meaningful child units
3. Request tags for filtering and grouping
4. Request params for stable input metadata
5. Request metrics for counts, durations, and warning totals
6. Request artifacts for richer debugging payloads
7. LLM traces when the service calls OpenAI

Recommended request-level tags:

- `service`
- `environment`
- `request_kind`
- `endpoint`
- `frontend_request_id` when available
- `internal_request_id` when available

Recommended request-level params:

- source configuration choices
- top-level request counts
- feature flags that affect behavior

Recommended metrics:

- durations
- item counts
- warnings count
- output counts

## Artifact Guidance

Use MLflow artifacts for rich per-request payloads that would be too noisy as tags or params.

Good candidates:

- request snapshots
- response snapshots
- structured debug payloads
- LLM prompt and output payloads
- service-specific diagnostics

Keep artifact naming stable and simple. Prefer predictable names like:

- `input_snapshot.json`
- `response_full.json`
- `llm/<step>_io.json`
- `llm/<step>_prompt.txt`

The exact artifact contents can remain service-specific. Alignment matters more than identical payload schemas.

## Reference Pattern

The current `hiap-meed` helper exposes a best-effort wrapper:

- initialize MLflow once per process
- fail open if MLflow is unavailable
- wrap request code in a run context manager
- log tags, params, and metrics through one helper module
- log JSON and text artifacts through one helper module

Recommended shape:

```python
with start_run(
    run_name="my_request",
    tags={
        "service": "my-service",
        "environment": "dev",
        "request_kind": "example",
        "endpoint": "/v1/example",
    },
    params={
        "records": 10,
    },
):
    result = run_business_logic()
    log_metrics({"records": 10, "warnings": 0})
    log_json_artifact("response_full.json", result)
```

## Error Handling Rules

MLflow logging must never break the service's main response path.

Follow these rules:

- initialize MLflow once and fail open
- swallow MLflow logging failures with warnings
- always close runs with a context manager
- keep run lifecycle synchronous

The current `hiap-meed` helper already follows this rule:

- normal request errors should still close the run
- MLflow logging failures should not crash the endpoint

## Sync vs Async

Current recommended split:

- synchronous: run open and run close
- async where supported: tags, params, metrics
- synchronous for now: JSON and text artifact uploads

Reason:

- run lifecycle should stay deterministic
- async tags, params, and metrics reduce request-path overhead
- artifact uploads are still easier to reason about synchronously unless a service introduces a dedicated background queue

## LLM Tracing

If a service uses OpenAI, keep the OpenAI client setup centralized and initialize MLflow before those calls happen.

In `hiap-meed`, that pattern is:

- `app/services/openai_client.py`
- `app/utils/mlflow_logging.py`

If you want to inspect tool-call traces specifically, `hiap-meed` also contains a removable test-only example:

- `app/modules/mlflow_trace_test/`

That module is intentionally isolated so future services can copy the pattern without mixing test flows into production business logic.

## Naming Conventions

To keep the shared backend readable, use consistent naming.

Recommended run naming:

- request run: `<request_kind>_request`
- nested child run: `<request_kind>_<scope>_<identifier>`

Examples from `hiap-meed`:

- `prioritization_request`
- `prioritization_city_<locode>`
- `exclusion_preview_request`

## Where To Put The Code

For now, if a service implements this pattern independently, keep the pieces separated:

- MLflow helper functions in one utility module
- OpenAI client setup in one service module
- service-specific artifact building close to the service logic
- route or orchestration code responsible only for choosing what to log

Do not scatter raw `mlflow.*` calls across many files if you can avoid it.

## Future Direction

Today, the implementation lives inside `hiap-meed` because it is the only service using this pattern.

If more CityCatalyst services adopt the same MLflow integration, the next step should be:

1. move the generic helpers out of `hiap-meed`
2. create one shared package or shared module for backend logging
3. keep this guide as the integration contract for all services

## Related Files

Current implementation references:

- `hiap-meed/app/utils/mlflow_logging.py`
- `hiap-meed/app/utils/artifacts.py`
- `hiap-meed/app/modules/prioritizer/api.py`
- `hiap-meed/app/modules/mlflow_trace_test/`

Server-side MLflow deployment references:

- `mlflow/README.md`
- `mlflow/k8s/`
