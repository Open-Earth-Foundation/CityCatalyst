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
    tools (`inventory_list_accessible`, `inventory_status_overview`,
    `inventory_emissions_context`, and temporary legacy
    `get_all_datasources`)
  - Pre-draft Stationary Energy chat tool (`stationary_energy_start_draft`)
    available only before a draft run is active
  - Stationary Energy draft review tools scoped to an active CA-owned draft run
- **Token Management**: JWT token refresh and caching for CityCatalyst API
  access
- **Streaming Responses**: Server-Sent Events (SSE) for real-time message
  delivery
- **Observable**: Optional LangSmith tracing plus MLflow request, artifact, and
  OpenAI trace logging
- **Offline CNB Research Review**: Firecrawl-backed funding research plus a
  local static editor for selecting, correcting, and saving review updates

## Current Architecture

Climate Advisor runs two chat modes through the same `/v1/messages` endpoint:

1. General chat
   - Composes `prompts.core` with `prompts.chat`
   - Always exposes `climate_vector_search`
   - Adds CityCatalyst inventory tools only when the request has token, user,
     and thread scope
2. Stationary Energy review chat
   - Activates when the request or thread context carries
     `stationary_energy_draft_run_id`
   - Loads the composed `prompts.core + prompts.stationary_energy_review`
     instructions, then appends the persisted draft snapshot as
     `STATIONARY_ENERGY_DRAFT_CONTEXT_JSON` inside a `<context>...</context>`
     block
   - Composes `prompts.core` with `prompts.stationary_energy_review`
   - Registers only scoped review tools that stage, preview, rollback, and save
     draft-review choices, including notation-key choices

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

## Offline CNB Funding Research

The offline CNB workflow researches one known funder/program, or a strict batch
of known programs, and discovers their funded projects under
`output/cnb_research/`. Generated runs are ignored except for the single tracked
EUCF reference bundle. The funded-project command always requires a current
project JSON profile and embeds it in every research request so its sectors,
location, interventions, finance route, and curated tags guide queries and
project prioritization. Metadata-only project profiles are rejected. A
canonical-funder snapshot is optional during this
discovery step; when supplied, it adds possible canonical IDs for later review
without narrowing the search or selecting an ID. Batch manifests contain only
funder/program source seeds; they never contain hand-authored candidate
projects. `target_funded_projects` optionally keeps each program run in breadth
discovery after the first deeply evidenced project; it defaults to one and is
bounded at 50. The similar-project wrapper uses a 20-turn research budget when
`max_turns` is omitted while preserving an explicit caller value. A failed batch
entry can be rerun reproducibly with its 1-based `--request-index N`; that
selected run writes the normal per-run artifact without replacing the full batch
index. Run the commands from `climate-advisor/`:

```powershell
uv run python -m scripts.cnb_research.research_funding_opportunity `
  --input path/to/research-request.json `
  --output output/cnb_research

uv run python -m scripts.cnb_research.research_funded_projects `
  --project path/to/current-project.json `
  --input path/to/research-request.json `
  --output output/cnb_research

# Optional identity enrichment for later review/import preparation.
uv run python -m scripts.cnb_research.research_funded_projects `
  --project path/to/current-project.json `
  --input path/to/award-portfolio-batch.json `
  --funders path/to/canonical-funders.json `
  --output output/cnb_research

uv run python -m scripts.cnb_research.run_similar_project_matching `
  --search-request path/to/search-request.json `
  --funders path/to/canonical-funders.json `
  --research path/to/run-a.research.json --review path/to/run-a.review.json `
  --research path/to/run-b.research.json --review path/to/run-b.review.json `
  --output output/cnb_research

uv run python -m http.server 8080
```

Visit `http://localhost:8080/scripts/cnb_research/review.html`, load a generated
`<run_id>.research.json` or `<run_id>.similar-projects.json`, and browse its
collapsible sections. Corpus review edits findings and reviewer-curated tags,
selects one proposed canonical funder for every funded project, and saves
`<run_id>.review.json`. Similar-project review inspects the current project,
candidate context, model rationale, evidence, and caveats; reviewers can keep or
exclude matches and save `<run_id>.similar-project-review.json`. Technical
references remain preserved but read-only. The browser never modifies the input
file or writes to a database.

The local importer pairs the files only when their `run_id` values match. It
requires an approved review, an existing reviewer-selected `funder_id`, and
retained evidence for every imported project. Set `CNB_DATABASE_URL` to the
externally managed CNB PostgreSQL database and validate before writing:

```powershell
uv run python -m scripts.cnb_research.import_reviewed_reference_data `
  --research output/cnb_research/<run_id>/<run_id>.research.json `
  --review output/cnb_research/<run_id>/<run_id>.review.json `
  --dry-run
```

Remove `--dry-run` only after validation. This importer is the sole database
writer in the research/review workflow; Climate Advisor does not create or
migrate the managed CNB tables. Pairing deliberately does not use a file hash.
If no proposed canonical funder is valid, research and import that funder before
retrying the funded-project import.

The tracked reference output is
`output/cnb_research/ef602f2c-f47d-4384-b079-5fdfde085ad4/research_bundle.json`.

Research bundles use schema version `2.0`. They mirror the CNB architecture with
one funder, one shared `funding_records` collection distinguished by
`is_opportunity`, and linked template and criteria collections. Each funded
project keeps its interventions, award amount, currency, `award_year`, status,
summary, and reviewed `project_tags` in one record.

Runtime similar-project matching is internal workflow logic, not an agent tool.
It waits for an ingested project upload and reads reviewed awards through the
typed CNB reference-data contract. `same_funder` is the default retrieval scope;
an explicit `cross_funder` request may compare reviewed awards from multiple
canonical funders while retaining each candidate's real funder identity. It
validates structured LLM
selected/rejected decisions, persists selected matches through the external
workflow-store contract, rebuilds only `context_bundle.similar_projects`, and
returns the generic `concept_note_context_bundle_ready` signal. Missing or weak
examples continue with a caveat rather than blocking the CNB workflow. The
datateam reference endpoint, filtering contract, and production storage adapters
remain external integration points; the safe default returns no candidates.
`run_similar_project_matching.py` is a provider-backed local QA harness over the
same service. Its reviewed-pair mode validates approved
`<run_id>.research.json`/`<run_id>.review.json` pairs with the importer contract
and deterministically derives candidates from their evidence-backed funded
projects. The original explicit-candidate input remains available for focused
tests. Reviewed-pair artifacts record the resolved funder snapshot and every
research/review input path; fixture mode may record one optional source bundle.
Both modes accept an explicitly post-ingestion request and write only review
artifacts through in-memory adapters with provider-side response storage
disabled. A successful local run therefore validates prompt/model behavior and
the review contract, not production upload ingestion, reference-data access,
persistence, or production UUIDs.

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
   - For Stationary Energy review chat, the first model input is the composed
     `prompts.core + prompts.stationary_energy_review` instruction text
     followed by the draft snapshot in `<context>...</context>`
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

**Available outside active Stationary Energy review chat**

- `climate_vector_search`
  - Semantic search over the internal climate knowledge base
  - Used for general climate-science, accounting, policy, and standards
    questions

**Added for CityCatalyst inventory chat**

- `inventory_list_accessible`
  - Lists all accessible city/year inventories, or filters by city and year.
  - Returns organization/project metadata and a `by_project` breakdown so Clima
    can answer count questions with an access summary.
  - Requires name, type, and GWP disambiguation when one city/year has multiple
    inventories.
- `inventory_status_overview`
  - Summarizes selected-inventory metadata, completion, and filled/missing
    sector state.
- `inventory_emissions_context`
  - Summarizes selected-inventory total emissions, sector shares, top emitters,
    and source mix.
- `get_all_datasources`
  - Temporary legacy datasource tool used only after an inventory is selected.

These tools use the scoped bearer token, refresh it if needed, and keep raw
CityCatalyst IDs internal to tool chaining rather than user-facing responses.
When city/year is ambiguous, the prompt asks the user to choose by inventory
name, type, and GWP before calling detail tools.

**Added for pre-draft Stationary Energy chat**

- `stationary_energy_start_draft`

This tool is registered only when the Stationary Energy draft surface is active
and no draft run is already under review. It starts deterministic draft
generation from the scoped city and inventory, then the browser loads the new
draft for review.

**Added for active Stationary Energy draft review chat**

- `stationary_energy_list_review_options`
- `stationary_energy_list_notation_keys`
- `stationary_energy_accept_one`
- `stationary_energy_stage_notation_key`
- `stationary_energy_accept_multiple`
- `stationary_energy_accept_all_recommended`
- `stationary_energy_request_bulk_review_confirmation`
- `stationary_energy_request_bulk_notation_confirmation`
- `stationary_energy_apply_bulk_notation_choices`
- `stationary_energy_request_all_recommended_confirmation`
- `stationary_energy_request_staged_source_change_confirmation`
- `stationary_energy_request_staged_sources_rollback_confirmation`
- `stationary_energy_rollback_staged_sources`
- `stationary_energy_rollback_staged_notation_keys`
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
3. `AgentService` uses `prompts.stationary_energy_review` as the active
   instructions and registers only the scoped review tools
4. Review tools stage temporary selections first, then save them into durable
   `review_decisions` only when the user asks to save the reviewed draft
5. Notation-key tools use the same staged-first boundary. They list eligible
   Stationary Energy rows and the allowed settable keys (`NO`, `NE`, `IE`,
   `C`), stage or roll back notation choices in CA state, and never write
   directly to inventory from chat
6. Save-to-inventory stays a separate CityCatalyst confirmation step. CA chat
   returns the confirmation payload but does not write the inventory directly

Stationary Energy `tool_result` payloads may include these `ui_event` values:

- `stationary_energy_review_state_changed`
- `stationary_energy_review_bulk_confirmation_requested`
- `stationary_energy_review_change_confirmation_requested`
- `stationary_energy_review_rollback_confirmation_requested`
- `stationary_energy_inventory_save_confirmation_requested`
- `stationary_energy_draft_started`

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

- `prompts.core` is the shared Clima base prompt used by every workflow
- `prompts.chat` is the workflow prompt for general Climate Advisor chat
- `prompts.stationary_energy_review` is the workflow prompt for active
  Stationary Energy draft review chat

At runtime, CA composes the final system instructions as:

- general chat: `prompts.core + prompts.chat`
- Stationary Energy review chat: `prompts.core + prompts.stationary_energy_review`

Workflow prompt `<tools>` sections load shared tool-policy fragments with
`{{ include: ... }}` directives. Exact tool argument contracts come from the
registered runtime tool definitions rather than duplicated prompt text.
Each configured prompt file remains schema-complete with `<role>`, `<task>`,
`<input>`, and `<output>` blocks; runtime composition wraps the workflow prompt
inside `<additional_instructions>`.

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
- `CC_API_KEY` - Service credential used when CA asks CC to validate the
  CC-issued user bearer token
- `CNB_MARKDOWN_REQUEST_MAX_BYTES` - Complete JSON request-body limit for the
  optional CC-to-CA Markdown ingest endpoint (default `20971520`; this is an
  operational body guard, not a source-PDF or page-count acceptance limit)
- `MLFLOW_ENABLED` - Enables best-effort MLflow logging when set to `true`
- `MLFLOW_TRACKING_URI` - Shared MLflow backend URL, normally
  `https://mlflow-dev.openearth.dev`
