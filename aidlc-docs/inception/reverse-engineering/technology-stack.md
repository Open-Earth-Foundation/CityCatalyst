# Technology Stack

## Programming Languages

| Language | Version | Usage |
|----------|---------|-------|
| TypeScript | 5.x | app/ — UI, API routes, services, models |
| Python | 3.11+ | global-api, hiap, hiap-meed, climate-advisor |
| SQL | — | Migrations (Sequelize .cjs, Alembic), seed data |
| YAML | — | K8s manifests, CI workflows, LLM config |
| HTML/CSS/JS | — | api-demo static SPA |

## Frameworks

| Framework | Version | Package | Purpose |
|-----------|---------|---------|---------|
| Next.js | 15.x | app | App Router, API routes, SSR |
| React | 18.x | app | UI rendering |
| Chakra UI | 3.8.x | app | Component library + theming |
| FastAPI | 0.136.x | global-api, hiap, hiap-meed, climate-advisor | REST API framework |
| Sequelize | 6.x | app | PostgreSQL ORM |
| SQLAlchemy | 2.0.x | global-api, climate-advisor | PostgreSQL ORM |
| NextAuth | 4.x | app | Authentication (credentials + JWT) |
| Redux Toolkit | 2.x | app | Client state + RTK Query |
| i18next | 26.x | app | Internationalization (5 locales) |
| LangChain / LangGraph | — | hiap | Plan creation agents |
| openai-agents | — | climate-advisor | Conversational agent framework |
| XGBoost | — | hiap | Action ranking ML model |
| ChromaDB | — | hiap | Vector store for RAG |
| pgvector | — | climate-advisor | Embedding storage and search |

## Infrastructure

| Service | Purpose |
|---------|---------|
| AWS EKS | Kubernetes cluster hosting all services |
| AWS S3 | File uploads, HIAP artifacts, legal assessment CSVs |
| GitHub Container Registry | Docker image registry (`ghcr.io/open-earth-foundation/`) |
| PostgreSQL | Primary database (3 instances across services) |
| PostGIS | Spatial extensions in global-api |
| Nginx Ingress | External traffic routing (`k8s/cc-ingress.yml`) |
| Highlight.io | Frontend error monitoring (optional) |
| PostHog | Product analytics (optional) |
| MLflow | Experiment tracking (climate-advisor, hiap-meed) |
| LangSmith | LLM tracing (hiap) |

## Build Tools

| Tool | Version | Package | Purpose |
|------|---------|---------|---------|
| npm | — | app, load-test | Dependency management, scripts |
| uv | — | hiap, hiap-meed, climate-advisor | Python package management |
| pip | — | global-api | Python dependency installation |
| sequelize-cli | — | app | DB migrations and seeders |
| Alembic | 1.18.x | global-api | DB migrations |
| Turbopack | — | app | Dev server bundler (`next dev --turbopack`) |
| Docker | — | All services | Containerization |
| GitHub Actions | — | `.github/workflows/` | CI/CD pipelines |

## Testing Tools

| Tool | Version | Package | Purpose |
|------|---------|---------|---------|
| Jest | — | app | Unit and API tests (`*.jest.ts`) |
| ts-jest | — | app | TypeScript support for Jest |
| Playwright | — | app | E2E browser tests (`*.spec.ts`) |
| pytest | 9.0.x | Python services | Unit, integration, e2e tests |
| pytest-cov | 7.1.x | global-api, climate-advisor | Coverage reporting |
| k6 | — | load-test | Load/performance testing |
| Spectral | — | app | OpenAPI spec linting |
| Codecov | — | CI | Coverage tracking (app, global-api, climate-advisor) |

## Code Quality Tools

| Tool | Package | Purpose |
|------|---------|---------|
| ESLint | app | Linting (Next.js core-web-vitals + i18next) |
| Prettier | app | Code formatting (semicolons enforced) |
| Black | global-api | Python formatting |
| flake8 | global-api | Python linting |
| mypy | global-api | Python type checking |

## Key Libraries (app — selected)

| Library | Purpose |
|---------|---------|
| Zod | Request validation |
| bcrypt | Password hashing |
| jsonwebtoken | JWT creation/verification |
| @aws-sdk/client-s3 | S3 file operations |
| @modelcontextprotocol/sdk | MCP server |
| @nivo/bar, @nivo/line | Data visualization charts |
| @react-pdf/renderer | PDF generation |
| @react-email/components | Email templates |
| decimal.js | Precise emissions calculations |
| exceljs | Excel import/export (eCRF) |
| pino | Structured logging |
| fuse.js | Client-side fuzzy search |

## Key Libraries (Python — selected)

| Library | Service | Purpose |
|---------|---------|---------|
| geopandas / shapely | global-api | GIS spatial operations |
| osmnx | global-api | OpenStreetMap data |
| pandas | global-api, hiap-meed | Data processing |
| httpx | All Python services | HTTP client |
| openclimate | global-api | OpenClimate data integration |
| sse-starlette | climate-advisor | Server-Sent Events streaming |
| slowapi | hiap | Rate limiting |
