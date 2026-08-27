# Technology Stack

## Programming Languages

- TypeScript / TSX — Next.js web app, Core API routes, services, models, and tests.
- Python — FastAPI services, agent orchestration, clients, persistence, and tests.
- JavaScript / CommonJS — Sequelize migrations and supporting scripts.
- SQL / PostgreSQL — Core and Climate Advisor persistence, migrations, and query paths.
- YAML / shell — Kubernetes, CI, Docker support, and operational scripts.

## Frameworks

- Next.js `^16.3.0` and React `^19.2.8` — CityCatalyst web/API runtime.
- FastAPI `0.135.3` — Climate Advisor; other FastAPI services use independently managed ranges.
- OpenAI Agents SDK `0.17.3` — Climate Advisor agent/tool runtime.
- Sequelize `^6.37.7` — Core ORM and model layer.
- SQLAlchemy `2.0.45` / Alembic `1.18.4` — Climate Advisor persistence and migrations.
- Pydantic `2.12.5` — Climate Advisor validation/contracts.

## Infrastructure

- PostgreSQL — Core product database and Climate Advisor workflow/conversation database.
- AWS S3 — Module-owned object storage in existing product architecture; access is kept behind owning/Core boundaries for the CC-737 design.
- AWS EKS / Kubernetes — Container deployment target.
- Docker — Service image packaging.
- GitHub Actions — CI/CD and contract/reconciliation workflows.
- OpenRouter or OpenAI-compatible endpoint — Configured chat model provider.

## Build Tools

- npm, TypeScript compiler, ESLint, Prettier, Sequelize CLI, tsx.
- uv, Python packaging, pytest, coverage.
- Docker, kubectl/Kubernetes manifests, GitHub Actions.

## Testing Tools

- Jest 30 — Core unit/API tests.
- Playwright 1.61 — Core end-to-end tests.
- pytest 9 with pytest-asyncio and pytest-cov — Python service tests.
- Spectral — OpenAPI linting.
- k6 — Load testing package.

## CC-737-relevant runtime properties

- Core internal CA routes require both service identity and a user-scoped request session.
- Climate Advisor uses async HTTP calls and refreshes expired user tokens once on a 401.
- Existing tools return JSON strings/envelopes and close short-lived CC client resources.
- No approved architecture permits Climate Advisor to receive S3 credentials, object keys as access grants, or raw storage access.
