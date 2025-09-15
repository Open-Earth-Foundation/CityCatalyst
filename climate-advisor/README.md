# Climate Advisor

Climate Advisor (CA) is a standalone Python FastAPI microservice that provides chat endpoints used by CityCatalyst (CC). In Sprint 1, CA is implemented as a separate service under `climate-advisor/service` and exposes versioned APIs under `/v1/*`.

## Local Development

Prerequisites: Python 3.11+, pip

1) Install dependencies

```
cd climate-advisor/service
pip install -r requirements.txt
```

2) Run the service

```
uvicorn app.main:app --host 0.0.0.0 --port 8080
```

3) Explore the API docs

- Swagger UI: http://localhost:8080/docs
- OpenAPI JSON: http://localhost:8080/openapi.json

## Health Endpoints

- `GET /health` – liveness probe
- `GET /ready` – readiness (true after app startup completes)

## Endpoints (v1, stubs)

- `POST /v1/threads` – returns `{ "thread_id": "..." }` and echoes optional context fields
- `POST /v1/messages` – streams SSE events that echo the input `content` in 2–3 chunks and ends with a `done` event

## Docker

Build and run the container:

```
cd climate-advisor/service
docker build -t climate-advisor:dev .
docker run --rm -p 8080:8080 climate-advisor:dev
```

## Configuration

Environment variables (initial set):

- `CA_PORT` – default 8080
- `CA_LOG_LEVEL` – info|debug
- `CA_CORS_ORIGINS` – CSV list of allowed origins (default `*` for dev)
- `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `OPENROUTER_MODEL` (placeholders)
- `CC_BASE_URL`, `CC_OAUTH_CLIENT_ID`, `CC_OAUTH_CLIENT_SECRET`, `CC_OAUTH_TOKEN_URL` (placeholders)

Create a `.env` file in `climate-advisor/service` if desired; variables are loaded automatically.
