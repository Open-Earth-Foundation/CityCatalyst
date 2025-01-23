#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e
set -o pipefail

# Set the collection name variable
COLLECTION_NAME="cap_docs_db"

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
python create_vectorstore.py --collection_name "$COLLECTION_NAME"
python add_document_to_vectorstore.py --subfolder "cap" --file_name belo_horizonte_cap.pdf --collection_name "$COLLECTION_NAME" 
python add_document_to_vectorstore.py --subfolder "cap" --file_name campinas_cap.pdf --collection_name "$COLLECTION_NAME" 
python add_document_to_vectorstore.py --subfolder "cap" --file_name curitiba_cap.pdf --collection_name "$COLLECTION_NAME" 
python add_document_to_vectorstore.py --subfolder "cap" --file_name fortaleza_cap.pdf --collection_name "$COLLECTION_NAME"
python add_document_to_vectorstore.py --subfolder "cap" --file_name guarullhos_cap.pdf --collection_name "$COLLECTION_NAME"
python add_document_to_vectorstore.py --subfolder "cap" --file_name niteroi_cap.pdf --collection_name "$COLLECTION_NAME"
python add_document_to_vectorstore.py --subfolder "cap" --file_name porto_alegre_cap.pdf --collection_name "$COLLECTION_NAME"
python add_document_to_vectorstore.py --subfolder "cap" --file_name recife_cap.pdf --collection_name "$COLLECTION_NAME"
python add_document_to_vectorstore.py --subfolder "cap" --file_name rio_branco_cap.pdf --collection_name "$COLLECTION_NAME"
python add_document_to_vectorstore.py --subfolder "cap" --file_name rio_de_janeiro_cap.pdf --collection_name "$COLLECTION_NAME"
python add_document_to_vectorstore.py --subfolder "cap" --file_name salvador_cap.pdf --collection_name "$COLLECTION_NAME"
python add_document_to_vectorstore.py --subfolder "cap" --file_name sao_paulo_cap.pdf --collection_name "$COLLECTION_NAME"
python add_document_to_vectorstore.py --subfolder "cap" --file_name teresina_cap.pdf --collection_name "$COLLECTION_NAME"

# Ensure clean exit
echo "Vector store setup for "$COLLECTION_NAME" completed successfully."