#!/bin/sh

# This script is used to run the application
# Under different OS, the line endings may be different
# Under Windows, the line endings are CRLF
# Under Unix, the line endings are LF
# When running in Docker(Linux), the line endings are LF

set -e

# Set collection name (update these as needed)
# Names are the name of the vector stores or json files in S3
COLLECTION_NAME_GENERAL="all_docs_db_small_chunks"
COLLECTION_NAME_BR="br_national_strategy"
JSON_COUNTRY_STRATEGY_BR="br_country_strategy.json"
JSON_COUNTRY_STRATEGY_DE="de_country_strategy.json"

echo ""
echo "Running startup script:"
echo "Checking if vector stores and json files exist locally."
echo "If not, downloading them from S3."
echo "This may take a while."
echo ""
echo "Collection name for general use: $COLLECTION_NAME_GENERAL"
echo "Collection name for Brasil: $COLLECTION_NAME_BR"
echo "JSON file for Brasil country strategy: $JSON_COUNTRY_STRATEGY_BR"
echo "JSON file for Germany country strategy: $JSON_COUNTRY_STRATEGY_DE"
echo ""

# Run the vector store script and capture its exit code
# Initialize download status tracking
DOWNLOAD_FAILED=false

# Download the vector store for general use
echo "Downloading vector store for general use: $COLLECTION_NAME_GENERAL"
if ! python -m plan_creator_bundle.scripts.download_vectorstore_from_s3 "$COLLECTION_NAME_GENERAL"; then
    echo "ERROR: Failed to download vector store for general use"
    DOWNLOAD_FAILED=true
fi

# Download the vector store for Brasil
echo "Downloading vector store for Brasil: $COLLECTION_NAME_BR"
if ! python -m plan_creator_bundle.scripts.download_vectorstore_from_s3 "$COLLECTION_NAME_BR"; then
    echo "ERROR: Failed to download vector store for Brasil"
    DOWNLOAD_FAILED=true
fi

# Download the json files for the country strategies
echo "Downloading country strategy files..."
if ! python -m plan_creator_bundle.scripts.download_json_files_from_s3 "$JSON_COUNTRY_STRATEGY_BR"; then
    echo "ERROR: Failed to download Brasil country strategy file"
    DOWNLOAD_FAILED=true
fi

if ! python -m plan_creator_bundle.scripts.download_json_files_from_s3 "$JSON_COUNTRY_STRATEGY_DE"; then
    echo "ERROR: Failed to download Germany country strategy file"
    DOWNLOAD_FAILED=true
fi

# Check if any download failed
if [ "$DOWNLOAD_FAILED" = true ]; then
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