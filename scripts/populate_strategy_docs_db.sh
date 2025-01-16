#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e
set -o pipefail

# OS-specific paths
if [[ "$OSTYPE" == "linux-gnu"* || "$OSTYPE" == "darwin"* ]]; then
  VENV_PYTHON="../.plan-creator/bin/python"
  VENV_ACTIVATE="../.plan-creator/bin/activate"
elif [[ "$OSTYPE" == "msys"* || "$OSTYPE" == "cygwin"* || "$OSTYPE" == "win32" ]]; then
  VENV_PYTHON="../.plan-creator/Scripts/python.exe"
  VENV_ACTIVATE="../.plan-creator/Scripts/activate"
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
python create_vectorstore.py --collection_name test_strategy_docs_db
python add_document_to_vectorstore.py --collection_name test_strategy_docs_db --file_name Brazil_NDC_November2024.pdf
python add_document_to_vectorstore.py --collection_name test_strategy_docs_db --file_name Worldbank_Green_Cities_Brazil.pdf

# Ensure clean exit
echo "Vector store setup completed successfully."