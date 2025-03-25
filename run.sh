#!/bin/sh

echo "Checking if vector store exists." 
echo "If not, creating vector store..."
echo "This may take a while..."
python utils/get_vectorstore_from_s3.py
exec uvicorn api:app --host 0.0.0.0 --port 8000

