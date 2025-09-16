---

# Climate Advisor Service – Implementation Plan (Revised)

This plan reflects the decision to implement Climate Advisor as a standalone Python microservice (FastAPI) within `climate-advisor/service`. We will not modify CityCatalyst (Next.js) in this phase. CC will continue to handle the UI and will later proxy requests to this service without changing user-facing behavior.

## Scope and Principles

- Build a separate FastAPI service under `climate-advisor/service`.
- Define and implement v1 endpoints: `/v1/threads`, `/v1/messages` (streaming), optional `/v1/actions`, `/v1/files`.
- Keep CityCatalyst (CC) unchanged for Sprint 1; provide a clear integration guide for later.
- Migrate OpenAI usage to OpenRouter in the microservice.
- Add OAuth client for calling CC where needed (context fetch); CC authenticates user requests to CA separately via shared secret or gateway in later phase.
- Maintain compatibility with existing CC chat UX (SSE/streaming).

## High-Level Phases

1) Service foundation and endpoint scaffolding (no LLM calls yet).
2) OpenRouter integration with streaming responses.
3) Persistence foundation: dedicated PostgreSQL (future PGVector) storage for threads/messages.
4) OAuth + CityCatalyst client for contextual data fetches.
5) Integration handoff: CC routes proxy to CA (no code changes in this plan; document only).

---

## Sprint 1: Climate Advisor Service Foundation

### Sprint Goal

Establish the foundation for the Climate Advisor Service microservice and begin the migration from direct OpenAI integration.

### Developer Capacity: 1 Developer (2 weeks)

### Tickets

#### **TICKET-001: Climate Advisor Service Setup**

**Priority:** High  
**Story Points:** 8  
**Description:** Create the initial Climate Advisor Service Python microservice with FastAPI framework, aligned with climate-advisor/architecture.md (Target Architecture, Service Responsibilities, and API Contract). Establish a clean, versioned API surface and operational foundations (config, logging, errors, health, CORS) without integrating OpenRouter or CC yet.

-**Acceptance Criteria:**

- [x] Project structure: create `app/` package with modules for `routes/`, `models/`, `services/`, `config/`, `middleware/`, `utils/` consistent with architecture.md and API versioning (`/v1/*`).
- [x] Health endpoints: `GET /health` (liveness) and `GET /ready` (readiness; returns `{"ready": true}` when app boot completes; no external checks yet).
- [x] API surface (stubs only):
  - [x] `POST /v1/threads` returns `201` with `{ thread_id }` (UUIDv4 generated server-side) and echoes received context metadata (not persisted).
  - [x] `POST /v1/messages` streams SSE events that echo the input content in 2–3 chunks, ending with a terminal event; content-type `text/event-stream`, compatible with CC streaming.
- [x] Pydantic models (v2): request/response schemas for threads and messages; enforce basic validation (required fields: `user_id`, `content`; optional `inventory_id`, `thread_id`, `context`, `options`).
- [x] Error handling: central exception handlers returning JSON Problem Details shape `{ type, title, status, detail, instance, request_id }`; map 422/400/404/500 appropriately.
- [x] Observability: structured logging (request start/stop, path/method, status, duration, request_id) and request ID propagation (accept `x-request-id` or generate and return it).
- [x] CORS: allow-list via env (`CA_CORS_ORIGINS`, default `*` for dev) and expose necessary headers for SSE.
- [x] Settings: centralized config using environment variables loaded via a settings module; include placeholders for OpenRouter and CC but unused in this ticket.
- [x] Docker: Dockerfile builds and runs the service on port `8080`; production command with `uvicorn` and graceful shutdown.
- [x] Docs: FastAPI auto-docs enabled at `/docs` and `/openapi.json`; README section with local run instructions.

**Files to Create:**

- `climate-advisor/service/app/main.py` (Climate Advisor Service entry point)
- `climate-advisor/service/requirements.txt` (Climate Advisor Service dependencies)
- `climate-advisor/service/Dockerfile`
- `climate-advisor/service/app/services/` (service layer structure)
- `climate-advisor/service/app/routes/` with `health.py`, `threads.py`, `messages.py`
- `climate-advisor/service/app/models/` with `requests.py`, `responses.py`
- `climate-advisor/service/app/config/settings.py` (env loading, CORS, app meta)
- `climate-advisor/service/app/middleware/request_context.py` (request_id, logging)
- `climate-advisor/service/app/utils/sse.py` (SSE helpers for streaming)

