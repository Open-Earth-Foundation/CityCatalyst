This subfolder /prioritizer contains the logic, api, models and scripts necessary for creating prioritized actions.
It contains the `api.py` file for production and `local_call.py` for testing the prioritization locally.

## Directories

- `data/`: Contains data files used by the different stages.
- `schema/`: Contains JSON schemas for the data files.
- `scripts/`: Contains helper scripts like adding ccras, ghgis or uploading files to AWS S3. This folder also contains a `run_pipeline` script which automatically prioritizes all actions inside the long list of actions against a chosen city, transforms the data to match the required frontend schema and uploads the created file to the AWS S3 bucket for updating the frontend.

## Usage

### Data Import

We are importing data from several sources:

1. City context data from: "https://ccglobal.openearth.dev/api/v0/city_context/city"
2. City CCRA data from: "https://ccglobal.openearth.dev/api/v0/ccra/risk_assessment/city"
3. City GHGI data is passed via the request body

### Langsmith

If the LLM logs should be logged by langsmith, the .env variables must be set
`LANGCHAIN_TRACING_V2=true`
as well as the corresponding project name and api key.
