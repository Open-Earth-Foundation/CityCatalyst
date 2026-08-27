# Component Inventory

## Application Packages

- `app` — Next.js web application and CityCatalyst Core REST API; owns authorization, Sequelize models/migrations, native catalog, and current CA capability routes.
- `climate-advisor` — FastAPI conversational advisor; owns threads, messages, workflow state, request-time agent/tool registration, and the CC HTTP client.
- `global-api` — FastAPI service for shared emissions, risk, and action datasets.
- `hiap` — FastAPI action prioritization and plan-creator service.
- `hiap-meed` — FastAPI MEED prioritization service with separate schemas and artifact behavior.
- `api-demo` — Static OAuth API client demonstration.

## Infrastructure Packages

- `k8s` — Kubernetes manifests for dev/test/prod service deployment.
- Package-local Dockerfiles and deployment manifests — Container build/deployment definitions for the cooperating services.
- `.github/workflows` — GitHub Actions for service builds/tests/deployments and contract/reconciliation checks.

## Shared Packages

- No separately versioned shared library package was identified. Shared contracts are currently maintained within Core capability registries/routes and Climate Advisor client/tool modules.

## Test Packages

- `app/tests` — 93 tracked Jest/API tests, including catalog lifecycle, permissions, CA auth, and capability contracts.
- `climate-advisor/service/tests` — 62 tracked pytest tests, including AgentService, CC client/auth, inventory tools, streaming, and CNB/Stationary Energy workflows.
- `global-api/tests` — 15 tracked tests.
- `hiap/tests` — 13 tracked tests.
- `hiap-meed/tests` — 26 tracked tests.
- `load-test` — k6-oriented load-test package with a placeholder npm test script.

## Total Count

- **Tracked repository files**: 2,560 at analysis time (generated/ignored environments excluded).
- **Top-level operational packages**: 7 (six application/service packages plus load-test); `k8s` and CI are infrastructure/deployment areas.
- **Application/service packages**: 6.
- **Infrastructure areas**: 2 primary areas (`k8s`, `.github/workflows`) plus package-local manifests.
- **Shared packages**: 0 separately versioned packages identified.
- **Test areas**: Integrated into each service; 209 tracked test files across the five counted test suites.
