# Climate Advisor Service

Climate Advisor (CA) is a standalone FastAPI microservice that powers the
conversational experience for CityCatalyst (CC). The service lives under
`climate-advisor/service` and exposes versioned APIs under `/v1/*`.

- **Agentic AI**: Uses OpenAI's Agents SDK with an OpenAI-compatible chat
  client; OpenRouter is the default router and direct OpenAI chat endpoints are
  also supported
- **Persistent Threads And Messages**: PostgreSQL-backed conversation history
- **Vector Search**: Semantic search over climate knowledge base using pgvector
- **Tool Integration**:
  - General chat tools: climate knowledge search plus CityCatalyst inventory
    tools (`get_user_inventories`, `city_inventory_search`, `get_inventory`,
    `get_all_datasources`)
  - Stationary Energy draft review tools scoped to an active CA-owned draft run
- **Token Management**: JWT token refresh and caching for CityCatalyst API
  access
- **Streaming Responses**: Server-Sent Events (SSE) for real-time message
  delivery
- **Observable**: Optional LangSmith tracing plus MLflow request, artifact, and
  OpenAI trace logging

## Current Architecture

Climate Advisor runs two chat modes through the same `/v1/messages` endpoint:

1. General chat
   - Uses `prompts.default`
   - Always exposes `climate_vector_search`
   - Adds CityCatalyst inventory tools only when the request has token, user,
     and thread scope
2. Stationary Energy review chat
   - Activates when the request or thread context carries
     `stationary_energy_draft_run_id`
   - Loads the persisted draft snapshot into
     `STATIONARY_ENERGY_DRAFT_CONTEXT_JSON`
   - Appends `prompts.stationary_energy_review`
   - Registers scoped review tools that stage, preview, rollback, and save
     draft-review choices

At runtime:

- `ThreadService` and `ThreadResolver` own chat-thread lifecycle.
- `TokenHandler` loads and refreshes CityCatalyst tokens.
- `StreamingHandler` loads pruned history, optionally injects Stationary Energy
  draft context and `ui_context`, runs the agent, emits SSE events, and
  persists assistant messages.
- `AgentService` chooses the model and builds the tool pack for the current
  request.
- PostgreSQL stores threads, messages, embeddings, and Stationary Energy draft
  workflow state.

## Workflow

### 1. Create Thread

**Client Request:**

```http
POST /v1/threads
Content-Type: application/json

{
  "user_id": "user-123",
  "inventory_id": "inventory-456",
  "context": {
    "cc_access_token": "jwt_token_from_citycatalyst",
    "city_name": "San Francisco",
    "other_data": "..."
  }
}
```

**Server Response:**

```json
{
  "thread_id": "550e8400-e29b-41d4-a716-446655440000",
  "inventory_id": "inventory-456",
  "context": { "access_token": "...", "city_name": "San Francisco" }
}
```

**Processing:**

- `ThreadService` creates a UUID-based thread
- Stores thread with `user_id`, `inventory_id`, and `context` (`JSONB`)
- Returns `thread_id` for later `/v1/messages` calls

### 2. Send Message And Stream Response

**Client Request:**

```http
POST /v1/messages
Content-Type: application/json

{
  "user_id": "user-123",
  "content": "What are the top climate risks for San Francisco?",
  "thread_id": "550e8400-e29b-41d4-a716-446655440000",
  "inventory_id": "inventory-456",
  "context": {
    "cc_access_token": "jwt_token_from_citycatalyst"
  },
  "options": {
    "model": "openai/gpt-5.4-mini"
  }
}
```

If `thread_id` is omitted, Climate Advisor creates a new thread. If `thread_id`
is supplied, it must already exist and belong to the requesting user.

**Server Response (SSE Stream):**

```text
event: message
data: {"content": "The top climate risks..."}

event: tool_result
data: {"name": "climate_vector_search", "status": "executing", "arguments": {"question": "climate risks San Francisco"}}

event: message
data: {"content": "Based on the analysis..."}

event: done
data: {}
```

**Processing Pipeline:**

1. **Thread Resolution**
   - If no `thread_id` is provided, creates a new thread with context
   - If `thread_id` is provided, validates that the thread exists and belongs to
     the user
