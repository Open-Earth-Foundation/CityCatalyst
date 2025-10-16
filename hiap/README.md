# High Impact Actions Prioritizer (HIAP)

The High Impact Actions Prioritizer (HIAP) backend now lives inside the
[`CityCatalyst`](../README.md) mono-repository under `CityCatalyst/hiap`. It exposes
APIs for prioritising climate actions, generating implementation plans, and serving
supporting datasets used by legacy prototypes.

## Repository layout

```
hiap/
├── app/                 # FastAPI application code
│   ├── main.py          # Application entry point
│   ├── plan_creator_bundle/
│   │   ├── plan_creator/        # Current plan-creator endpoints
│   │   └── plan_creator_legacy/ # Legacy plan-creator endpoints
│   ├── prioritizer/     # Prioritiser API, models and orchestration logic
│   ├── services/, utils/ and scripts/
│   └── cap_off_app/     # Data refresh scripts for the proof-of-concept “cap off” app
├── k8s/                 # Deployment manifests for running HIAP in Kubernetes
├── tests/               # Unit and integration tests
├── Dockerfile           # Container image definition
├── requirements.txt     # Runtime Python dependencies
├── requirements-dev.txt # Tooling for local development and testing
└── .env.example         # Sample environment variables required by the service
```

The `cap_off_app` utilities were added when migrating the original HIAP repository
into this mono-repo. They are only needed when regenerating artefacts for the legacy
proof-of-concept front-end and are otherwise independent of the API runtime.

## Getting started

### 1. Clone and navigate

```bash
git clone git@github.com:Open-Earth-Foundation/CityCatalyst.git
cd CityCatalyst/hiap
```

### 2. Configure the environment

Copy `.env.example` to `.env` and fill in the required values for OpenAI, AWS and
service configuration. The API reads these values at start-up.

```bash
cp .env.example .env
```

Create and activate a Python virtual environment, then install dependencies:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
```

### 3. Run the API locally

From the `hiap/app` directory run the FastAPI application:

```bash
cd app
python main.py
```

By default the service listens on `http://0.0.0.0:8000`. You can override the host
and port through `API_HOST` and `API_PORT` in your `.env` file. Interactive
documentation is available at `http://localhost:8000/docs` once the server is
running.

Alternatively, build and run the Docker image from the `hiap` directory:

```bash
docker build -t hiap-app .
docker run -it --rm -p 8000:8000 --env-file .env hiap-app
```

### 4. Regenerating “cap off” artefacts (optional)

If you need to refresh the proof-of-concept “cap off” application data, use the
scripts in `app/cap_off_app`. See `app/cap_off_app/README.md` for the detailed
workflow and required inputs.

## Testing

Run the full test-suite from the `hiap` directory with:

```bash
pytest
```

To skip long-running scenarios you can use the provided markers, for example:

```bash
pytest -m "not slow"
```

Refer to `pytest.ini` for the full list of markers available to target specific
types of tests.
