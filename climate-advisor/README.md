# Climate Advisor Service

Climate Advisor (CA) is a standalone FastAPI microservice that powers the conversational experience for CityCatalyst (CC). The service lives under `climate-advisor/service` and exposes versioned APIs under `/v1/*`.

- **Agentic AI**: Uses OpenAI's Agents SDK with an OpenAI-compatible chat client; OpenRouter is the default router and direct OpenAI chat endpoints are also supported
- **Persistent Threads & Messages**: PostgreSQL-backed conversation history
- **Vector Search**: Semantic search over climate knowledge base using pgvector
- **Tool Integration**:
  - Climate knowledge base search (vector RAG)
  - CityCatalyst inventory API queries
- **Token Management**: JWT token refresh and caching for CityCatalyst API access
- **Streaming Responses**: Server-Sent Events (SSE) for real-time message delivery
- **Observable**: Optional LangSmith integration for tracing and monitoring

## Current Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   CityCatalyst App                       │
│                   (Next.js + React)                      │
│                                                           │
│  POST /api/v0/chat/threads         (create thread)       │
│  POST /api/v0/chat/messages        (send message)        │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP/JSON
                         │ (with JWT token)
┌────────────────────────▼────────────────────────────────┐
│         Climate Advisor Service (FastAPI)               │
│                                                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │  API Endpoints (v1)                             │   │
│  │  POST /v1/threads          (create thread)      │   │
│  │  POST /v1/messages         (stream response)    │   │
│  └─────────────────────────────────────────────────┘   │
│                         │                               │
│  ┌──────────────┬───────▼────────┬──────────────────┐  │
│  │              │                │                  │   │
│  ▼              ▼                ▼                  ▼   │
│ Thread      Message          Agent Service      Tools  │
│ Service     Service          (Agents SDK)              │
│              │                  │          ┌──────┬───┐│
│              │                  │          │      │   ││
│              │                  ▼          ▼      ▼   ││
│              │            ┌──────────────────────┐   ││
│              │            │ Tool Execution:      │   ││
│              │            │ - Climate Vector     │   ││
│              │            │ - CC Inventory API   │   ││
│              │            └──────────────────────┘   ││
│              │                  │                    ││
│              └──────────────────┼────────────────────┘│
│                                 │                      │
└─────────────────────────────────┼──────────────────────┘
                                  │
                    ┌─────────────┼──────────────┐
                    │             │              │
                    ▼             ▼              ▼
              PostgreSQL    Chat Provider   CityCatalyst
              (History)     (LLM Routing)   (Inventory)
```

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

- ThreadService creates a UUID-based thread
- Stores thread with user_id, inventory_id, and context (JSONB)
- Returns thread_id for client use on later `/v1/messages` calls

### 2. Send Message & Stream Response

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
    "model": "openai/gpt-5.4-mini"  # Optional model override; normalized automatically for direct OpenAI routing
  }
}
```

If `thread_id` is omitted, Climate Advisor creates a new thread. If `thread_id` is supplied, it must already exist and belong to the requesting user.

**Server Response (SSE Stream):**

```
event: message
data: {"content": "The top climate risks..."}

event: tool_use
data: {"name": "climate_vector_search", "arguments": {"query": "climate risks San Francisco"}}

event: message
data: {"content": "Based on the analysis..."}

event: done
data: {}
```

**Processing Pipeline:**

1. **Thread Resolution**: If no thread_id is provided, creates a new thread with context. If thread_id is provided, validates that the thread already exists and belongs to the user.
2. **Token Management**: Loads CC access token from payload context or thread context
3. **Message Persistence**: Stores user message to database
4. **Agent Execution**:
   - AgentService creates agent with configured model
   - Loads conversation history (last N messages)
   - Runs agent with user message
   - Agent may invoke tools (climate search, inventory API)
   - Streams response tokens as SSE events
5. **Response Persistence**: After streaming completes, stores assistant message with tool usage

### 3. Tool Invocation

**Tools Available:**

1. **climate_vector_search** - Semantic search over climate knowledge base

   - Query: Natural language question
   - Returns: Top-K relevant document chunks with scores
   - Configuration: top_k=5, min_score=0.6 (in llm_config.yaml)

2. **cc_inventory_query** - Query CityCatalyst inventory APIs
   - Automatically refreshes JWT token using CityCatalyst token endpoint
   - Supports inventory data fetching based on payload structure
   - Returns formatted inventory data or error responses