##### TICKET-001 — Implementation Notes and Examples (Completed)

Status: Implemented as a standalone FastAPI app under `climate-advisor/service/app` with health checks, v1 stubs, middleware, settings, and SSE utilities. No OpenRouter/CC integration yet.

What was implemented
- Structure created: `routes/`, `models/`, `services/`, `config/`, `middleware/`, `utils/` under `app/`.
- Health endpoints: `GET /health`, `GET /ready` (ready flips true on startup event).
- v1 endpoints (stubs):
  - `POST /v1/threads` → 201 Created, returns `{ thread_id }` and echoes `inventory_id`, `context`; `Location: /v1/threads/{id}` header set.
  - `POST /v1/messages` → streams SSE events echoing the input `content` in 2–3 chunks and ends with a `done` event.
- Pydantic v2 models: request/response schemas; required `user_id`, `content` validated.
- Error handling: JSON Problem Details returned for 400/404/422/500 with `request_id` and `instance` URL.
- Middleware: Request context middleware captures/propagates `X-Request-Id`, logs start/stop with duration; CORS via FastAPI `CORSMiddleware` using `CA_CORS_ORIGINS`.
- SSE utils: helpers to format events and chunk text; response disables buffering and sets `text/event-stream`.
- Settings: `.env` loading, `CA_PORT`, `CA_LOG_LEVEL`, `CA_CORS_ORIGINS` supported; placeholders for OpenRouter/CC kept for later tickets.
- Playground: Static HTML tester mounted at `/playground` to manually exercise endpoints (`/health`, `/ready`, `/v1/threads`, `/v1/messages`).
- Swagger: Built-in Swagger UI at `/docs` and ReDoc at `/redoc`. Static OpenAPI spec at `climate-advisor/docs/climate-advisor-openapi.yaml`.

How it was implemented
- Entry point `app/main.py` builds the FastAPI app with middleware, routers, and exception handlers; sets `app.state.ready` on startup.
- `app/middleware/request_context.py` uses a contextvar to store a per-request UUID or incoming `x-request-id` header; adds `X-Request-Id` to responses.
- `app/routes/messages.py` returns `StreamingResponse` with SSE-formatted chunks from `app/utils/sse.py` and terminal `event: done`.
- Problem Details factory ensures consistent error envelopes; 422/HTTPException/ValueError/500 paths covered.

Examples
- Health checks
  - Liveness: `curl -s http://localhost:8080/health`
    - Response: `{ "status": "ok" }`
  - Readiness: `curl -s http://localhost:8080/ready`
    - Response: `{ "ready": true }` (after startup)

- Create thread (v1)
  - Request:
    ```bash
    curl -i -X POST http://localhost:8080/v1/threads \
      -H 'Content-Type: application/json' \
      -H 'X-Request-Id: demo-req-001' \
      -d '{
            "user_id": "u_123",
            "inventory_id": "inv_456",
            "context": {"foo": "bar"}
          }'
    ```
  - Expected response (201):
    ```http
    HTTP/1.1 201 Created
    Location: /v1/threads/<uuid>
    X-Request-Id: demo-req-001
    Content-Type: application/json

    {"thread_id":"<uuid>","inventory_id":"inv_456","context":{"foo":"bar"}}
    ```

- Stream message (v1)
  - Request (SSE, chunked echo):
    ```bash
    curl -N -X POST http://localhost:8080/v1/messages \
      -H 'Content-Type: application/json' \
      -d '{
            "user_id": "u_123",
            "thread_id": "<optional-uuid>",
            "content": "Hello Climate Advisor, streaming test."
          }'
    ```
  - Example stream (server output shape):
    ```
    event: message
    id: 0
    data: {"index": 0, "content": "Hello Climate Advisor, "}

    event: message
    id: 1
    data: {"index": 1, "content": "streaming test."}

    event: done
    data: {"ok": true, "request_id": "<uuid-or-x-request-id>"}
    ```

