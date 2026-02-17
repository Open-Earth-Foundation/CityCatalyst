#!/bin/sh

# This script is used to run the application.
# Keep it as a thin wrapper around the server start command, with optional
# placeholders for future bootstrapping steps (migrations, downloads, etc.).

set -e

echo ""
echo "Running HIAP-MEED startup script"
echo ""

echo "Placeholder: pre-start tasks (optional)"
echo "- e.g. database migrations"
echo "- e.g. warm caches"
echo "- e.g. download artifacts"
echo ""

echo "Starting server..."
exec uvicorn main:app --host 0.0.0.0 --port 8000