**Tool Execution Flow:**

```
User Message
    ↓
Agent (Agents SDK)
    ├─ Analyzes message
    ├─ Decides if tool needed?
    │   └─ YES: Tool name + arguments
    │   └─ NO: Direct response
    ↓
Tool Invocation (if applicable)
    ├─ climate_vector_search
    │   ├─ Generate query embedding
    │   ├─ Vector search in pgvector
    │   └─ Return matched documents
    │
    └─ cc_inventory_query
        ├─ Load CC token
        ├─ HTTP call to CityCatalyst API
        └─ Return formatted data
    ↓
Agent Continue (with tool result)
    ├─ Incorporate tool output in response
    ├─ Generate final answer
    └─ Stream to client (SSE)
```

## Local Development

### Prerequisites

- Python 3.11+
- PostgreSQL 15+ (via Docker recommended)
- uv

### 1. Clone and Setup

```bash
cd climate-advisor
uv sync --locked --group dev
```

### 2. Configure Environment

Create `.env` in `climate-advisor/` directory:

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
OPENAI_API_KEY=your-openai-api-key  # For embeddings
LANGSMITH_API_KEY=your-langsmith-key  # If tracing enabled

# Optional - CityCatalyst Integration
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

If you use this compose-based PostgreSQL setup and run the CA service on your host
(not in Docker), use:

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

### 4. Install Dependencies & Setup Database

```bash
cd climate-advisor
uv sync --locked --group dev
uv run python scripts/setup_database.py
```

### 5. Run the Service

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

All non-secret LLM settings are centralized in (`llm_config.yaml`), including the
orchestrator and agentic-flow model settings, provider base URLs, retry/timeouts,
and Stationary Energy prompt budgets. The environment is only for secrets such as
`OPENROUTER_API_KEY`, `OPENAI_API_KEY`, and `LANGSMITH_API_KEY`.

Prompt paths are also configured in `llm_config.yaml`. The `prompts.default`
entry drives the general Climate Advisor chat prompt, and
`prompts.stationary_energy_review` drives active Stationary Energy draft review
chat flows. Prompt files may include reusable fragments with
`{{ include: tools/example.md }}` directives; includes are resolved relative to
the including prompt first and then against the configured prompt search roots.

### Environment Variables

- `OPENROUTER_API_KEY` - OpenRouter API key for LLM access
- `CA_DATABASE_URL` - PostgreSQL connection string
- `CA_PORT` - Server port (default: 8080) - note - there is issue when running any app inside of the docker container the localhost is within the container network be aware of that and adjust this same as CA_DATBASE_URL
- `CA_LOG_LEVEL` - Logging level: info|debug (default: info)
- `CA_CORS_ORIGINS` - CORS allowed origins (default: \*)
- `OPENAI_API_KEY` - OpenAI API key (for embeddings & traces)
- `LANGSMITH_API_KEY` - LangSmith API key (if tracing enabled)
- `CC_BASE_URL` - CityCatalyst base URL (for inventory API & token refresh)

## Database Schema

### Thread Table

Stores conversation threads linked to users:

```sql
CREATE TABLE threads (
  thread_id UUID PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL INDEX,
  inventory_id VARCHAR(255),
  context JSONB,  -- Stores context, tokens, metadata
  title VARCHAR(255),
  created_at TIMESTAMP WITH TIMEZONE DEFAULT NOW(),
  last_updated TIMESTAMP WITH TIMEZONE DEFAULT NOW()
);
```

**context** field structure:

```json
{
  "access_token": "eyJ...",
  "expires_at": "2025-01-01T12:00:00Z",
  "issued_at": "2025-01-01T10:00:00Z",
  "cc_access_token": "...",
  "custom_data": "..."
}
```

### Message Table

Stores all messages in conversations:

```sql
CREATE TABLE messages (
  message_id UUID PRIMARY KEY,
  thread_id UUID FOREIGN KEY,
  text TEXT NOT NULL,
  role ENUM('user', 'assistant'),
  tools_used JSONB,  -- Tracks tool invocations
  created_at TIMESTAMP WITH TIMEZONE DEFAULT NOW()
);
```

**tools_used** field structure:

```json
[
  {
    "name": "climate_vector_search",
    "status": "success",
    "arguments": { "query": "climate risks" },
    "results": [
      {
        "filename": "GPC_Full_MASTER_RW_v7.pdf",
        "chunk_index": 42,
        "score": 0.85,
        "content": "..."
      }
    ]
  }
]
```

### DocumentEmbedding Table

Vector storage for RAG:

```sql
CREATE TABLE document_embeddings (
  embedding_id UUID PRIMARY KEY,
  filename VARCHAR(255),
  chunk_index INT,
  chunk_size INT,
  content TEXT,
  embedding_vector VECTOR(3072),  -- OpenAI text-embedding-3-large
  model_name VARCHAR(100),
  file_path VARCHAR(500),
  created_at TIMESTAMP WITH TIMEZONE DEFAULT NOW()
);

-- Index for fast similarity search
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

### Send Message & Stream Response

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

When calling `/v1/messages` directly, create the thread first via `/v1/threads` or omit `thread_id` and let the service start a new conversation.

**Response (200, text/event-stream):**

```
event: message
data: {"content": "Climate risks include..."}

event: tool_use
data: {"name": "climate_vector_search", "arguments": {...}}

event: done
data: {}
```

## CityCatalyst Integration

### Token Management

1. **Token from Request**: Client includes JWT in payload context
2. **Token from Thread**: Service loads token from existing thread context
3. **Token Refresh**: If token expires, service calls CityCatalyst token endpoint
4. **Token Persistence**: Valid tokens stored in thread context JSONB

### Inventory API Access

The `cc_inventory_query` tool:

- Constructs requests to CityCatalyst inventory endpoints
- Automatically includes JWT in Authorization header
- Handles token refresh if needed
- Returns formatted inventory data to agent

**Example Flow:**

```
User: "What emissions are reported in my inventory?"
  ↓
Agent calls: cc_inventory_query(inventory_id="inv-456")
  ↓
Tool loads token from thread context
  ↓
HTTP GET https://localhost:3000/api/v0/inventory/emissions?inventory_id=inv-456
    Authorization: Bearer <JWT>
  ↓
Response: { "emissions": {...} }
  ↓
Agent incorporates data into response
```

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

This section is for local development/testing. It builds the Climate Advisor image from your local working tree so your unpushed code changes are included.

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

### Docker Compose (with PostgreSQL)

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

- The compose setup uses `pgvector/pgvector:pg15` for PostgreSQL with vector support.
- The app image/tag used for compose is local (`climate-advisor:dev`) and built from your local source.
- The compose service is configured with `pull_policy: never` to avoid pulling remote images during local testing.
- `.env.example` defaults `CA_DATABASE_URL` to `localhost:5433` to avoid conflict with CityCatalyst's local PostgreSQL on `5432`.
- PostgreSQL is published on `localhost:5433` in compose to avoid conflicts with CityCatalyst's local PostgreSQL on `5432`.
- Inside the compose network, Climate Advisor still connects to PostgreSQL on `postgres:5432`.
- Because of this network difference, compose sets `CA_DATABASE_URL` explicitly in `docker-compose.yml`.
- For local Docker testing against a host-running CityCatalyst app, compose overrides `CC_BASE_URL` to `http://host.docker.internal:3000`.
- The compose service runs Alembic migrations automatically on startup before launching Uvicorn.

## Observability

### LangSmith Integration

Enable tracing to monitor agent executions, tool usage, and performance:

1. **Get API Key**: https://smith.langchain.com/
2. **Set Environment Variable**:
   ```bash
   export LANGSMITH_API_KEY=your_api_key
   ```
3. **Enable in Config** (`llm_config.yaml`):
   ```yaml
   observability:
     langsmith:
       project: "climate_advisor"
       endpoint: "https://api.smith.langchain.com"
       tracing_enabled: true
   ```

### Request Logging

Each request includes a unique request ID (X-Request-Id header) for tracing:

```
2025-01-29 10:15:32 - app.routes.messages - INFO - POST /messages - user_id=user-123, thread_id=550e8400..., content_length=42
```

## Troubleshooting

### `uv sync` TLS / Certificate Errors on Windows

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

Check token handler logs for CC_BASE_URL and token endpoint issues.

### LangSmith SSL Warnings During Local Tests

If the test suite passes but LangSmith emits post-run SSL warnings because the
local machine cannot validate `api.smith.langchain.com`, disable tracing for the
current shell while running tests:

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

See LICENSE.md for details.