- Error envelope (Problem Details example)
  - Trigger (missing required fields):
    ```bash
    curl -s -X POST http://localhost:8080/v1/messages -H 'Content-Type: application/json' -d '{}'
    ```
  - Response (422):
    ```json
    {
      "type": "https://datatracker.ietf.org/doc/html/rfc4918#section-11.2",
      "title": "Unprocessable Entity",
      "status": 422,
      "detail": "1 validation error for MessageCreateRequest ...",
      "instance": "http://localhost:8080/v1/messages",
      "request_id": "<uuid>"
    }
    ```

Client notes
- SSE: clients should use streaming fetch (e.g., `EventSource`/`ReadableStream` or `curl -N`). Server emits `text/event-stream` with `X-Accel-Buffering: no` and `Cache-Control: no-cache` headers to support real-time streaming.
- Request IDs: pass `X-Request-Id` for traceability; the service returns the same in responses and terminal SSE event.
- CORS: configure allowed origins via `CA_CORS_ORIGINS` (CSV). Default is `*` in dev.

---

#### **TICKET-002: OpenRouter Integration and Streaming**

**Priority:** High  
**Story Points:** 8  
**Description:** Replace the echo stubs with real OpenRouter connectivity and streaming responses while maintaining compatibility with CityCatalyst.

-**Acceptance Criteria:**

- [x] Implement `OpenRouterClient` using `httpx.AsyncClient` configurable via env (`OPENROUTER_API_KEY`, base URL, timeout).
- [x] Allow per-request overrides (`model`, `temperature`, `max_tokens`) while enforcing service defaults.
- [x] Convert OpenRouter delta streams into SSE `message`/`error`/`done` events with correct headers and a backpressure-safe generator.
- [x] Extend `/v1/messages` pipeline to validate payloads, assemble prompt blocks from provided context, and hand off to OpenRouter.
- [x] Ensure structured logging and request ID propagation across outbound calls and terminal SSE events.
- [x] Provide a developer script (`climate-advisor/scripts/test_service_stream.py`) to exercise streaming end-to-end.

**Files Created/Modified:**

- `climate-advisor/service/app/services/openrouter_client.py`
- `climate-advisor/service/app/routes/messages.py`
- `climate-advisor/service/app/utils/sse.py`
- `climate-advisor/service/app/models/requests.py`
- `climate-advisor/service/app/main.py`
- `climate-advisor/scripts/test_service_stream.py`

---

#### **TICKET-003: Postgres Persistence Foundation**

**Priority:** High  
**Story Points:** 5  
**Description:** Introduce a dedicated PostgreSQL database for Climate Advisor so we can persist threads and messages as outlined in architecture.md. PGVector remains a follow-on; this ticket focuses solely on relational storage.

-**Acceptance Criteria:**

- [x] Add database configuration in settings (`CA_DATABASE_URL`, pool sizing, echo toggle) and expose a SQLAlchemy session dependency (async preferred) without adding any auth requirements.
- [x] Define ORM models for `Thread` and `Message` matching the schema in architecture.md (UUID primary keys, foreign keys, created_at/updated_at, role enum, tools_used JSONB).
- [x] Create a repository/service layer that `/v1/threads` and `/v1/messages` use to insert and query records; unit tests cover happy path and basic error handling.
- [x] Ship Alembic migrations (or an equivalent idempotent schema module) that build the initial tables.
- [x] Provide a reproducible setup script (`climate-advisor/scripts/setup_local_db.py`) that can create/drop the dev database and run migrations regardless of where Postgres is hosted.
- [x] Update developer docs with local workflow for provisioning Postgres, running the setup script repeatedly, and cleaning data between iterations.

**Files to Create/Modify:**

- `climate-advisor/service/app/db/__init__.py`
- `climate-advisor/service/app/db/session.py`
- `climate-advisor/service/app/models/db/thread.py`
- `climate-advisor/service/app/models/db/message.py`
- `climate-advisor/service/app/services/thread_service.py`
- `climate-advisor/service/app/services/message_service.py`
- `climate-advisor/service/app/routes/threads.py`
- `climate-advisor/service/app/routes/messages.py`
- `climate-advisor/service/app/config/settings.py`
- `climate-advisor/scripts/setup_local_db.py` (schema bootstrapper, replaces Alembic for now)
- `climate-advisor/service/.env.example`

