#!/bin/sh

echo "Checking if vector store exists." 
echo "If not, creating vector store..."
echo "This may take a while..."

# Run the vector store script and capture its exit code
python utils/get_vectorstore_from_s3.py
VECTOR_STORE_STATUS=$?

# Check if the script failed
if [ $VECTOR_STORE_STATUS -ne 0 ]; then
    echo "ERROR: Failed to load or create vector store. Exiting..."
    exit 1
fi

# If we get here, the vector store is ready
echo "Vector store is ready. Starting server..."
exec uvicorn api:app --host 0.0.0.0 --port 8000

