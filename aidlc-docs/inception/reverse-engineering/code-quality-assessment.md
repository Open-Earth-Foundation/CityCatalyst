# Code Quality Assessment

## Test Coverage

| Package | Overall | Unit Tests | Integration Tests | E2E Tests |
|---------|---------|------------|-------------------|-----------|
| **app** | Good (Codecov tracked) | Jest `*.jest.ts` in `app/tests/` | API tests via Jest with mocked auth | Playwright `*.spec.ts` in `app/e2e/` |
| **global-api** | Fair (Codecov tracked) | pytest in `global-api/tests/` | API endpoint tests | None observed |
| **hiap** | Fair | pytest with `unit` marker | pytest with `integration` marker | None; `external` marker for live API |
| **hiap-meed** | Fair | pytest unit tests | pytest integration (mock API) | E2E with mock API data |
| **climate-advisor** | Good (Codecov tracked) | pytest unit | pytest integration | pytest e2e; `manual_llm` for live LLM |

### app Coverage Configuration

- **Tool:** Jest with v8 coverage provider (`app/jest.config.ts`)
- **Thresholds:** 40% statements, 20% branches (minimum enforced)
- **Regression check:** `npm run test:coverage:check` via `scripts/check-coverage-regression.js`
- **CI:** Codecov upload in `web-develop.yml` and `web-test.yml`
- **Badge:** codecov.io tracked on `develop` branch

### Python Coverage

- **global-api:** `pytest --cov=global_api` in CI workflow
- **climate-advisor:** Coverage config in `climate-advisor/service/pytest.ini`; Codecov in develop/test/tag workflows
- **hiap / hiap-meed:** pytest without explicit coverage thresholds in CI; `external` tests excluded from CI

## Code Quality Indicators

| Indicator | Status | Evidence |
|-----------|--------|----------|
| **Linting (app)** | Configured | ESLint (Next.js core-web-vitals + i18next plugin) |
| **Linting (global-api)** | Configured | flake8 + mypy in CI |
| **Formatting (app)** | Configured | Prettier (semicolons enforced) |
| **Formatting (Python)** | Configured | Black (global-api); pyproject.toml configs (hiap, CA) |
| **OpenAPI lint** | Configured | Spectral (`app/.spectral.yaml`, `npm run openapi:lint`) |
| **Code style** | Consistent | AGENTS.md per package; enforced conventions |
| **Documentation** | Good | README per service, AGENTS.md, OpenAPI spec, wiki |
| **Agent docs** | Good | `AGENTS.md` in app, hiap, climate-advisor, hiap-meed |
| **Architecture docs** | Fair | `docs/plan.md`, `.cursor/rules/project-architecture.mdc` |
| **i18n enforcement** | Configured | ESLint i18next rule; CI auto-translation workflow |

## CI/CD Quality Gates

| Workflow | Quality Checks |
|----------|---------------|
| `web-develop.yml` | Jest + Playwright + build + Codecov |
| `global-api-develop.yml` | flake8 + pytest-cov + Codecov |
| `hiap-develop.yml` | pytest (excludes `external`) |
| `hiap-meed-develop.yml` | pytest |
| `climate-advisor-develop.yml` | pytest + Codecov |
| `cc-ca-auth-contract.yml` | Contract test for CA↔CC auth |
| `sdk-generator.yml` | OpenAPI spec generation from app |
| `web-translate.yml` | Auto i18n translation validation |

**PR requirements (from README):** Tests (Jest, Playwright, pytest), linting, and OpenAPI lint must pass.

## Technical Debt

| Issue | Location | Severity |
|-------|----------|----------|
| global-api v0/v1 API coexistence | `global-api/routes/` | Medium — dual versioning increases consumer confusion |
| Deprecated routes not removed | `global-api/routes/deprecated/` | Low — not mounted but still in repo |
| hiap plan-creator-legacy | `hiap/app/plan_creator_bundle/plan_creator_legacy/` | Medium — legacy API still mounted |
| MCP risk assessment stub | `app/src/lib/mcp/tools/risk-assessment.ts` | Low — tool registered but not implemented |
| Typo in service name | `app/src/backend/ManualnputValidationService.ts` | Low — missing "I" in "Input" |
| hiap-meed not integrated | Entire package | Medium — deployed but unused by app |
| CCRA dual backend | `CC_CCRA_REPLIT_URL` + global-api | Medium — unclear canonical source |
| Limited cross-service integration tests | Monorepo-wide | Medium — services tested in isolation |
| `AssistantThread`/`AssistantMessage` models | `app/src/models/` | Low — may be legacy from pre-CA integration |
| No root docker-compose | Monorepo | Low — each service has own setup |

## Patterns and Anti-patterns

### Good Patterns

| Pattern | Location | Benefit |
|---------|----------|---------|
| Centralized `apiHandler` | `app/src/util/api.ts` | Consistent auth, errors, rate limiting |
| Service layer separation | `app/src/backend/` | Testable business logic |
| Zod validation at boundary | `app/src/util/validation.ts` | Type-safe request validation |
| Feature flags | `app/src/util/feature-flags.ts` | Safe feature rollout |
| AGENTS.md per package | Multiple packages | AI agent onboarding |
| Provider pattern (file upload) | `FileUploadService.ts` | Pluggable storage |
| Contract test CA↔CC | `cc-ca-auth-contract.yml` | Cross-service auth validation |
| OpenAPI-first with Spectral lint | `app/public/openapi-spec.json` | API contract enforcement |
| Per-service CI/CD | `.github/workflows/` | Independent deploy cycles |
| Prompt files as markdown | `hiap-meed/`, `climate-advisor/prompts/` | Version-controlled LLM prompts |

### Anti-patterns / Risks

| Anti-pattern | Location | Risk |
|--------------|----------|------|
| Large RTK Query file (~2000 lines) | `app/src/services/api.ts` | Maintainability; hard to navigate |
| In-memory rate limiter | `app/src/util/rate-limiter.ts` | Not distributed-safe across replicas |
| Mixed API versions (v0/v1) | global-api | Consumer confusion, breaking change risk |
| Synchronous HTTP only | All inter-service calls | No resilience to downstream failures |
| No circuit breaker pattern | Inter-service HTTP clients | Cascading failures possible |
| Experimental service deployed | hiap-meed | Resource cost without production use |

## Understanding Gaps (Quality)

| Gap | Impact | Recommendation for Future Work |
|-----|--------|-------------------------------|
| Cross-service integration tests | Medium | Add contract tests beyond CA auth |
| Distributed rate limiting | Low-Medium | Redis-based limiter for multi-replica |
| hiap-meed integration decision | Medium | Document roadmap; integrate or decommission |
| MCP risk tool completion | Low | Implement or remove stub |
| global-api v1 migration plan | Medium | Document deprecation timeline for v0 |