##### TICKET-003 � Implementation Notes and Examples (Completed)

What changed
- Added SQLAlchemy async engine/session wiring in `climate-advisor/service/app/db/session.py`, including helpers to normalise Postgres URLs and expose `get_engine`/`get_session` for FastAPI dependencies and tooling.
- Created ORM models for `Thread` and `Message` under `app/models/db/` with relationships, enums, timestamps, and JSONB payloads that match the architecture plan.
- Introduced `ThreadService` and `MessageService` and updated `/v1/threads` + `/v1/messages` to persist user and assistant messages while refreshing thread metadata.
- Added `climate-advisor/scripts/setup_local_db.py` for idempotent schema create/drop and documented the workflow (plus sample env values) in the README.
- Updated environment defaults to use `postgresql://postgres:admin@host.docker.internal:5432/climate_advisor` so both host and containerised service share the same Postgres instance.

---

#### **TICKET-004: OAuth Integration for CityCatalyst Context Fetch**

**Priority:** Medium  
**Story Points:** 5  
**Description:** Layer in OAuth client capabilities so the service can fetch contextual data from CityCatalyst after the persistence work lands. This ticket only covers outbound auth and resilience; inbound auth remains out of scope.

-**Acceptance Criteria:**

- [ ] Extend settings and `.env.example` with OAuth client metadata (`CC_OAUTH_CLIENT_ID`, `CC_OAUTH_CLIENT_SECRET`, `CC_OAUTH_TOKEN_URL`, scopes, cache TTL).
- [ ] Implement an OAuth service that requests access tokens, caches them with expiry awareness, and refreshes proactively.
- [ ] Provide a reusable HTTP client wrapper that injects bearer tokens on CC requests and surfaces structured errors without persisting credentials.
- [ ] Add basic resilience (timeouts, retry with backoff, circuit breaker toggles) for outbound CC calls.
- [ ] Emit structured logs and metrics for token lifecycle and CC calls to aid debugging.
- [ ] Document operational steps for rotating credentials and testing against staging providers.

**Files to Create/Modify:**

- `climate-advisor/service/app/services/oauth_service.py`
- `climate-advisor/service/app/services/citycatalyst_client.py`
- `climate-advisor/service/app/config/settings.py`
- `climate-advisor/service/.env.example`
- `docs/climate-advisor-service.md`

---

#### **TICKET-005: User Identity Propagation**

**Priority:** Medium  
**Story Points:** 3  
**Description:** Ensure the service consistently receives, validates, and persists the caller `user_id` so downstream analytics and privacy requirements are met when saving chat history.

-**Acceptance Criteria:**

- [ ] Confirm `/v1/messages` payloads require `user_id` and include validation/error handling when absent.
- [ ] Thread creation persists `user_id` as defined in the Postgres schema (links users to threads).
- [ ] Message persistence writes role, content, `user_id`, and timestamps so the conversation history can be reconstructed per user.
- [ ] Add service-layer tests covering mixed user/thread scenarios and ensuring cross-user access is rejected.
- [ ] Document how CityCatalyst must pass `user_id` and how the Climate Advisor tables can be queried/audited by user.

**Files to Create/Modify:**

- `climate-advisor/service/app/models/requests.py`
- `climate-advisor/service/app/services/thread_service.py`
- `climate-advisor/service/app/services/message_service.py`
- `climate-advisor/service/app/routes/threads.py`
- `climate-advisor/service/app/routes/messages.py`
- `climate-advisor/service/docs/persistence.md` (new) or equivalent doc section

---
#### **TICKET-006: Environment Configuration and Documentation**

**Priority:** Low  
**Story Points:** 2  
**Description:** Set up comprehensive environment configuration and update documentation.

**Acceptance Criteria:**

- [ ] Create comprehensive `.env.example` with all required variables
- [ ] Update README.md with setup and deployment instructions
- [ ] Add Docker Compose configuration for local development
- [ ] Document API endpoints and integration points
- [ ] Add troubleshooting guide
- [ ] Include example of CC -> CA wiring (env + curl examples)

**Files to Create/Modify:**

- `climate-advisor/service/.env.example`
- `climate-advisor/README.md`
- `climate-advisor/docker-compose.yml`
- `docs/climate-advisor-service.md`

