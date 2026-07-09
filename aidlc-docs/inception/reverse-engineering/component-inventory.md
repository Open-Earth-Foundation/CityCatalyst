# Component Inventory

## Application Packages

| Package | Stack | Purpose |
|---------|-------|---------|
| `app/` | Next.js 15, TypeScript, Sequelize, Chakra UI v3 | Main web app — UI, REST API, auth, tenancy, GHGI/CCRA/HIAP |
| `global-api/` | Python FastAPI, SQLAlchemy, PostGIS | Global emissions data, GPC catalogue, GIS, CCRA, climate finance |
| `climate-advisor/` | Python FastAPI, pgvector, openai-agents | Conversational AI advisor (RAG chat, agentic GHGI) |
| `hiap/` | Python FastAPI, XGBoost, LangChain | Action prioritization (ML) and plan generation (LLM) |
| `hiap-meed/` | Python FastAPI, pandas, MLflow | Experimental MEED+ multi-criteria scoring |
| `api-demo/` | Static HTML + Nginx | OAuth 2.0 + PKCE demo client |

## Infrastructure Packages

| Package | Type | Purpose |
|---------|------|---------|
| `k8s/` | Kubernetes YAML | Shared manifests: web, DBs, global-api, ingress, cron jobs, backups |
| `hiap/k8s/` | Kubernetes YAML | HIAP service deployments (dev/test/prod) |
| `hiap-meed/k8s/` | Kubernetes YAML | HIAP-MEED service deployments |
| `climate-advisor/k8s/` | Kubernetes YAML | Climate Advisor + DB + migration jobs |
| `api-demo/k8s/` | Kubernetes YAML | OAuth demo SPA deployment |
| `.github/workflows/` | GitHub Actions | CI/CD per service (19 workflow files) |

## Shared / Tooling Packages

| Package | Type | Purpose |
|---------|------|---------|
| `load-test/` | k6 + TypeScript | Load testing scripts |
| `docs/` | Markdown | Architecture notes (`plan.md`, `AgenticModuleScope.md`) |
| `aws-aidlc-rules/` | AI workflow | AI-DLC core workflow rules |
| `aws-aidlc-rule-details/` | AI workflow | AI-DLC stage definitions and extensions |
| `.cursor/` | IDE config | Agent skills, project rules, architecture docs |
| `aidlc-docs/` | AI-DLC docs | Reverse engineering and workflow artifacts |

## Test Packages

| Package | Type | Purpose |
|---------|------|---------|
| `app/tests/` | Jest (unit + API) | `*.jest.ts` test files |
| `app/e2e/` | Playwright (E2E) | `*.spec.ts` browser tests |
| `global-api/tests/` | pytest | API and data tests |
| `hiap/tests/` | pytest | Unit, integration, external markers |
| `hiap-meed/tests/` | pytest | Unit and integration tests |
| `climate-advisor/service/tests/` | pytest | Unit, integration, e2e, manual_llm markers |

## app/ Internal Module Counts

| Module | Count | Location |
|--------|-------|----------|
| API routes | 152 | `app/src/app/api/v1/` |
| Backend services | 79 files | `app/src/backend/` |
| Sequelize models | 56 | `app/src/models/` |
| React components | 100+ | `app/src/components/` |
| Custom hooks | 20+ | `app/src/hooks/` |
| i18n locales | 5 languages | `app/src/i18n/locales/{en,de,es,fr,pt}/` |
| Migrations | 100+ | `app/migrations/` |
| Seeders | 50+ | `app/seeders/` |

## global-api/ Module Counts

| Module | Count | Location |
|--------|-------|----------|
| Route modules | 35 | `global-api/routes/` |
| Deprecated routes | 5+ | `global-api/routes/deprecated/` |
| Alembic migrations | 20+ | `global-api/migrations/versions/` |

## MCP Tools (app)

| Tool | Status | File |
|------|--------|------|
| `get_user_inventories` | Implemented | `app/src/lib/mcp/tools/inventories.ts` |
| `get_inventory_emissions` | Implemented | `app/src/lib/mcp/tools/emissions.ts` |
| `get_user_cities` | Implemented | `app/src/lib/mcp/tools/cities.ts` |
| `get_city_profile` | Implemented | `app/src/lib/mcp/tools/city-profile.ts` |
| `get_climate_action_plans` | Implemented | `app/src/lib/mcp/tools/action-plans.ts` |
| `get_climate_risk_assessment` | Stub (not implemented) | `app/src/lib/mcp/tools/risk-assessment.ts` |

## Total Count

| Category | Count |
|----------|-------|
| **Total runtime packages** | 6 (app, global-api, climate-advisor, hiap, hiap-meed, api-demo) |
| **Application** | 6 |
| **Infrastructure** | 5 (k8s dirs + workflows) |
| **Shared/Tooling** | 6 |
| **Test** | 6 test directories |
