#!/bin/bash
# Brief: Prepare the local Climate Advisor database and verify service health.
#
# Inputs:
# - Files: project-root .env with CA_DATABASE_URL and OPENROUTER_API_KEY.
# - Tools: Docker Compose, uv, curl, and grep available on PATH.
#
# Outputs:
# - Starts the Compose postgres service, applies Alembic migrations, and reports
#   whether an already-running Climate Advisor service passes its health check.
#
# Usage (from project root):
# - bash scripts/setup.sh

set -euo pipefail

echo "Climate Advisor Setup Script"
echo "================================="

# Check if .env exists
if [ ! -f ".env" ]; then
    echo ".env file not found!"
    echo "   Please copy .env.example to .env and configure your settings:"
    echo "   cp .env.example .env"
    echo "   # Then edit .env with your API keys and database settings"
    exit 1
fi

echo "Found .env configuration file"

# Check if required environment variables are set
if ! grep -Eq '^OPENROUTER_API_KEY=.+$' .env || ! grep -Eq '^CA_DATABASE_URL=.+$' .env; then
    echo "Required environment variables not found in .env"
    echo "   Please ensure OPENROUTER_API_KEY and CA_DATABASE_URL are set"
    exit 1
fi

echo "Required environment variables are configured"

# Start the configured pgvector database and wait for its health check.
echo "Starting the PostgreSQL service..."
docker compose up -d --wait postgres
echo "PostgreSQL service is ready"

# Set up the database
echo "Setting up database schema..."
uv run --directory service python -m scripts.setup_database

echo "Database schema created successfully"

# Test the service
echo "Testing service health..."
if curl -s http://localhost:8080/health | grep -q '"status":"ok"'; then
    echo "Service health check passed"
else
    echo "Service health check failed"
    echo "   The service may not be running. Try starting it manually:"
    echo "   uv run --directory service uvicorn app.main:app --host 0.0.0.0 --port 8080"
fi

echo ""
echo "Climate Advisor setup complete!"
echo ""
echo "Next steps:"
echo "   1. Start the service: uv run --directory service uvicorn app.main:app --host 0.0.0.0 --port 8080"
echo "   2. Visit http://localhost:8080/playground to test the API"
echo "   3. Check API docs at http://localhost:8080/docs"
echo ""
echo "Useful endpoints:"
echo "   - Health: GET /health"
echo "   - Create Thread: POST /v1/threads"
echo "   - Send Message: POST /v1/messages"
echo "   - Playground: http://localhost:8080/playground"