---

### Sprint 1 Definition of Done

- [ ] TICKET-001 and TICKET-002 merged and verified locally.
- [ ] Docker image builds and runs via the service Dockerfile with `/health` and `/ready` returning success.
- [ ] `/v1/threads` and `/v1/messages` respond successfully; `/v1/messages` streams OpenRouter output end-to-end.
- [ ] Structured request logging shows propagated request IDs and correct SSE headers.
- [ ] Developer docs and helper scripts cover local run, streaming test harness, and environment configuration.

### Dependencies for Sprint 2

- Decision on local vs. remote PostgreSQL instance for development (connection string, credentials, managed vs. container).
- Agreement on database naming conventions and schema ownership for Climate Advisor tables.
- Confirmation of connection pool sizing/timeouts for the chosen Postgres deployment.

---

##### TICKET-002 � Implementation Notes and Examples (Completed)

Environment
- Required env vars: `OPENROUTER_API_KEY`, optional `OPENROUTER_BASE_URL` (default `https://openrouter.ai/api/v1`), `OPENROUTER_MODEL`, `REQUEST_TIMEOUT_MS`.
- Requests may override `model` and `temperature` via the `options` field; the service falls back to env defaults.
- Developer utility: `climate-advisor/scripts/test_service_stream.py` streams from `/v1/messages` and prints SSE lines for smoke tests.

Example: call `/v1/messages` with model overrides
```bash
curl -N -X POST http://localhost:8080/v1/messages \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: demo-req-002" \
  -d '{
        "user_id": "u_123",
        "thread_id": "t_abc",
        "content": "Summarize key climate risks for urban flooding.",
        "options": {
          "model": "openrouter/auto",
          "temperature": 0.2,
          "max_tokens": 512
        }
      }'
```

Expected stream shape (SSE)
```
event: message
id: 0
data: {"index":0,"content":"Urban areas face increasing risk..."}

event: message
id: 1
data: {"index":1,"content":"Mitigations include green infrastructure..."}

event: done
data: {"ok": true, "request_id": "demo-req-002"}
```

Next.js/Fetch streaming client example
```ts
// In a Next.js route or client component using fetch + ReadableStream
const res = await fetch("/api/ca/messages", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Request-Id": crypto.randomUUID() },
  body: JSON.stringify({ user_id: "u_123", content: "Hello", options: { model: "openrouter/auto" } })
});

const reader = res.body!.getReader();
const decoder = new TextDecoder();
let buffer = "";
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  // Parse SSE events (split by double newlines)
  const events = buffer.split("\n\n");
  buffer = events.pop() || "";
  for (const e of events) {
    if (e.startsWith("data:")) {
      const lines = e.split("\n").filter(Boolean).map(l => l.replace(/^data:\s?/, ""));
      const payload = JSON.parse(lines.join("\n"));
      // handle payload.content chunks or terminal ok
    }
  }
}
```

Error streaming example
```
event: error
data: {"message":"Upstream 429: rate limited","retry_after_ms": 2000}

event: done
data: {"ok": false, "request_id": "<uuid>"}
```

Logging and redaction
- Log request/response metadata only (model, status, latencies); redact API keys and message content in production logs.
- Include `request_id` in all logs; propagate to OpenRouter and include in terminal SSE event.

---

### Sprint 2 — Implementation Notes and Examples

Environment
- Required env vars: `OPENROUTER_API_KEY`, optional `OPENROUTER_BASE_URL` (default `https://openrouter.ai/api/v1`), `OPENROUTER_MODEL`, `REQUEST_TIMEOUT_MS`.
- Requests may override `model`, `temperature` via `options` field; server falls back to env defaults.
- Developer utility: `climate-advisor/scripts/test_service_stream.py` streams from `/v1/messages` and prints SSE lines.

Example: call `/v1/messages` with model overrides
```bash
curl -N -X POST http://localhost:8080/v1/messages \
  -H 'Content-Type: application/json' \
  -H 'X-Request-Id: demo-req-002' \
  -d '{
        "user_id": "u_123",
        "thread_id": "t_abc",
        "content": "Summarize key climate risks for urban flooding.",
        "options": {
          "model": "openrouter/auto",
          "temperature": 0.2,
          "max_tokens": 512
        }
      }'
```

