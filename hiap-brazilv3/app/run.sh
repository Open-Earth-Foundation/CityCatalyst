#!/bin/sh

# This script is used to run the application.
# Keep it as a thin wrapper around the server start command.

set -e

echo ""
echo "Running HIAP-BRAZILV3 startup script (scaffold)"
echo ""

exec python -m app.main
