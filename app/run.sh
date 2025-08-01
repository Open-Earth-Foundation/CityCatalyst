#!/bin/sh

# This script is used to run the application
# Under different OS, the line endings may be different
# Under Windows, the line endings are CRLF
# Under Unix, the line endings are LF
# When running in Docker(Linux), the line endings are LF

set -e

# Set collection name (update these as needed)
# Collection name is the name of the vector store in S3
COLLECTION_NAME_BR="br_national_strategy"
COLLECTION_NAME_GENERAL="all_docs_db_small_chunks"

echo ""
echo "Running startup script:"
echo "Checking if vector store exists..."
echo "If not, creating vector store..."
echo "This may take a while."
echo ""
echo "Collection name for Brasil: $COLLECTION_NAME_BR"
echo "Collection name for general use: $COLLECTION_NAME_GENERAL"
echo ""

# Run the vector store script and capture its exit code
# Download the vector store for Brasil
python -m plan_creator_bundle.scripts.download_vectorstore_from_s3 "$COLLECTION_NAME_BR"
VECTOR_STORE_STATUS_BR=$?

# Download the vector store for general use
python -m plan_creator_bundle.scripts.download_vectorstore_from_s3 "$COLLECTION_NAME_GENERAL"
VECTOR_STORE_STATUS_GENERAL=$?

# Check if either download failed
if [ $VECTOR_STORE_STATUS_BR -ne 0 ] || [ $VECTOR_STORE_STATUS_GENERAL -ne 0 ]; then
    VECTOR_STORE_STATUS=1
else
    VECTOR_STORE_STATUS=0
fi

# Debugging code:
# Run without loading the vector store
# VECTOR_STORE_STATUS=0

# Check if the script failed
if [ $VECTOR_STORE_STATUS -ne 0 ]; then
    echo "ERROR: Failed to load or create vector store. Exiting..."
    exit 1
fi

# If we get here, the vector store is ready
echo "Vector store is ready. Starting server..."
exec uvicorn main:app --host 0.0.0.0 --port 8000 