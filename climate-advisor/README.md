# Climate Advisor Service

Climate Advisor (CA) is a standalone FastAPI microservice that powers the conversational experience for CityCatalyst (CC). The service lives under `climate-advisor/service` and exposes versioned APIs under `/v1/*`.

- **Agentic AI**: Uses OpenAI's Agents SDK with OpenRouter for flexible LLM routing
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
              PostgreSQL    OpenRouter API  CityCatalyst
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
- Returns thread_id for client use

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
    "model": "openai/gpt-4o"  # Optional model override
  }
}
```

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

1. **Thread Resolution**: If no thread_id provided, creates new thread with context
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
- pip / venv

### 1. Clone and Setup

```bash
cd climate-advisor
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

### 2. Configure Environment

Create `.env` in `climate-advisor/` directory:

```bash
# Required
OPENROUTER_API_KEY=your-openrouter-api-key
CA_DATABASE_URL=postgresql://climateadvisor:climateadvisor@localhost:5432/climateadvisor

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

```bash
# Linux/macOS
docker run --name ca-postgres -e POSTGRES_PASSWORD=admin -e POSTGRES_DB=postgres \
  -p 5432:5432 -d postgres:15

# Setup database and user
docker exec -i ca-postgres psql -U postgres -d postgres << EOF
CREATE USER climateadvisor WITH PASSWORD 'climateadvisor';
CREATE DATABASE climateadvisor OWNER climateadvisor;
GRANT ALL PRIVILEGES ON DATABASE climateadvisor TO climateadvisor;
ALTER USER climateadvisor CREATEDB;
EOF

# Install pgvector extension
docker exec ca-postgres apt update
docker exec ca-postgres apt install -y postgresql-15-pgvector
docker exec ca-postgres psql -U postgres -d climateadvisor -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### 4. Install Dependencies & Setup Database

```bash
cd climate-advisor/service
pip install -r requirements.txt

# Run database migrations
cd ..
python scripts/setup_database.py
```

### 5. Run the Service

```bash
cd climate-advisor/service
uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload
```

### 6. Verify Setup

- **API Docs**: http://localhost:8080/docs
- **ReDoc**: http://localhost:8080/redoc
- **Playground**: http://localhost:8080/playground
- **Health Check**: http://localhost:8080/health

## Configuration

### LLM Configuration

All LLM-related settings are centralized in (`llm_config.yaml`)

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
cd climate-advisor/vector_db

# Add PDF files to `files/` directory
cp /path/to/documents/*.pdf files/

# Process PDFs and upload embeddings
python upload_to_db.py --directory files
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
  "status": "healthy",
  "service": "climate-advisor",
  "version": "0.1.0"
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
  "options": { "model": "openai/gpt-4o" }
}
```

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
cd climate-advisor/service
pytest tests/ -v
```

### Run Specific Test

```bash
pytest tests/test_e2e_conversation.py -v
```

### Quick Streaming Test

```bash
python climate-advisor/scripts/test_service_stream.py http://localhost:8080
```

## Docker Deployment

### Build Image

```bash
cd climate-advisor
docker build -f service/Dockerfile -t climate-advisor:latest .
```

### Run Container

```bash
docker run --rm \
  --env-file .env \
  -p 8080:8080 \
  climate-advisor:latest
```

### Docker Compose (with PostgreSQL)

```yaml
version: "3.8"

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_PASSWORD: admin
      POSTGRES_DB: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  climate-advisor:
    build:
      context: .
      dockerfile: service/Dockerfile
    ports:
      - "8080:8080"
    environment:
      CA_DATABASE_URL: postgresql://climateadvisor:climateadvisor@postgres:5432/climateadvisor
      OPENROUTER_API_KEY: ${OPENROUTER_API_KEY}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
    depends_on:
      - postgres

volumes:
  postgres_data:
```

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

### Database Connection Issues

```bash
# Test connection
python -c "from app.db.session import get_session_factory; print('OK')"

# Check migrations
cd service
alembic current
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
uvicorn app.main:app --reload
```

Check token handler logs for CC_BASE_URL and token endpoint issues.

## Contributing

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Make changes and add tests
3. Run `pytest` to ensure tests pass
4. Submit a pull request

## License

See LICENSE.md for details.