- `MLFLOW_ENVIRONMENT` - Environment tag for runs: `dev`, `test`, or `prod`
- `MLFLOW_EXPERIMENT_NAME` - Experiment for all Climate Advisor MLflow runs,
  default `Clima`
- `MLFLOW_HTTP_REQUEST_TIMEOUT` - MLflow HTTP timeout in seconds; use `3` to
  match the shared HIAP-MEED fail-open tuning
- `MLFLOW_HTTP_REQUEST_MAX_RETRIES` - MLflow HTTP retry count; use `1`
- `MLFLOW_HTTP_REQUEST_BACKOFF_FACTOR` - MLflow retry backoff factor; use `1`
- `MLFLOW_HTTP_REQUEST_BACKOFF_JITTER` - MLflow retry jitter; use `0`
- `GIT_PYTHON_REFRESH` - Set to `quiet` so service runtimes without `git` do
  not emit GitPython warnings during MLflow initialization
- `MLFLOW_ASYNC_LOGGING_ENABLED` - Enables MLflow async logging when set to
  `true`

### CC-produced Concept Note Markdown baseline

`POST /v1/concept-notes/{run_id}/uploads/{upload_id}/markdown` validates the
CC-issued user token through CC before consuming the request, streams the body
up to `CNB_MARKDOWN_REQUEST_MAX_BYTES`, recomputes SHA-256, verifies contiguous
page markers and their positive metadata count without imposing a page-count
limit, and delegates atomic run/upload registration to a repository
interface. CA owns no OCR queue, Mistral dependency, or S3 permission. Until
the datateam repository adapter is configured, the production provider returns
`503 cnb_storage_unavailable`; contract tests inject an in-memory repository.

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
  - Durable saved review decisions with versioning, commit status, and optional
    notation-key metadata