Expected stream shape (SSE)
```
event: message
id: 0
data: {"index":0,"content":"Urban areas face increasing risk..."}

event: message
id: 1
data: {"index":1,"content":"Mitigations include green infrastructure..."}

event: done
data: {"ok": true, "request_id": "demo-req-002"}
```

Next.js/Fetch streaming client example
```ts
// In a Next.js route or client component using fetch + ReadableStream
const res = await fetch("/api/ca/messages", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Request-Id": crypto.randomUUID() },
  body: JSON.stringify({ user_id: "u_123", content: "Hello", options: { model: "openrouter/auto" } })
});

const reader = res.body!.getReader();
const decoder = new TextDecoder();
let buffer = "";
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  // Parse SSE events (split by double newlines)
  const events = buffer.split("\n\n");
  buffer = events.pop() || "";
  for (const e of events) {
    if (e.startsWith("data:")) {
      const lines = e.split("\n").filter(Boolean).map(l => l.replace(/^data:\s?/, ""));
      const payload = JSON.parse(lines.join("\n"));
      // handle payload.content chunks or terminal ok
    }
  }
}
```

Error streaming example
```
event: error
data: {"message":"Upstream 429: rate limited","retry_after_ms": 2000}

event: done
data: {"ok": false, "request_id": "<uuid>"}
```

Logging and redaction
- Log request/response metadata only (model, status, latencies); redact API keys and message content in production logs.
- Include `request_id` in all logs; propagate to OpenRouter and include in terminal SSE event.

---

## Sprint 3: OAuth + CC Context Fetch

### Sprint Goal

Enable CA to fetch contextual data from CC using OAuth, to enrich prompts.

### Tickets

#### TICKET-007: OAuth Flow Hardening

- [ ] Token acquisition and refresh; cache with expiry
- [ ] Circuit breaker for CC outages

#### TICKET-008: CC Context Endpoints

- [ ] Implement calls to CC APIs to fetch inventory/user context as needed
- [ ] Map CC responses to internal prompt blocks
- [ ] Feature flag to toggle CC context fetch

### Definition of Done

- [ ] With a valid token, CA can fetch and incorporate CC context
- [ ] Failure to fetch context degrades gracefully

---

## Integration Plan with CC (No code changes here)

- CC proxies existing chat routes to CA endpoints:
  - `POST /api/v0/chat/threads/{inventory}` → `POST CA /v1/threads`
  - `POST /api/v0/chat/threads/messages` → `POST CA /v1/messages` (stream)
  - `POST /api/v0/chat/threads/actions` → `POST CA /v1/actions` (optional)
- CA returns thread_id and streams responses; CC forwards to browser unchanged.
- Configuration: CC gets `CLIMATE_ADVISOR_BASE_URL` to target CA.

---

## API Contract (v1, summarized)

- `POST /v1/threads`
  - Input: `{ user_id, inventory_id?, context?: object|string }`
  - Output: `{ thread_id }`
- `POST /v1/messages` (stream)
  - Input: `{ thread_id, user_id, content, options?: {model?, temperature?} }`
  - Output: SSE/chunked stream of assistant tokens and terminal event
- `GET /v1/threads/{thread_id}` (optional later)
  - Output: `{ messages: [...]} `
- `POST /v1/actions` (optional)
- `POST /v1/files` (optional)

---

## Environment Variables (initial set)

- `CA_PORT` – default 8080
- `CA_LOG_LEVEL` – info|debug
- `OPENROUTER_API_KEY`
- `OPENROUTER_BASE_URL` – default `https://openrouter.ai/api/v1`
- `OPENROUTER_MODEL` – default model id
- `CC_BASE_URL` – base URL for CityCatalyst API
- `CC_OAUTH_CLIENT_ID`, `CC_OAUTH_CLIENT_SECRET`, `CC_OAUTH_TOKEN_URL`
- `REQUEST_TIMEOUT_MS`

---

## Non-Goals (for now)

- Persisting threads/messages in CA (persistence remains in CC as per architecture; CA stays stateless)
- Vector DB ingestion and file handling beyond API surface stubs
- Frontend (CC) code changes (will be handled in a separate PR)

