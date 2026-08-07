#!/bin/bash
# Climate Advisor Setup Script
# This script helps set up the Climate Advisor service from scratch

set -e

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
if ! grep -q "OPENROUTER_API_KEY" .env || ! grep -q "CA_DATABASE_URL" .env; then
    echo "Required environment variables not found in .env"
    echo "   Please ensure OPENROUTER_API_KEY and CA_DATABASE_URL are set"
    exit 1
fi

echo "Required environment variables are configured"

# Check if PostgreSQL container is running
if ! docker ps | grep -q "ca-postgres"; then
    echo "PostgreSQL container 'ca-postgres' not found"
    echo "   Starting PostgreSQL container..."

    docker run --name ca-postgres -e POSTGRES_PASSWORD=admin -e POSTGRES_DB=postgres \
      -p 5432:5432 -d postgres:15

    echo "PostgreSQL container started"
    echo "   Waiting 10 seconds for PostgreSQL to be ready..."
    sleep 10
else
    echo "PostgreSQL container is already running"
fi

# Set up the database
echo "Setting up database schema..."
uv run python scripts/setup_database.py

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
