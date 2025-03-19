#!/bin/bash

# This script is used to run the pipeline of:
# 1. Creating the prioritized list of climate actions
# 2. Generating the enriched JSON file for the frontend
# 3. Uploading the files to the AWS S3 bucket

# Usage (from git bash): bash scripts/upload_to_frontend/run_pipeline.sh BRCCI

# Exit immediately if a command exits with a non-zero status
set -e
set -o pipefail

# OS-specific paths
if [[ "$OSTYPE" == "linux-gnu"* || "$OSTYPE" == "darwin"* ]]; then
  VENV_PYTHON=".cap/bin/python"
  VENV_ACTIVATE=".cap/bin/activate"
elif [[ "$OSTYPE" == "msys"* || "$OSTYPE" == "cygwin"* || "$OSTYPE" == "win32" ]]; then
  VENV_PYTHON=".cap/Scripts/python.exe"
  VENV_ACTIVATE=".cap/Scripts/activate"
else
  echo "Unsupported OS: $OSTYPE"
  exit 1
fi

# Paths to the scripts
PRIORITIZER_SCRIPT="prioritizer/prioritizer.py"
ENRICHER_SCRIPT="scripts/upload_to_frontend/enrich_for_frontend_schema.py"
UPLOAD_SCRIPT="scripts/upload_to_frontend/upload_to_s3.py"

# Ensure virtual environment is deactivated on exit
trap "deactivate; echo 'Virtual environment deactivated.'" EXIT

# Check if the LOCODE argument is provided
if [ $# -lt 1 ]; then
  echo "Error: LOCODE argument is required."
  echo "Usage: $0 LOCODE"
  exit 1
fi

# Assign the first argument to the LOCODE variable
LOCODE=$1

# Activate the virtual environment dynamically
echo "Activating virtual environment..."
source "$VENV_ACTIVATE"
if [ -z "$VIRTUAL_ENV" ]; then
  echo "Failed to activate virtual environment."
  exit 1
else
  echo -e "Virtual environment activated: $VIRTUAL_ENV\n"
fi


# echo "Prioritizer..."
# $VENV_PYTHON -m prioritizer.prioritizer --locode "$LOCODE"
# echo -e "Prioritization done.\n"

echo "Enrich for frontend..."
$VENV_PYTHON -m scripts.upload_to_frontend.enrich_for_frontend_schema --locode "$LOCODE" --action_type "mitigation"
$VENV_PYTHON -m scripts.upload_to_frontend.enrich_for_frontend_schema --locode "$LOCODE" --action_type "adaptation"
echo -e "Enriching done.\n"

echo "Upload to S3..."
$VENV_PYTHON -m scripts.upload_to_frontend.upload_to_s3 --file_name "output_${LOCODE}_adaptation_enriched.json" --s3_key "data/adaptation/${LOCODE}.json"
$VENV_PYTHON -m scripts.upload_to_frontend.upload_to_s3 --file_name "output_${LOCODE}_mitigation_enriched.json" --s3_key "data/mitigation/${LOCODE}.json"
echo -e "Upload to S3 done.\n"