- `stationary_energy_staged_review_selections`
  - Active temporary chat-staged source or notation-key selections awaiting
    save, change, or rollback

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

The default Clima inventory tool pack exposes:

- `inventory_list_accessible`
- `inventory_status_overview`
- `inventory_emissions_context`
- `get_all_datasources` as the temporary legacy datasource lookup

These tools:

- construct requests to CityCatalyst inventory capability endpoints
- automatically include the scoped JWT in the `Authorization` header
- refresh and persist the token when needed
- return compact, read-only inventory context to the agent, including
  organization/project breakdown fields from `inventory_list_accessible`
- require inventory name, type, and GWP disambiguation when city/year is not
  unique
- answer inventory/city count questions as "you have access to" summaries using
  totals plus `by_project`

### Stationary Energy Draft Review Boundary

The Stationary Energy review tool pack uses the same scoped CityCatalyst token
for draft-save flows, but the ownership split is:

- Climate Advisor owns pre-commit draft state, staged review selections, and
  saved review decisions, including notation-key choices
- CityCatalyst owns the final user-facing inventory-write confirmation and
  commit flow
- The agent can list notation-key targets and stage `NO`, `NE`, `IE`, or `C`
  choices, but committed notation-key writes happen only after the reviewed
  draft is saved and the existing inventory-save confirmation is approved

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
HIAP-MEED. The split is experiment-based between services, and tag-based inside
Climate Advisor:

- `hiap-meed` remains the existing HIAP-MEED experiment
- `Clima` stores all Climate Advisor runs, including general `/v1/messages`
  chat, Stationary Energy draft, review, save, background generation, and
  draft-context chat runs, plus offline CNB funding-opportunity research

Each run includes tags such as `service`, `environment`, `workflow`,
`prompt_name`, `request_id`, `thread_id`, `inventory_id`, and
`stationary_energy_draft_run_id` when present. Full debug artifacts are logged
with bearer tokens, API keys, JWTs, and secrets redacted.

Each streamed `/v1/messages` model turn emits one MLflow trace. Climate Advisor
also assigns the active trace session to the CA `thread_id`, so MLflow's
session grouping shows all turns from the same UI conversation together while
still preserving per-turn trace detail.

The shared MLflow variables match HIAP-MEED where deployment needs explicit
configuration (`MLFLOW_ENABLED`, `MLFLOW_TRACKING_URI`,
`MLFLOW_EXPERIMENT_NAME`, `MLFLOW_ENVIRONMENT`, the
`MLFLOW_HTTP_REQUEST_*` timeout/retry settings, `GIT_PYTHON_REFRESH`, and
`MLFLOW_ASYNC_LOGGING_ENABLED`). Agentic and general Climate Advisor flows are
separated by MLflow tags such as `workflow` and `context_mode`; active
Stationary Energy draft chat is tagged `prompt_name=stationary_energy_review`,
while general chat is tagged `prompt_name=chat`. MLflow request previews for
active Stationary Energy turns show the composed shared core plus Stationary
Energy workflow prompt first, followed by the draft JSON context in
`<context>...</context>`. Other operational defaults such as the MLflow
`Created by` service identity are handled in code.

The offline CNB research CLI tags runs with
`module=concept_note_builder` and
`workflow=cnb_funding_opportunity_research`. It records the exact model,
reasoning effort, prompt SHA-256, turn usage, coverage counts, redacted review
artifacts, exact Markdown source snapshots, and the MLflow run ID embedded in
local `research_bundle.json`. Each run uses one parent workflow trace containing
the model and Firecrawl spans so tool latency and handled provider failures stay
visible with the model calls. The generic funding-opportunity CLI uses the
shared 15-turn model default when `max_turns` is omitted. The funded-project
similar-search wrapper applies its scoped 20-turn default before validation.

Pytest disables MLflow before test collection. Tests may exercise the logging
helpers with in-memory fakes, but they do not send runs or traces to the remote
`Clima` experiment.

GitHub Actions deployments can override the experiment name through the
repository variable `MLFLOW_EXPERIMENT_NAME`. It is a variable, not a secret,
because the value is a non-sensitive experiment name. The Kubernetes manifests
still keep the same default so direct `kubectl apply` deployments work without
GitHub.

Before enabling MLflow in an environment:

1. Confirm the MLflow UI is reachable at `https://mlflow-dev.openearth.dev`.
2. Confirm or create the experiment named `Clima`.
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
