#!/bin/bash

# This script is used to create vector stores with the national strategies of Brazil.
# The vector stores is saved in the directory: app/runtime_data/vector_stores/
# One vector store is created for the mitigation strategies and one for the adaptation strategies.

# Run this script from the app/scripts directory.
# Command: bash app/scripts/br_national_strategies.sh

# Exit immediately if a command exits with a non-zero status
set -e
set -o pipefail

# Set the collection name variable
COLLECTION_NAME_MITIGATION="br_national_strategy_mitigation"
COLLECTION_NAME_ADAPTATION="br_national_strategy_adaptation"

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
echo "Creating vector store for mitigation strategies "$COLLECTION_NAME_MITIGATION"..."

python create_vectorstore_from_json.py --file_name "br_national_strategy_mitigation_flattened.json" --collection_name "$COLLECTION_NAME_MITIGATION"

echo "Vector store setup for mitigation strategies "$COLLECTION_NAME_MITIGATION" completed successfully."

# echo "Creating vector store for adaptation strategies "$COLLECTION_NAME_ADAPTATION"..."

# python create_vectorstore_from_json.py --file_name "br_national_strategy_adaptation_flattened.json" --collection_name "$COLLECTION_NAME_ADAPTATION"

# echo "Vector store setup for adaptation strategies "$COLLECTION_NAME_ADAPTATION" completed successfully."

echo "Vector store setup complete."