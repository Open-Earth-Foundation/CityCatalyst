# HIAP Brazil v3 (scaffold)

FastAPI scaffold for the Brazil v3 climate-action prioritization service (CC-1023). It keeps the three pillars (impact, alignment, feasibility) and the `region` x `methodology` modularity proposed in `hiap-meed/docs/modular-hiap-architecture-rfc.md`.

> **Scaffold only.** The methodology is still being defined by the Data team and C40. All rankings are fictitious mock data. Responses carry `meta.mock: true` and `meta.methodologyStatus: "scaffold"`, and the service logs a warning about it. Do not use the output for decisions.

## Layout

```text
app/
  main.py          FastAPI app (/, /health)
  registry.py      (region, methodology, version) -> pipelines; modality selects the pipeline
  api/             POST /v1/prioritize, error shaping, request/response models
  shared/          contracts + minimal scoring kernel (weights, weighted sum, tie-break)
  methodologies/   ccc/v1: hard filter, 3 pillar stubs, final scoring, mitigation + adaptation pipelines
  regions/BR/      placeholder config.yaml, mock fixtures, source adapter
tests/             unit + conformance
```

Both modalities use the same three pillars only as a scaffold assumption; adaptation may need different ones.

## Install

```bash
cd hiap-brazilv3
uv sync
cp .env.example .env   # optional; never commit .env
```

## Run

```bash
uv run python -m app.main
```

```bash
curl -X POST localhost:8000/v1/prioritize -H 'content-type: application/json' \
  -d '{"meta":{"requestId":"demo-1"},"requestData":{"region":"BR","methodology":"ccc","methodologyVersion":"v1","modality":"mitigation"}}'
```

Unsupported combinations return HTTP 422 with `detail.error.code = "unsupported_combination"`; `modality` is listed in the details only when it is the reason.

## Environment variables

See `.env.example`: `API_HOST`, `API_PORT`, `LOG_LEVEL`, `LOG_FILE_ENABLED`, `LOG_DIR`.

## Test

```bash
uv run pytest
```
