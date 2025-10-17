# Climate Advisor

Climate Advisor (CA) is a standalone FastAPI microservice that powers the conversational experience for CityCatalyst (CC). The service lives under `climate-advisor/service` and exposes versioned APIs under `/v1/*`.

## Local Development

Prerequisites: Python 3.11+, pip, and Docker (for local Postgres).

1. Create and activate a Python virtual environment:

   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Create a `.env` file in the `climate-advisor` directory with your configuration:

   ```bash
   # Required
   OPENROUTER_API_KEY=your-openrouter-api-key-here
   CA_DATABASE_URL=postgresql://climateadvisor:climateadvisor@localhost:5432/climateadvisor

   # Optional - Only API keys go in .env
   CA_CORS_ORIGINS=*
   LANGSMITH_API_KEY=your-langsmith-api-key-here  # Only needed if tracing enabled in llm_config.yaml
   ```

   **Important**:

   - Replace placeholders with your actual API keys
   - LangSmith configuration (endpoint, project, tracing_enabled) goes in `llm_config.yaml`, NOT `.env`
   - See [Environment Variables](#environment-variables) section for full details

3. Start a local Postgres instance (see [Postgres Quickstart](#postgres-quickstart)). Leave it running while you develop.

4. Install dependencies:

   ```bash
   cd climate-advisor/service
   pip install -r requirements.txt
   ```

5. Set up the database schema using Alembic migrations:

   ```bash
   cd climate-advisor
   python scripts/setup_database.py
   ```

   **Options:**

   - Default: Run migrations to create/update schema
   - `--check`: Test database connectivity only
   - `--drop`: Reset database completely (destructive!)

6. Run the service:

   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8080
   ```

7. Explore the API docs:
   - Swagger UI: http://localhost:8080/docs
   - OpenAPI JSON: http://localhost:8080/openapi.json
   - Playground: http://localhost:8080/playground (simple HTML tester)

## Local Database Setup

### Step 1: Start PostgreSQL Container

Launch a PostgreSQL container for local development:

```bash
docker run --name ca-postgres -e POSTGRES_PASSWORD=admin -e POSTGRES_DB=postgres \
  -p 5432:5432 -d postgres:15
```

### Step 2: Create Database and User

Connect to PostgreSQL and set up the climate advisor database:

```bash
# Connect to PostgreSQL interactively
docker exec -it ca-postgres psql -U postgres -d postgres

# Create the climateadvisor user
CREATE USER climateadvisor WITH PASSWORD 'climateadvisor';

# Create the climateadvisor database
CREATE DATABASE climateadvisor OWNER climateadvisor;

# Grant necessary permissions
GRANT ALL PRIVILEGES ON DATABASE climateadvisor TO climateadvisor;
ALTER USER climateadvisor CREATEDB;

# Exit PostgreSQL
\q
```

### Alternative: Direct Commands (Non-Interactive)

```bash
# Create user
docker exec -i ca-postgres psql -U postgres -d postgres -c "CREATE USER climateadvisor WITH PASSWORD 'climateadvisor';"

# Create database
docker exec -i ca-postgres psql -U postgres -d postgres -c "CREATE DATABASE climateadvisor OWNER climateadvisor;"

# Grant permissions
docker exec -i ca-postgres psql -U postgres -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE climateadvisor TO climateadvisor; ALTER USER climateadvisor CREATEDB;"
```

### Step 3: Verify Setup

```bash
# List databases
docker exec -i ca-postgres psql -U postgres -d postgres -c "\l"

# List users
docker exec -i ca-postgres psql -U postgres -d postgres -c "\du"
```

### Step 4: Update Environment Configuration

Update your `.env` file in the climate-advisor directory:

```bash
CA_DATABASE_URL=postgresql://climateadvisor:climateadvisor@localhost:5432/climateadvisor
```

### Container Management

- Stop the container: `docker stop ca-postgres`
- Remove the container: `docker rm ca-postgres`
- View logs: `docker logs ca-postgres`

## Health Endpoint

- `GET /health` - liveness probe

## Endpoints (v1)

- `POST /v1/threads` - creates a thread, persists it to Postgres, and returns `{ "thread_id": "..." }`
- `POST /v1/messages` - persists the user message, streams the assistant response from OpenRouter, then stores the assistant reply in Postgres

## Docker (service)

### Prerequisites

1. Ensure your PostgreSQL database is running and accessible
2. Create a `.env` file with your configuration (see [Environment Variables](#environment-variables) section)
3. Make sure the `CA_DATABASE_URL` in `.env` points to your database

### Build and Run

```bash
cd climate-advisor
docker build -f service/Dockerfile -t climate-advisor:dev .
docker run --rm --env-file .env -p 8080:8080 climate-advisor:dev
```

### Database Connection Notes

- **Linux/macOS**: Use `host.docker.internal` to connect to host PostgreSQL
- **Windows**: Use the IP address of your host machine (e.g., `192.168.65.2`)
- **Network Mode**: Alternatively, use `--network host` on Linux to share the host network

### Troubleshooting

- If database connection fails, verify `CA_DATABASE_URL` in your `.env` file
- Ensure PostgreSQL is running on the specified host/port
- Check that the database user and database exist

## Configuration

### Environment Variables

Create a `.env` file in the `climate-advisor` directory with the following variables:

**Required:**

- `OPENROUTER_API_KEY` - your OpenRouter API key (required for LLM access)
- `CA_DATABASE_URL` - SQLAlchemy async URL, e.g. `postgresql://climateadvisor:climateadvisor@localhost:5432/climateadvisor`

**Optional:**

- `CA_PORT` - default 8080
- `CA_LOG_LEVEL` - info|debug
- `CA_CORS_ORIGINS` - CSV list of allowed origins (default `*` for dev)
- `CA_DATABASE_POOL_SIZE`, `CA_DATABASE_MAX_OVERFLOW`, `CA_DATABASE_POOL_TIMEOUT`, `CA_DATABASE_ECHO` - optional pool tuning
- `OPENAI_API_KEY` - OpenAI API key (optional, for embeddings)
- `LANGSMITH_API_KEY` - LangSmith API key for tracing (required only if tracing is enabled in `llm_config.yaml`)

**LangSmith Configuration - Strict Separation:**

For LangSmith observability, configuration is split by security sensitivity:

**Secrets (in `.env`):**

- `LANGSMITH_API_KEY` - API key (required if tracing is enabled)

**Configuration (in `llm_config.yaml` under `observability.langsmith`):**

- `endpoint` - LangSmith API endpoint (e.g., "https://api.smith.langchain.com")
- `project` - Project name (e.g., "climate_advisor")
- `tracing_enabled` - Enable/disable tracing (true/false)

**Important:**

- There are **NO environment variable options** for endpoint, project, or tracing_enabled
- These settings **MUST** be in `llm_config.yaml`
- No silent fallbacks - service will fail at startup with clear error if configuration is missing

### LLM Configuration

All LLM-related configuration (models, prompts, generation parameters, etc.) is centralized in `llm_config.yaml` in the root of the climate-advisor folder. This includes:

- **Model Configuration**: Default models, available models with capabilities, and parameters
- **Generation Parameters**: Default temperature, max_tokens, and other generation settings
- **System Prompts**: Configurable prompts for different contexts (default, inventory-specific, data analysis)
- **API Settings**: OpenRouter configuration, timeouts, retry logic
- **Observability**: LangSmith tracing configuration (endpoint, project, tracing_enabled)
- **Feature Flags**: Enable/disable streaming, dynamic model selection, etc.

**Example LangSmith configuration in `llm_config.yaml`:**

```yaml
observability:
  langsmith:
    project: "climate_advisor"
    endpoint: "https://api.smith.langchain.com"
    tracing_enabled: true
```

The configuration file supports:

- Multiple model providers and models
- Per-model default parameters
- Flexible prompt templates with context injection
- Parameter validation and limits
- Caching and logging configuration
- Observability and tracing settings

**Temperature Configuration:**

Temperature is configured globally in `llm_config.yaml` and applies to all requests:

```yaml
generation:
  defaults:
    temperature: 0.1 # 0.0 = deterministic, 1.0 = creative
```

- Per-request temperature overrides are **not supported** due to OpenAI Agents SDK limitations
- The Climate Advisor uses `0.1` by default for factual, deterministic responses
- Model selection can be overridden per-request via the `options.model` parameter

Environment variables can override YAML configuration for API keys and sensitive settings.

- Future CC integration placeholders: `CC_BASE_URL`, `CC_OAUTH_CLIENT_ID`, `CC_OAUTH_CLIENT_SECRET`, `CC_OAUTH_TOKEN_URL`

Environment variables are loaded automatically from the nearest `.env` when the service boots.

### Database Migrations

The service uses **Alembic** for database schema management. Migration files are located in `service/migrations/`.

**Migration commands (use the setup script for initial setup):**

```bash
cd climate-advisor/service

# Apply all pending migrations (use setup script instead for initial setup)
python migrate.py upgrade

# Create new migration from model changes
python migrate.py auto "description of changes"

# Check current migration status
python migrate.py current

# View migration history
python migrate.py history

# Downgrade one migration
python migrate.py downgrade

# Create empty migration
python migrate.py create "description"
```

**For local development setup:**

```bash
# Use the unified setup script (recommended)
python ../scripts/setup_database.py

# Or run migrations directly
python migrate.py upgrade
```

Or do it executing commands after logging into a container

```
docker exec -it ca-postgres bash
```

build and run containers

```
docker build -f service/Dockerfile -t climate-advisor:dev .
docker run --rm --env-file .env -p 8080:8080 climate-advisor:dev
```

**Required environment variable:**

- `CA_DATABASE_URL` - PostgreSQL connection string (e.g., `postgresql://user:pass@localhost:5432/climate_advisor`)

See `service/migrations/README.md` for detailed migration documentation and best practices.

## Quick Setup (Recommended)

For a complete from-scratch setup, run the automated setup script:

**Linux/macOS:**

```bash
cd climate-advisor
chmod +x setup.sh
./setup.sh
```

**Windows:**

```powershell
cd climate-advisor
.\setup.bat
```

These scripts will:

1. ✅ Validate your `.env` configuration
2. ✅ Start PostgreSQL container (if not running)
3. ✅ Set up database schema using SQLAlchemy models
4. ✅ Test service health

## Manual Setup

If you prefer manual setup or need more control:

## Setup Scripts

The `scripts/` directory contains several utilities for setting up and testing the service:

### Database Setup Scripts

- **`setup_database.py`** - **Recommended**: Unified database setup script that uses Alembic migrations. Works in both local development and containerized environments.
  - `--check`: Test database connectivity only
  - `--drop`: Reset database (destructive - drops all tables)
  - Default: Run migrations to create/update schema

### Testing Scripts

- **`test_service_stream.py`** - Tests the `/v1/messages` endpoint and displays streaming SSE output for debugging.

## Quick Streaming Test

Run the service, then in another terminal:

```bash
python climate-advisor/scripts/test_service_stream.py http://localhost:8080
```

You should see SSE lines with `event: message` chunks followed by a terminal `event: done`.

## Swagger/OpenAPI

- Built-in Swagger UI is available at `/docs` and ReDoc at `/redoc`.
- A static OpenAPI spec lives at `climate-advisor/docs/climate-advisor-openapi.yaml` for external tooling.

## Observability & Tracing

The Climate Advisor service includes optional LangSmith integration for observability and tracing:

### LangSmith Setup (Optional)

1. **Get your LangSmith API key** from [smith.langchain.com](https://smith.langchain.com/)
2. **Create a `.env` file** in the `climate-advisor/` directory:

   ```bash
   # Copy the example file
   cp climate-advisor/env.example climate-advisor/.env

   # Edit .env and add your API keys
   LANGSMITH_API_KEY=your_langsmith_api_key_here
   OPENROUTER_API_KEY=your_openrouter_api_key_here
   OPENAI_API_KEY=your_openai_api_key_here
   ```

3. **Configure tracing** in `llm_config.yaml`:
   ```yaml
   observability:
     langsmith:
       project: "climate_advisor"
       endpoint: "https://api.smith.langchain.com"
       tracing_enabled: true # Set to false to disable
   ```

### Tracing Features

When enabled, LangSmith will track:

- **Conversation runs**: Complete chat sessions with inputs/outputs
- **Tool usage**: RAG queries, vector searches, and other tool calls
- **Performance metrics**: Latency, token usage, and error rates
- **Error tracking**: Detailed error logs and stack traces

### Troubleshooting Tracing

If you see warnings like `"create_run returned None"` in the logs:

1. Check that `LANGSMITH_API_KEY` is set in your `.env` file
2. Verify your LangSmith API key is valid
3. Ensure the project name in `llm_config.yaml` matches your LangSmith project
4. Check your internet connection to `api.smith.langchain.com`

To disable tracing entirely, set `tracing_enabled: false` in `llm_config.yaml`.

## 🎯 Ready to Use

Once setup is complete, the Climate Advisor service provides:

- **Real-time Chat**: Conversational AI powered by OpenRouter models
- **Thread Management**: Persistent conversation threads with context
- **Streaming Responses**: Server-sent events for real-time message streaming
- **Database Integration**: Full PostgreSQL integration with proper schema management
- **API Documentation**: Comprehensive OpenAPI/Swagger documentation
- **Playground Interface**: Web-based testing interface at `/playground`

The service is designed to be production-ready with proper error handling, logging, and database transactions.
