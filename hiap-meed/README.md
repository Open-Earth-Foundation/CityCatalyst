# HIAP-MEED

`hiap-meed` is a minimal FastAPI service boilerplate aligned with `hiap/` in this mono-repo.

## Repository layout

```text
hiap-meed/
├── app/                 # FastAPI application code
│   ├── main.py          # Application entry point
│   ├── run.sh           # Container/startup entrypoint
│   ├── scripts/         # Placeholder for runnable scripts
│   ├── services/        # Placeholder for external integrations
│   └── utils/           # Shared utilities (logging, etc.)
├── k8s/                 # Deployment manifests for Kubernetes
├── tests/               # Unit and integration tests
├── Dockerfile           # Container image definition
├── pyproject.toml       # Dependency source of truth (uv)
├── uv.lock              # Locked dependencies (uv)
└── .env.example         # Sample environment variables required by the service
```

## Getting started

### 1. Configure the environment

Copy `.env.example` to `.env` and fill in the required values.

```bash
cp .env.example .env
```

### 2. Install dependencies (uv)

From the `hiap-meed` directory:

```bash
uv sync
```

### 3. Run the API locally

Run from the `hiap-meed/app` directory to match the import layout used in production:

```bash
cd app
uv run python main.py
```

API docs are available at `http://localhost:8000/docs`.

### 4. Docker

From the `hiap-meed` directory:

```bash
docker build -t hiap-meed-app .
docker run -it --rm -p 8000:8000 --env-file .env hiap-meed-app
```

## Testing

From the `hiap-meed` directory:

```bash
uv run pytest -c pytest.ini
```