2. **Token Management**
   - Loads the CityCatalyst access token from request context or thread context
   - Refreshes it through CityCatalyst when needed
3. **Context Loading**
   - Loads pruned conversation history from PostgreSQL
   - If a `stationary_energy_draft_run_id` is active, loads the persisted draft
     snapshot plus request-scoped `ui_context`
4. **Message Persistence**
   - Stores the user message in PostgreSQL
5. **Agent Execution**
   - `AgentService` creates the agent with the configured model
   - Registers the correct tool pack for the active workflow
   - Runs the agent with the user message and any loaded context
   - Streams response tokens and tool outputs as SSE events
6. **Response Persistence**
   - After streaming completes, stores the assistant message with tool usage

### 3. Tool Packs

**Always available**

- `climate_vector_search`
  - Semantic search over the internal climate knowledge base
  - Used for general climate-science, accounting, policy, and standards
    questions

**Added for CityCatalyst inventory chat**

- `get_user_inventories`
- `city_inventory_search`
- `get_inventory`
- `get_all_datasources`

These wrappers use the scoped bearer token, refresh it if needed, and trim the
response payload before it is sent back to the model.

**Added for active Stationary Energy draft review chat**

- `stationary_energy_list_review_options`
- `stationary_energy_accept_one`
- `stationary_energy_accept_multiple`
- `stationary_energy_accept_all_recommended`
- `stationary_energy_request_bulk_review_confirmation`
- `stationary_energy_request_all_recommended_confirmation`
- `stationary_energy_request_staged_source_change_confirmation`
- `stationary_energy_request_staged_sources_rollback_confirmation`
- `stationary_energy_rollback_staged_sources`
- `stationary_energy_save_review_draft`
- `stationary_energy_request_inventory_save_confirmation`

These tools operate on CA-owned persisted draft state and return `tool_result`
payloads that may include review-specific `ui_event` values for the CityCatalyst
browser UI.

### 4. Stationary Energy Review Chat

When a request is scoped to an active `stationary_energy_draft_run_id`:

1. `StreamingHandler` loads the persisted CA draft snapshot, including
   `source_candidates`, `proposals`, `review_decisions`, and active
   `staged_review_selections`
2. Request-scoped UI state such as focused row, confirmed bulk choices, and
   confirmed rollback choices is attached as `ui_context`
3. `AgentService` appends `prompts.stationary_energy_review` and registers the
   scoped review tools
4. Review tools stage temporary selections first, then save them into durable
   `review_decisions` only when the user asks to save the reviewed draft
5. Save-to-inventory stays a separate CityCatalyst confirmation step. CA chat
   returns the confirmation payload but does not write the inventory directly

Stationary Energy review `tool_result` payloads may include these `ui_event`
values:

- `stationary_energy_review_state_changed`
- `stationary_energy_review_bulk_confirmation_requested`
- `stationary_energy_review_change_confirmation_requested`
- `stationary_energy_review_rollback_confirmation_requested`
- `stationary_energy_inventory_save_confirmation_requested`

## Local Development

### Prerequisites

- Python 3.11+
- PostgreSQL 15+ (via Docker recommended)
- `uv`

### 1. Clone And Setup

```bash
cd climate-advisor
uv sync --locked --group dev
```

### 2. Configure Environment

Create `.env` in `climate-advisor/`:

```bash
# Required
OPENROUTER_API_KEY=your-openrouter-api-key

# Recommended host-facing DB URL for local development (avoids conflict with
# CityCatalyst Postgres on localhost:5432)
CA_DATABASE_URL=postgresql://climateadvisor:climateadvisor@localhost:5433/climateadvisor

# Optional
CA_PORT=8080
CA_LOG_LEVEL=info
CA_CORS_ORIGINS=*
OPENAI_API_KEY=your-openai-api-key
LANGSMITH_API_KEY=your-langsmith-key

# Optional - CityCatalyst integration
CC_BASE_URL=http://localhost:3000
```

### 3. Start PostgreSQL

Recommended (uses `docker-compose.yml` in `climate-advisor/`):

```bash
cd climate-advisor
docker compose up -d postgres
```

Make sure Docker Desktop (or another Docker daemon) is running before invoking
`docker compose`.

If you use this compose-based PostgreSQL setup and run the CA service on your
host (not in Docker), use:

```bash
CA_DATABASE_URL=postgresql://climateadvisor:climateadvisor@localhost:5433/climateadvisor
```

If you run a dedicated CA PostgreSQL instance directly on host port `5432`
without CityCatalyst using that port, `localhost:5432` can also work.

Manual alternative:

```bash
docker run --name ca-postgres \
  -e POSTGRES_USER=climateadvisor \
  -e POSTGRES_PASSWORD=climateadvisor \
  -e POSTGRES_DB=climateadvisor \
  -p 5432:5432 \
  -d pgvector/pgvector:pg15

docker exec ca-postgres psql -U climateadvisor -d climateadvisor -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### 4. Install Dependencies And Setup Database

```bash
cd climate-advisor
uv sync --locked --group dev
uv run python scripts/setup_database.py
```

### 5. Run The Service

```bash
cd climate-advisor
uv run --directory service uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload
```

### 6. Verify Setup

- **API Docs**: http://localhost:8080/docs
- **ReDoc**: http://localhost:8080/redoc
- **Playground**: http://localhost:8080/playground
- **Health Check**: http://localhost:8080/health

## Configuration

### LLM Configuration

All non-secret LLM settings are centralized in `llm_config.yaml`, including the
orchestrator and agentic-flow model settings, provider base URLs, retry and
timeout settings, and Stationary Energy review chat-context prompt budgets.
Stationary Energy draft proposals are generated deterministically from bounded
CityCatalyst context, not by an LLM prompt. The environment is only for secrets
such as `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, and `LANGSMITH_API_KEY`.

Prompt paths are also configured in `llm_config.yaml`:

- `prompts.default` drives general Climate Advisor chat
- `prompts.inventory_context` is appended when CA can load inventory metadata
- `prompts.stationary_energy_review` drives active Stationary Energy draft
  review chat

Some prompt files use reusable fragments with
`{{ include: tools/example.md }}` directives. Includes are resolved relative to
the including prompt first and then against the configured prompt search roots.

### Stationary Energy Tool Message Localization

Stationary Energy review tools return localized-message metadata instead of
English display strings. Tool results set `message_key` to a stable key from
CityCatalyst's `stationary-energy-agentic.json` namespace and `message_params`
to simple interpolation values such as counts or statuses.

Climate Advisor does not translate those messages directly because it is a
backend service. It does not own CityCatalyst locale files, the active browser
language, or client-side fallback behavior. The boundary is:

- Climate Advisor owns tool outcome semantics
- CityCatalyst owns user-facing copy and locale rendering

### Environment Variables

- `OPENROUTER_API_KEY` - OpenRouter API key for LLM access
- `CA_DATABASE_URL` - PostgreSQL connection string
- `CA_PORT` - Server port (default: `8080`)
- `CA_LOG_LEVEL` - Logging level: `info|debug` (default: `info`)
- `CA_CORS_ORIGINS` - CORS allowed origins (default: `*`)
- `OPENAI_API_KEY` - OpenAI API key for embeddings
- `LANGSMITH_API_KEY` - LangSmith API key when tracing is enabled
- `CC_BASE_URL` - CityCatalyst base URL for inventory API and token refresh
- `MLFLOW_ENABLED` - Enables best-effort MLflow logging when set to `true`
- `MLFLOW_TRACKING_URI` - Shared MLflow backend URL, normally
  `https://mlflow-dev.openearth.dev`
- `MLFLOW_ENVIRONMENT` - Environment tag for runs: `dev`, `test`, or `prod`
- `MLFLOW_EXPERIMENT_NAME` - Experiment for general CA chat, default `clima`
- `MLFLOW_AGENTIC_EXPERIMENT_NAME` - Experiment for Stationary Energy agentic
  flow runs, default `agentic-flow`
- `MLFLOW_RUN_USER` - Service identity shown in MLflow's `Created by` field,
  default `climate-advisor`
- `MLFLOW_HTTP_REQUEST_TIMEOUT` - MLflow client HTTP timeout in seconds. Keep
  this low, for example `3`, so bad or unreachable tracking URLs fail fast.
- `MLFLOW_HTTP_REQUEST_MAX_RETRIES` - Number of extra MLflow HTTP retry attempts
  after the initial failure. Keep this low, for example `1`.
