# Climate Advisor

Climate Advisor (CA) is a standalone FastAPI microservice that powers the conversational experience for CityCatalyst (CC). The service lives under `climate-advisor/service` and exposes versioned APIs under `/v1/*`.

## Local Development

Prerequisites: Python 3.11+, pip, and Docker (for local Postgres).

1. Create and activate a Python virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Copy the example environment file and adjust values as needed:
   ```bash
   cp climate-advisor/.env.example climate-advisor/.env
   ```

3. Start a local Postgres instance (see [Postgres Quickstart](#postgres-quickstart)). Leave it running while you develop.

4. Install dependencies:
   ```bash
   cd climate-advisor/service
   pip install -r requirements.txt
   ```

5. Create or reset the database schema (idempotent):
   ```bash
   python ../scripts/setup_local_db.py
   ```
   Add `--drop` to wipe and recreate the schema.

6. Run the service:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8080
   ```

7. Explore the API docs:
   - Swagger UI: http://localhost:8080/docs
   - OpenAPI JSON: http://localhost:8080/openapi.json
   - Playground: http://localhost:8080/playground (simple HTML tester)

## Postgres Quickstart

Launch a disposable Postgres container that matches the defaults in `.env.example`:

```bash
docker run --name ca-postgres -e POSTGRES_PASSWORD=admin -e POSTGRES_DB=climate_advisor \
  -p 5432:5432 -d postgres:15
```

Update `CA_DATABASE_URL` if you change credentials or the port. Stop the container with `docker stop ca-postgres` (and remove with `docker rm ca-postgres`).

## Health Endpoint

- `GET /health` - liveness probe

## Endpoints (v1)

- `POST /v1/threads` - creates a thread, persists it to Postgres, and returns `{ "thread_id": "..." }`
- `POST /v1/messages` - persists the user message, streams the assistant response from OpenRouter, then stores the assistant reply in Postgres

## Docker (service)

Build and run the API container:

```bash
cd climate-advisor/service
docker build -t climate-advisor:dev .
docker run --rm --env-file ../.env -p 8080:8080 climate-advisor:dev
```

Ensure Postgres is reachable from inside the container (e.g., use `host.docker.internal` on macOS/Windows).

## Configuration

### Environment Variables

Environment variables (see `.env.example` for defaults):

- `CA_PORT` - default 8080
- `CA_LOG_LEVEL` - info|debug
- `CA_CORS_ORIGINS` - CSV list of allowed origins (default `*` for dev)
- `CA_DATABASE_URL` - SQLAlchemy async URL, e.g. `postgresql://postgres:admin@localhost:5432/climate_advisor`
- `CA_DATABASE_POOL_SIZE`, `CA_DATABASE_MAX_OVERFLOW`, `CA_DATABASE_POOL_TIMEOUT`, `CA_DATABASE_ECHO` - optional pool tuning
- `OPENROUTER_API_KEY` - your OpenRouter API key (required)

### LLM Configuration

All LLM-related configuration (models, prompts, generation parameters, etc.) is centralized in `llm_config.yaml` in the root of the climate-advisor folder. This includes:

- **Model Configuration**: Default models, available models with capabilities, and parameters
- **Generation Parameters**: Default temperature, max_tokens, and other generation settings
- **System Prompts**: Configurable prompts for different contexts (default, inventory-specific, data analysis)
- **API Settings**: OpenRouter configuration, timeouts, retry logic
- **Feature Flags**: Enable/disable streaming, dynamic model selection, etc.

The configuration file supports:
- Multiple model providers and models
- Per-model default parameters
- Flexible prompt templates with context injection
- Parameter validation and limits
- Caching and logging configuration

Environment variables can override YAML configuration for API keys and sensitive settings.
- Future CC integration placeholders: `CC_BASE_URL`, `CC_OAUTH_CLIENT_ID`, `CC_OAUTH_CLIENT_SECRET`, `CC_OAUTH_TOKEN_URL`

Environment variables are loaded automatically from the nearest `.env` when the service boots.

### Database Migrations

The service uses **Alembic** for database schema management. Migration files are located in `service/migrations/`.

**Quick migration commands:**
```bash
cd climate-advisor/service

# Apply all pending migrations
python migrate.py upgrade

# Create new migration from model changes  
python migrate.py auto "description of changes"

# Check current migration status
python migrate.py current

# View migration history
python migrate.py history
```

**Required environment variable:**
- `CA_DATABASE_URL` - PostgreSQL connection string (e.g., `postgresql://user:pass@localhost:5432/climate_advisor`)

See `service/migrations/README.md` for detailed migration documentation and best practices.

## Scripts

- `climate-advisor/scripts/setup_local_db.py` - create/drop the Postgres schema
- `climate-advisor/scripts/test_service_stream.py` - invoke `/v1/messages` and print SSE output

## Quick Streaming Test

Run the service, then in another terminal:

```bash
python climate-advisor/scripts/test_service_stream.py http://localhost:8080
```

You should see SSE lines with `event: message` chunks followed by a terminal `event: done`.

## Swagger/OpenAPI

- Built-in Swagger UI is available at `/docs` and ReDoc at `/redoc`.
- A static OpenAPI spec lives at `climate-advisor/docs/climate-advisor-openapi.yaml` for external tooling.


