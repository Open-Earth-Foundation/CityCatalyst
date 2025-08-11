#!/bin/bash

# This script is used to create a vector store with the national strategies of Brazil.
# The vector store is saved in the directory: app/runtime_data/vector_stores/

# Exit immediately if a command exits with a non-zero status
set -e
set -o pipefail

# Set the collection name variable
COLLECTION_NAME="br_national_strategy"

# OS-specific paths
if [[ "$OSTYPE" == "linux-gnu"* || "$OSTYPE" == "darwin"* ]]; then
  VENV_PYTHON="../../.venv/bin/python"
  VENV_ACTIVATE="../../.venv/bin/activate"
elif [[ "$OSTYPE" == "msys"* || "$OSTYPE" == "cygwin"* || "$OSTYPE" == "win32" ]]; then
  VENV_PYTHON="../../.venv/Scripts/python.exe"
  VENV_ACTIVATE="../../.venv/Scripts/activate"
else
  echo "Unsupported OS: $OSTYPE"
  exit 1
fi

# Ensure virtual environment is deactivated on exit
trap "deactivate; echo 'Virtual environment deactivated.'" EXIT

# Activate the virtual environment dynamically
echo "Activating virtual environment..."
source "$VENV_ACTIVATE"
if [ -z "$VIRTUAL_ENV" ]; then
  echo "Failed to activate virtual environment."
  exit 1
else
  echo -e "Virtual environment activated: $VIRTUAL_ENV\n"
fi

# Setup vector store
python create_vectorstore.py --collection_name "$COLLECTION_NAME"

# Add documents to the vector store
echo "Adding national strategy documents..."
python add_document_to_vectorstore.py \
  --file_name Brazil_NDC_November_2024.pdf \
  --collection_name "$COLLECTION_NAME"

python add_document_to_vectorstore.py \
  --file_name Brazil_NAP_2016.pdf \
  --collection_name "$COLLECTION_NAME"

python add_document_to_vectorstore.py \
  --file_name Urban_Solid_Waste_Management_BRCXL.pdf \
  --collection_name "$COLLECTION_NAME"

python add_document_to_vectorstore.py \
  --file_name Worldbank_Green_Cities_Brazil.pdf \
  --collection_name "$COLLECTION_NAME"

python add_document_to_vectorstore.py \
  --file_name TNC_Brazil_Annual_Report_2023.pdf \
  --collection_name "$COLLECTION_NAME"
# Ensure clean exit
echo "Vector store setup for "$COLLECTION_NAME" completed successfully."