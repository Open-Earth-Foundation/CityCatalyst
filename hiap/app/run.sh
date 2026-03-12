#!/bin/sh

# This script is used to run the application
# Under different OS, the line endings may be different
# Under Windows, the line endings are CRLF
# Under Unix, the line endings are LF
# When running in Docker(Linux), the line endings are LF

set -e

echo ""
echo "Running startup script:"
echo "Checking if vector stores and json files exist locally."
echo "If not, downloading them from S3."
echo "This may take a while."
echo ""

# Optional: allow starting the API without S3 artefacts (useful for external users).
# Note: some endpoints may degrade or fail if required artefacts are missing.
if [ "${HIAP_SKIP_S3_DOWNLOADS:-}" = "true" ] || [ "${HIAP_SKIP_S3_DOWNLOADS:-}" = "1" ]; then
    echo ""
    echo "HIAP_SKIP_S3_DOWNLOADS is enabled; skipping S3 downloads."
    echo "Starting server (some features may not work without vector stores / artefacts)."
    echo ""
    exec uvicorn main:app --host 0.0.0.0 --port 8000
fi

# Initialize download status tracking
DOWNLOAD_FAILED=false

# Download all vector stores
echo ""
echo "Downloading all vector stores..."
if ! python -m scripts.download_vectorstore_from_s3_bulk; then
    echo "ERROR: Failed to download one or more vector stores"
    DOWNLOAD_FAILED=true
fi

# Check if any download failed
if [ "$DOWNLOAD_FAILED" = true ]; then
    echo "ERROR: One or more downloads failed. Exiting..."
    exit 1
fi

# If we get here, the downloads were successful
echo ""
echo "All files are ready. Starting server..."
exec uvicorn main:app --host 0.0.0.0 --port 8000
