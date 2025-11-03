# Climate Advisor Service Architecture

## Overview

Climate Advisor is a production FastAPI microservice that manages conversational AI for CityCatalyst. It provides:

- **Thread & Message Management**: Persistent conversation storage in PostgreSQL
- **Agentic AI with Tool Integration**: OpenAI Agents SDK with function calling
- **Vector-Based RAG**: Semantic search over climate knowledge base via pgvector
- **Token Management**: JWT refresh and caching for CityCatalyst API access
- **Streaming Responses**: Server-Sent Events (SSE) for real-time delivery

## Current Architecture (As-Implemented)

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  CityCatalyst Web App                        │
│                   (Next.js + React)                          │
│                                                               │
│  - UI Components for chat                                    │
│  - RTK Query client                                          │
│  - Calls /api/v0/chat/* endpoints                           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ HTTP/REST
                         │ (with JWT access token)
                         │
┌────────────────────────▼────────────────────────────────────┐
│          Climate Advisor FastAPI Service                     │
│          (Python AsyncIO + SQLAlchemy)                       │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         HTTP API Layer (v1)                          │  │
│  │                                                       │  │
│  │  POST /health              (health check)            │  │
│  │  POST /v1/threads          (create thread)           │  │
│  │  POST /v1/messages         (send message + stream)   │  │
│  └──────────────────────────────────────────────────────┘  │
│                         │                                    │
│  ┌──────────────────────▼──────────────────────────────┐  │
│  │      Request Processing Pipeline                     │  │
│  │                                                       │  │
│  │  1. Thread Resolution (ThreadResolver)              │  │
│  │  2. Token Management (TokenHandler)                 │  │
│  │  3. Message Persistence (MessageService)            │  │
│  │  4. Agent Execution (AgentService)                  │  │
│  │  5. Response Streaming (StreamingHandler)           │  │
│  └──────────────────────────────────────────────────────┘  │
│                         │                                    │
│  ┌──────────────────────▼──────────────────────────────┐  │
│  │      Agent Execution with Tools                      │  │
│  │                                                       │  │
│  │  OpenAI Agents SDK                                  │  │
│  │    ├─ Creates agent instance                        │  │
│  │    ├─ Loads conversation history                    │  │
│  │    ├─ Runs agent loop with user message             │  │
│  │    ├─ Invokes tools as needed                       │  │
│  │    └─ Streams token by token                        │  │
│  │                                                       │  │
│  │  Available Tools:                                   │  │
│  │    ├─ climate_vector_search (Vector RAG)            │  │
│  │    └─ cc_inventory_query (CityCatalyst API)         │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                               │
└───┬──────────────────────┬──────────────────┬────────────────┘
    │                      │                  │
    │ Database             │ LLM Routing      │ External API
    │ Connection           │ (OpenRouter)     │
    │                      │                  │
    ▼                      ▼                  ▼
┌──────────┐        ┌────────────┐      ┌─────────────┐
│PostgreSQL│        │ OpenRouter │      │CityCatalyst │
│Database  │        │   (Azure   │      │  (Inventory │
│          │        │   OpenAI)  │      │   & Token   │
│ Threads  │        │            │      │   Refresh)  │
│ Messages │        │ Models:    │      │             │
│Embeddings│        │ gpt-4o     │      │  JWT Token  │
│          │        │ gpt-4      │      │  Inventory  │
└──────────┘        │ etc.       │      │   Data      │
                    └────────────┘      └─────────────┘
```

### Request Flow Diagram

```
Client Request to CityCatalyst
    ↓
CityCatalyst API Route
    ├─ Validates request
    ├─ Extracts JWT token
    ├─ Calls Climate Advisor Service
    │
    └────────────────────────────────────┐
                                         │
    ┌────────────────────────────────────▼──┐
    │  POST /v1/messages                     │
    │  {                                     │
    │    "user_id": "...",                  │
    │    "content": "...",                  │
    │    "thread_id": "..." (optional),     │
    │    "context": {                       │
    │      "cc_access_token": "jwt"         │
    │    }                                   │
    │  }                                     │
    └────────────────────────────────────┬──┘
                                         │
    ┌────────────────────────────────────▼──────────┐
    │ [1] Thread Resolution                         │
    │ ├─ If thread_id provided: fetch thread        │
    │ └─ Else: create new thread                    │
    │                                               │
    │ [2] Token Management                          │
    │ ├─ Load token from payload context            │
    │ ├─ Or load from thread context                │
    │ ├─ Validate token expiration                  │
    │ └─ Refresh if needed via CityCatalyst         │
    │                                               │
    │ [3] Message Persistence                       │
    │ ├─ Store user message to database             │
    │ └─ Update thread last_updated timestamp       │
    │                                               │
    │ [4] Agent Execution                           │
    │ ├─ Create agent instance with config          │
    │ ├─ Load conversation history (N messages)     │
    │ ├─ Execute agent.run(user_message)            │
    │ └─ Iterate through response chunks            │
    │                                               │
    │     During Agent Loop:                        │
    │     ├─ If tool needed:                        │
    │     │  └─ Execute tool (vector search or CC API)
    │     ├─ Continue with tool results             │
    │     ├─ Generate next token                    │
    │     └─ Yield token to client (SSE)            │
    │                                               │
    │ [5] Response Streaming (SSE)                  │
    │ ├─ event: message (token)                    │
    │ ├─ event: tool_use (tool invocations)        │
    │ ├─ event: warning (if applicable)            │
    │ └─ event: done (end of stream)               │
    │                                               │
    │ [6] Message Persistence (After Streaming)     │
    │ ├─ Store assistant message to database        │
    │ ├─ Persist tool invocation details            │
    │ └─ Update thread context with token           │
    │                                               │
    └────────────────────────────────────┬──────────┘
                                         │
    Response Stream (SSE)                │
    event: message                       │
    data: {"content": "..."}             │
                                         │
    event: tool_use                      │
    data: {"name": "...", "args": "..."}│
                                         │
    event: message                       │
    data: {"content": "..."}             │
                                         │
    event: done                          │
    data: {}                             │
                                         ▼
    Client receives stream
    ├─ Displays tokens in real-time
    ├─ Updates tool invocation indicators
    └─ Finishes on "done" event
```

### Tool Integration Architecture

```
┌─────────────────────────────────────────────────────────┐
│          Agent Decision Loop (Agents SDK)               │
│                                                          │
│  analyze_message()                                      │
│    ├─ Parse user message                               │
│    └─ Check tool definitions                           │
│                                                          │
│  should_use_tool()                                      │
│    └─ Decision based on message + context              │
│        ├─ YES → invoke_tool()                          │
│        └─ NO  → generate_response()                    │
└─────────────────────┬───────────────────────────────────┘
                      │
         ┌────────────┴────────────┐
         │                         │
         ▼                         ▼
    ┌─────────────┐        ┌──────────────────┐
    │  Tool: 1    │        │  Tool: 2         │
    │ climate_    │        │ cc_inventory_    │
    │ vector_     │        │ query            │
    │ search      │        │                  │
    │             │        │                  │
    │ Input:      │        │ Input:           │
    │ - query     │        │ - inventory_id   │
    │ - top_k     │        │ - data_type      │
    │ - min_score │        │                  │
    │             │        │ Process:         │
    │ Process:    │        │ 1. Load CC token │
    │ 1. Embed    │        │ 2. Check expiry  │
    │    query    │        │ 3. Refresh if    │
    │ 2. Search   │        │    needed        │
    │    pgvector │        │ 4. Call CC API   │
    │ 3. Score    │        │ 5. Format data   │
    │    matches  │        │                  │
    │ 4. Format   │        │ Output:          │
    │    results  │        │ Inventory data   │
    │             │        │ or error msg     │
    │ Output:     │        │                  │
    │ Documents   │        │                  │
    │ w/ scores   │        │                  │
    └──────┬──────┘        └────────┬─────────┘
           │                        │
           └────────────┬───────────┘
                        │
           ┌────────────▼──────────────┐
           │  Agent Continues With     │
           │  Tool Results             │
           │                           │
           │  ├─ Incorporates output   │
           │  ├─ Updates context       │
           │  ├─ Generates response    │
           │  ├─ Yields tokens via SSE │
           │  └─ Repeat if needed      │
           └────────────────────────────┘
```

## Data Flow

### 1. Thread Creation Flow

```
POST /v1/threads
  {
    "user_id": "user-123",
    "inventory_id": "inv-456",
    "context": {
      "cc_access_token": "jwt...",
      "custom_data": "..."
    }
  }
  ↓
ThreadService.create_thread()
  ├─ Generate UUID for thread_id
  ├─ Create Thread ORM object
  └─ Persist to database
  ↓
Response (201 Created)
  {
    "thread_id": "550e8400-e29b-41d4-a716-446655440000",
    "inventory_id": "inv-456",
    "context": { ... }
  }
```

### 2. Message & Streaming Flow

```
POST /v1/messages
  {
    "user_id": "user-123",
    "content": "What are climate risks?",
    "thread_id": "550e8400-...",
    "context": {
      "cc_access_token": "jwt..."
    }
  }
  ↓
[1] ThreadResolver.resolve_thread()
  ├─ If thread_id provided: load from DB
  └─ Else: create new thread
  ↓
[2] TokenHandler.load_token()
  ├─ Check payload context
  ├─ Check thread context
  └─ Return access token (or None)
  ↓
[3] MessageService.create_user_message()
  └─ Store user message to DB
  ↓
[4] StreamingHandler.stream_response()
  ├─ Initialize agent with token
  ├─ Load conversation history
  ├─ Execute agent.run(message)
  │
  │  [Agent Loop]:
  │    ├─ Token 1 → SSE: event=message, data={"content":"..."}
  │    ├─ Tool call → SSE: event=tool_use, data={...}
  │    ├─ Tool result → [internal]
  │    ├─ Token 2 → SSE: event=message, data={"content":"..."}
  │    └─ ... repeat until done
  │
  └─ SSE: event=done
  ↓
[5] StreamingHandler.persist_message()
  ├─ Compile full assistant response
  ├─ Extract tool invocation records
  ├─ Store assistant message to DB
  └─ Update thread context with token
  ↓
Response (200 OK, text/event-stream)
  Streamed SSE events
```

## Database Schema

### Thread Model

```python
class Thread(Base):
    __tablename__ = "threads"
    
    thread_id: UUID = PK
    user_id: str = FK (User)
    inventory_id: Optional[str]
    context: Optional[Dict] = JSONB
    title: Optional[str]
    created_at: datetime
    last_updated: datetime
    
    messages: List[Message] = relationship(cascade=delete)
```

**context field example:**
```json
{
  "access_token": "eyJ...",
  "expires_at": "2025-01-29T15:30:00Z",
  "issued_at": "2025-01-29T13:30:00Z",
  "cc_access_token": "...",
  "inventory_name": "San Francisco",
  "custom_metadata": "..."
}
```

### Message Model

```python
class Message(Base):
    __tablename__ = "messages"
    
    message_id: UUID = PK
    thread_id: UUID = FK (Thread)
    text: str
    role: Enum = {'user', 'assistant'}
    tools_used: Optional[Dict] = JSONB
    created_at: datetime
    
    thread: Thread = relationship(back_populates=messages)
```

**tools_used field example:**
```json
[
  {
    "name": "climate_vector_search",
    "status": "success",
    "arguments": {
      "query": "emissions reduction strategies"
    },
    "results": [
      {
        "filename": "GPC_Full_MASTER_RW_v7.pdf",
        "chunk_index": 42,
        "score": 0.87,
        "content": "Document excerpt..."
      }
    ]
  }
]
```

### DocumentEmbedding Model (Vector DB)

```python
class DocumentEmbedding(Base):
    __tablename__ = "document_embeddings"
    
    embedding_id: UUID = PK
    filename: str
    chunk_index: int
    chunk_size: int
    content: str
    embedding_vector: Vector(3072) = pgvector
    model_name: str = "text-embedding-3-large"
    file_path: Optional[str]
    created_at: datetime
```

**Vector Index:**
```sql
CREATE INDEX ix_document_embeddings_vector
ON document_embeddings
USING ivfflat (embedding_vector vector_cosine_ops)
WITH (lists = 100);
```

## Service Layers

### 1. Route Layer (FastAPI)

**`routes/health.py`**
- `GET /health` - Liveness probe

**`routes/threads.py`**
- `POST /v1/threads` - Create thread with optional context

**`routes/messages.py`**
- `POST /v1/messages` - Send message, stream response (SSE)

### 2. Service Layer

**ThreadService** (`services/thread_service.py`)
- `create_thread()` - Create new thread
- `get_thread()` - Retrieve thread by ID
- `get_thread_for_user()` - Verify user ownership
- `update_context()` - Update thread JSONB context
- `touch_thread()` - Update last_updated timestamp

**MessageService** (`services/message_service.py`)
- `create_user_message()` - Persist user message
- `create_assistant_message()` - Persist assistant response
- `get_thread_messages()` - Load conversation history

**AgentService** (`services/agent_service.py`)
- `create_agent()` - Initialize Agents SDK with tools
- `_create_openrouter_client()` - Configure OpenRouter endpoint
- `_setup_tools()` - Build tool definitions for agent

**EmbeddingService** (`services/embedding_service.py`)
- `generate_embeddings()` - Call OpenAI embedding API
- `generate_embeddings_batch()` - Batch embedding generation

**CityCatalystClient** (`services/citycatalyst_client.py`)
- `refresh_token()` - Call CityCatalyst token refresh endpoint
- `query_inventory()` - Call CityCatalyst inventory APIs
- Error handling and retry logic

### 3. Tool Layer

**ClimateVectorSearchTool** (`tools/climate_vector_tool.py`)
```python
async def climate_vector_search(query: str, top_k: int = 5) -> List[VectorSearchMatch]:
    """
    Semantic search over climate knowledge base.
    
    1. Generate embedding for query using OpenAI
    2. Search pgvector for similar chunks
    3. Return top-k results with similarity scores
    4. Tool invocation recorded in message.tools_used
    """
```

**CCInventoryTool** (`tools/cc_inventory_tool.py`)
```python
async def cc_inventory_query(inventory_id: str, data_type: str) -> Dict:
    """
    Query CityCatalyst inventory APIs.
    
    1. Load JWT token from thread context
    2. Check token expiration
    3. Refresh token if needed via CityCatalyst
    4. Call CityCatalyst inventory endpoint
    5. Return formatted inventory data
    6. Tool invocation recorded in message.tools_used
    """
```

### 4. Utility Layer

**StreamingHandler** (`utils/streaming_handler.py`)
- Orchestrates agent execution
- Handles SSE stream formatting
- Manages tool invocation tracking
- Persists messages after streaming

**ThreadResolver** (`utils/thread_resolver.py`)
- Resolves thread_id (existing or create new)
- Handles thread creation with context

**TokenHandler** (`utils/token_handler.py`)
- Loads token from multiple sources
- Manages token refresh logic
- Handles CityCatalyst token endpoint calls

## Configuration & Settings

### LLM Configuration (`llm_config.yaml`)

```yaml
models:
  default: "openai/gpt-4.1"
  available:
    "openai/gpt-4.1":
      name: "GPT-4.1"
      default_temperature: 0.2

generation:
  defaults:
    temperature: 0.1

prompts:
  default: "prompts/default.md"
  inventory_context: "prompts/inventory_context.md"
  data_analysis: "prompts/data_analysis.md"

tools:
  climate_vector_search:
    enabled: true
    top_k: 5
    min_score: 0.6

conversation:
  history_limit: 5

observability:
  langsmith:
    project: "climate_advisor"
    endpoint: "https://api.smith.langchain.com"
    tracing_enabled: true
```

### Environment Variables (`settings.py`)

```python
class Settings(BaseSettings):
    # Service
    app_name: str = "climate-advisor"
    port: int = 8080
    log_level: str = "info"
    cors_origins: List[str] = ["*"]
    
    # Database
    database_url: PostgresURL
    database_pool_size: int = 20
    
    # LLM
    openrouter_api_key: str
    openai_api_key: Optional[str] = None
    
    # CityCatalyst
    cc_base_url: Optional[str] = None
    
    # LangSmith
    langsmith_api_key: Optional[str] = None
    langsmith_tracing_enabled: bool = False
```

## Integration Points

### 1. CityCatalyst App ↔ Climate Advisor

**Request Flow:**
```
CityCatalyst Next.js App
  └─ POST /api/v0/chat/messages
      {
        "user_id": "...",
        "content": "...",
        "thread_id": "..." (optional),
        "context": {
          "cc_access_token": "jwt"
        }
      }
      ↓
      Proxy to Climate Advisor Service
      └─ POST /v1/messages
          ↓
          Response: SSE stream
          ├─ event: message
          ├─ event: tool_use
          └─ event: done
```

### 2. Climate Advisor ↔ OpenRouter (LLM)

```
AgentService
  └─ AsyncOpenAI(base_url="https://openrouter.ai/api/v1")
      └─ headers: {"Authorization": "Bearer $OPENROUTER_API_KEY"}
          ├─ Model: openai/gpt-4.1 (default)
          ├─ Temperature: 0.1
          ├─ Tools: [climate_vector_search, cc_inventory_query]
          └─ Stream: true (token-by-token)
```

### 3. Climate Advisor ↔ OpenAI (Embeddings)

```
EmbeddingService
  └─ AsyncOpenAI(api_key=$OPENAI_API_KEY)
      └─ Model: text-embedding-3-large
          ├─ Used for query embeddings (climate_vector_search)
          ├─ Dimension: 3072
          └─ Rate limit: 3000 RPM
```

### 4. Climate Advisor ↔ CityCatalyst (Token & Inventory)

```
TokenHandler / CCInventoryTool
  └─ POST $CC_BASE_URL/api/v0/assistants/token-refresh
      ├─ Input: refresh_token or access_token
      ├─ Response: new access_token with expiry
      └─ Cached in thread.context["access_token"]
      
  └─ GET $CC_BASE_URL/api/v0/inventory/{data_type}
      ├─ Headers: Authorization: Bearer {access_token}
      ├─ Query: inventory_id
      └─ Response: Formatted inventory data
```

### 5. Climate Advisor ↔ PostgreSQL

```
AsyncSession (SQLAlchemy)
  ├─ Threads table (CRUD)
  ├─ Messages table (Write + Read history)
  └─ DocumentEmbeddings table (Vector search)
```

### 6. Climate Advisor ↔ pgvector (Vector Search)

```
vector_search query:
SELECT
  embedding_id,
  filename,
  content,
  embedding_vector <=> query_embedding as distance
FROM document_embeddings
ORDER BY embedding_vector <=> query_embedding
LIMIT 5
```

## Error Handling & Recovery

### Token Expiration Handling

```
TokenHandler.load_token_from_thread()
  ├─ Load token from context
  ├─ Parse expiration time
  ├─ If expired:
  │  └─ Call CityCatalystClient.refresh_token()
  │      ├─ If successful: Update context, return new token
  │      └─ If failed: Log warning, continue with None
  └─ Return token or None
```

### Database Unavailability

```
MessageService operations wrapped in try/except
  ├─ If connection fails: Log warning
  ├─ Set history_warning flag
  ├─ SSE warning event: "Chat history temporarily unavailable"
  ├─ Continue with agent execution (no persistence)
  └─ User sees warning but conversation continues
```

### Tool Invocation Errors

```
StreamingHandler.stream_response()
  ├─ climate_vector_search error:
  │  ├─ Log exception
  │  ├─ Return empty results
  │  └─ Agent continues with explanatory response
  │
  └─ cc_inventory_query error:
     ├─ Log exception
     ├─ Return error status
     └─ Agent responds with error context
```

## Performance Considerations

### Conversation History Loading

- **Limit**: Last 5 messages (configurable in `llm_config.yaml`)
- **Query**: Indexed by `thread_id` for O(log n) lookup
- **Benefit**: Balances context richness vs. token usage

### Vector Search Optimization

- **Index**: IVFFlat on `embedding_vector` column
- **Search Time**: ~10-50ms for 10k+ documents
- **Distance Metric**: Cosine similarity
- **Tuning**: `WITH (lists = 100)` for balance

### Database Connection Pooling

```python
engine = create_async_engine(
    database_url,
    poolclass=NullPool,  # Async-safe
    pool_size=20,
    max_overflow=10,
    pool_timeout=30
)
```

### Streaming Optimization

- **Token-by-token** streaming via SSE
- **Buffer size**: Small (< 1KB per event)
- **Latency**: <100ms per token
- **Backpressure**: Handled by client browser

## Deployment

### Docker Deployment

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY service/requirements.txt .
RUN pip install -r requirements.txt

COPY service/app ./app
COPY prompts ./prompts
COPY llm_config.yaml .

ENV CA_DATABASE_URL=postgresql://...
ENV OPENROUTER_API_KEY=...

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: climate-advisor
spec:
  replicas: 3
  selector:
    matchLabels:
      app: climate-advisor
  template:
    metadata:
      labels:
        app: climate-advisor
    spec:
      containers:
      - name: climate-advisor
        image: climate-advisor:latest
        ports:
        - containerPort: 8080
        env:
        - name: CA_DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: climate-advisor-secrets
              key: database-url
        - name: OPENROUTER_API_KEY
          valueFrom:
            secretKeyRef:
              name: climate-advisor-secrets
              key: openrouter-key
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 10
```

## Observability

### LangSmith Integration

When `tracing_enabled: true`:

1. **Conversation Runs**: Full trace of each message
2. **Tool Calls**: Track vector search and CC API calls
3. **Performance**: Token usage, latency, cost
4. **Errors**: Exception logging and debugging

### Request Logging

Each request includes:
- `request_id`: Unique identifier (X-Request-Id header)
- `user_id`: User making request
- `thread_id`: Conversation context
- `timestamp`: Request/response timing
- `status_code`: Success/error indication

### Metrics

- **Vector search latency**: p50, p95, p99
- **LLM streaming latency**: Time to first token, total
- **Tool execution time**: Per tool, per invocation
- **Database operations**: Query time, connection pool usage
- **Token refresh success rate**: % successful vs failed

## Future Enhancements

### Phase 2 (Q2 2025)

- [ ] File upload endpoint for document ingestion
- [ ] GET /v1/threads/{id} - Retrieve conversation history
- [ ] DELETE /v1/threads/{id} - Archive/delete threads
- [ ] Batch processing for embeddings

### Phase 3 (Q3 2025)

- [ ] Admin API for model/prompt configuration
- [ ] Advanced vector search: filtering, hybrid search
- [ ] User preferences: temperature, model choice, history retention
- [ ] Rate limiting and quota management

### Phase 4 (Q4 2025)

- [ ] Multi-tenant support
- [ ] Vector database sharding
- [ ] LLM provider abstraction (Anthropic, Llama, etc.)
- [ ] Conversation analytics dashboard

## References

- **Main Entry**: `service/app/main.py`
- **Routes**: `service/app/routes/`
- **Services**: `service/app/services/`
- **Tools**: `service/app/tools/`
- **Models**: `service/app/models/db/`
- **Configuration**: `llm_config.yaml` + `service/app/config/settings.py`
- **Vector DB**: `vector_db/`
- **Database Migrations**: `service/migrations/versions/`
- **Tests**: `service/tests/`