- `MLFLOW_HTTP_REQUEST_BACKOFF_FACTOR` - MLflow retry backoff multiplier, for
  example `1`.
- `MLFLOW_HTTP_REQUEST_BACKOFF_JITTER` - Extra random retry delay. Set this to
  `0` for deterministic local testing.
- `MLFLOW_ASYNC_LOGGING_ENABLED` - Enables async MLflow tag, param, and metric
  logging where supported
- `GIT_PYTHON_REFRESH` - Set to `quiet` to suppress GitPython warnings from
  MLflow in containers without `git`

## Database Schema

### Thread Table

Stores conversation threads linked to users:

```sql
CREATE TABLE threads (
  thread_id UUID PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL INDEX,
  inventory_id VARCHAR(255),
  context JSONB,
  title VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

Typical `context` fields include access-token metadata plus workflow-scoping
data such as a persisted `stationary_energy_draft_run_id`.

### Message Table

Stores all messages in conversations:

```sql
CREATE TABLE messages (
  message_id UUID PRIMARY KEY,
  thread_id UUID FOREIGN KEY,
  text TEXT NOT NULL,
  role ENUM('user', 'assistant'),
  tools_used JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

`tools_used` stores tool invocation metadata for audit and debugging. The LLM
history path may prune older tool payloads before a run, but the DB rows keep
the full saved metadata.

### Stationary Energy Draft Tables

Climate Advisor also persists CA-owned Stationary Energy draft workflow state:

- `stationary_energy_draft_runs`
  - One persisted draft workflow, optionally linked back to a chat thread
- `stationary_energy_draft_source_candidates`
  - Candidate datasources and normalized source rows captured for the draft
- `stationary_energy_draft_proposals`
  - Per-row proposed values plus recommended and alternate candidate references
- `stationary_energy_review_decisions`
  - Durable saved review decisions with versioning and commit status
- `stationary_energy_staged_review_selections`
  - Active temporary chat-staged selections awaiting save, change, or rollback

`StreamingHandler` loads this state into chat context when the request is
scoped to an active `stationary_energy_draft_run_id`.

### DocumentEmbedding Table

Vector storage for RAG:

```sql
CREATE TABLE document_embeddings (
  embedding_id UUID PRIMARY KEY,
  filename VARCHAR(255),
  chunk_index INT,
  chunk_size INT,
  content TEXT,
  embedding_vector VECTOR(3072),
  model_name VARCHAR(100),
  file_path VARCHAR(500),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX ix_document_embeddings_vector
ON document_embeddings
USING ivfflat (embedding_vector vector_cosine_ops)
WITH (lists = 100);
```

## Vector Database Setup

### 1. Populate Vector Database

```bash
cd climate-advisor

# Add PDF files to `files/` directory
cp /path/to/documents/*.pdf vector_db/files/

# Process PDFs and upload embeddings
uv run python vector_db/upload_to_db.py --directory vector_db/files
```

### 2. Vector Search Configuration

Edit `vector_db/embedding_config.yml`:

```yaml
text_processing:
  max_token_limit: 8000

chunking:
  default_chunk_size: 2000
  default_chunk_overlap: 200

embedding_service:
  batch_size: 100
  requests_per_minute: 3000
```

### 3. Create Vector Index (After Data)

```bash
docker exec ca-postgres psql -U climateadvisor -d climateadvisor << EOF
CREATE INDEX IF NOT EXISTS ix_document_embeddings_vector
ON document_embeddings
USING ivfflat (embedding_vector vector_cosine_ops)
WITH (lists = 100);
EOF
```

## API Endpoints

### Health Check

```http
GET /health
```

**Response:**

```json
{
  "status": "ok"
}
```

### Create Thread

```http
POST /v1/threads
Content-Type: application/json

{
  "user_id": "user-123",
  "inventory_id": "inv-456",
  "context": { "data": "..." }
}
```

**Response (201):**

```json
{
  "thread_id": "550e8400-e29b-41d4-a716-446655440000",
  "inventory_id": "inv-456",
  "context": { "data": "..." }
}
```

### Send Message And Stream Response

```http
POST /v1/messages
Content-Type: application/json

{
  "user_id": "user-123",
  "content": "What are climate risks?",
  "thread_id": "550e8400-e29b-41d4-a716-446655440000",
  "inventory_id": "inv-456",
  "options": { "model": "openai/gpt-5.4-mini" }
}
```

When calling `/v1/messages` directly, create the thread first via `/v1/threads`
or omit `thread_id` and let the service start a new conversation.

**Response (200, `text/event-stream`):**

```text
event: message
data: {"content": "Climate risks include..."}

event: tool_result
data: {"name": "climate_vector_search", "status": "executing", "arguments": {...}}

event: done
data: {}
```

## CityCatalyst Integration

### Token Management

1. **Token from request**: Client includes JWT in payload context
2. **Token from thread**: Service loads token from existing thread context
3. **Token refresh**: If token expires, service calls the CityCatalyst token
   endpoint
4. **Token persistence**: Valid tokens are stored in thread context JSONB

### Inventory API Access

The CityCatalyst inventory tool pack exposes:

- `get_user_inventories`
- `city_inventory_search`
- `get_inventory`
- `get_all_datasources`

These tools:

- construct requests to CityCatalyst inventory endpoints
- automatically include the scoped JWT in the `Authorization` header
- refresh the token when needed
- return trimmed payloads to the agent for lower token cost

### Stationary Energy Draft Review Boundary

The Stationary Energy review tool pack uses the same scoped CityCatalyst token
for draft-save flows, but the ownership split is:

- Climate Advisor owns pre-commit draft state, staged review selections, and
  saved review decisions
- CityCatalyst owns the final user-facing inventory-write confirmation and
  commit flow

## Testing

### Run All Tests

```bash
cd climate-advisor
uv run --directory service pytest tests/ -v
```

### Run Specific Test

```bash
uv run --directory service pytest tests/test_e2e_conversation.py -v
```

### Prompt Flow Smoke Test

```bash
uv run --directory service python -m scripts.run_ca_e2e
```

## Docker Deployment (Local Testing)

This section is for local development and testing. It builds the Climate
Advisor image from your local working tree so your unpushed code changes are
included.

### Build Image (Local Source)

```bash
cd climate-advisor
docker build -f service/Dockerfile -t climate-advisor:dev .
```

### Run Container

```bash
docker run --rm \
  --env-file .env \
  -p 8080:8080 \
  climate-advisor:dev
```

### Docker Compose (With PostgreSQL)

Use the committed compose file at `climate-advisor/docker-compose.yml`:

```bash
cd climate-advisor

# Start both services
docker compose up -d --build

# View logs
docker compose logs -f climate-advisor

# Stop and remove containers
docker compose down
```

Notes:

- The compose setup uses `pgvector/pgvector:pg15` for PostgreSQL with vector
  support
- The app image and tag used for compose are local (`climate-advisor:dev`) and
  built from your local source
- The compose service is configured with `pull_policy: never` to avoid pulling
  remote images during local testing
- `.env.example` defaults `CA_DATABASE_URL` to `localhost:5433` to avoid
  conflict with CityCatalyst's local PostgreSQL on `5432`
- PostgreSQL is published on `localhost:5433` in compose to avoid conflicts
  with CityCatalyst's local PostgreSQL on `5432`
- Inside the compose network, Climate Advisor still connects to PostgreSQL on
  `postgres:5432`
- Because of this network difference, compose sets `CA_DATABASE_URL`
  explicitly in `docker-compose.yml`
- For local Docker testing against a host-running CityCatalyst app, compose
  overrides `CC_BASE_URL` to `http://host.docker.internal:3000`
- The compose service runs Alembic migrations automatically on startup before
  launching Uvicorn

## Observability

### MLflow Integration

Climate Advisor can log to the same deployed MLflow instance used by
HIAP-MEED. The split is experiment-based:

- `hiap-meed` remains the existing HIAP-MEED experiment
- `clima` stores general `/v1/messages` chat runs
- `agentic-flow` stores Stationary Energy draft, review, save,
  background generation, and draft-context chat runs

Each run includes tags such as `service`, `environment`, `workflow`,
`request_id`, `thread_id`, `inventory_id`, and
`stationary_energy_draft_run_id` when present. Full debug artifacts are logged
with bearer tokens, API keys, JWTs, and secrets redacted.

The shared MLflow variables match HIAP-MEED (`MLFLOW_ENABLED`,
`MLFLOW_TRACKING_URI`, `MLFLOW_EXPERIMENT_NAME`, `MLFLOW_ENVIRONMENT`,
`MLFLOW_HTTP_REQUEST_*`, `GIT_PYTHON_REFRESH`, and
`MLFLOW_ASYNC_LOGGING_ENABLED`). Climate Advisor adds
`MLFLOW_AGENTIC_EXPERIMENT_NAME` because it writes Stationary Energy agentic
runs to a separate experiment, and `MLFLOW_RUN_USER` so MLflow's `Created by`
field is a stable service identity rather than the local OS/container user.

GitHub Actions deployments can override the two experiment names through
repository variables named `MLFLOW_EXPERIMENT_NAME` and
`MLFLOW_AGENTIC_EXPERIMENT_NAME`. They are variables, not secrets, because the
values are non-sensitive experiment names. The Kubernetes manifests still keep
the same defaults so direct `kubectl apply` deployments work without GitHub.

Before enabling MLflow in an environment:

1. Confirm the MLflow UI is reachable at `https://mlflow-dev.openearth.dev`.
2. Confirm or create experiments named `clima` and `agentic-flow`.
3. Set the MLflow environment variables documented above in `.env` or the
   Kubernetes deployment.
4. If the MLflow server later requires authentication, provide MLflow auth
   variables through Kubernetes secrets rather than configmaps.

### LangSmith Integration

Enable tracing to monitor agent executions, tool usage, and performance:

1. **Get API Key**: https://smith.langchain.com/
2. **Set Environment Variable**:

   ```bash
   export LANGSMITH_API_KEY=your_api_key
   ```

3. **Enable In Config** (`llm_config.yaml`):

   ```yaml
   observability:
     langsmith:
       project: "climate_advisor"
       endpoint: "https://api.smith.langchain.com"
       tracing_enabled: true
   ```

### Request Logging

Each request includes a unique request ID (`X-Request-Id`) for tracing:

```text
2025-01-29 10:15:32 - app.routes.messages - INFO - POST /messages - user_id=user-123, thread_id=550e8400..., content_length=42
```

Stationary Energy context chat also uses workflow-specific trace metadata so it
can be separated from general conversation traffic.

## Troubleshooting

### `uv sync` TLS Or Certificate Errors On Windows

If `uv sync --locked --group dev` fails with `invalid peer certificate:
UnknownIssuer` and your shell is exporting `SSL_CERT_FILE` from Anaconda,
clear that variable for the current shell and retry:

```powershell
Remove-Item Env:SSL_CERT_FILE -ErrorAction SilentlyContinue
uv sync --locked --group dev --native-tls
```

### Database Connection Issues

If `docker compose up -d postgres` fails before creating the container, confirm
that Docker Desktop is running and `docker version` shows both client and
server sections.

```bash
# Test connection
uv run --directory service python -c "from app.db.session import get_session_factory; print('OK')"

# Check migrations
uv run --directory service python -m alembic current
```

### Vector Search Not Working

```bash
# Verify pgvector extension
docker exec ca-postgres psql -U climateadvisor -d climateadvisor -c "\dx vector"

# Check embeddings table
docker exec ca-postgres psql -U climateadvisor -d climateadvisor -c "SELECT COUNT(*) FROM document_embeddings;"
```

### Token Refresh Failures

Enable debug logging:

```bash
export CA_LOG_LEVEL=debug
uv run --directory service uvicorn app.main:app --reload
```

Check token-handler logs for `CC_BASE_URL` and token-endpoint issues.

### LangSmith SSL Warnings During Local Tests

If the test suite passes but LangSmith emits post-run SSL warnings because the
local machine cannot validate `api.smith.langchain.com`, disable tracing for
the current shell while running tests:

```powershell
Remove-Item Env:LANGSMITH_API_KEY -ErrorAction SilentlyContinue
$env:LANGSMITH_TRACING = "false"
uv run --directory service pytest tests/ -v
```

## Contributing

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Make changes and add tests
3. Run `cd climate-advisor && uv run --directory service pytest tests/ -v`
4. Submit a pull request

## License

See `LICENSE.md` for details.
