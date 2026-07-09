# API Documentation

> **Note:** This document samples representative endpoints per domain. The app exposes ~152 route files; global-api has 35 route modules. Full contract: `app/public/openapi-spec.json`.

## app/ REST API (`/api/v1`)

All routes use `apiHandler` from `app/src/util/api.ts`. Auth: session cookie, Bearer JWT, PAT, or OAuth token.

### Authentication and User

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/auth/forgot` | Password reset request |
| POST | `/api/v1/auth/delete` | Account deletion |
| GET | `/api/v1/auth/role` | Current user role |
| GET | `/api/v1/user` | Current user profile |
| GET | `/api/v1/user/permissions` | User permissions |
| GET | `/api/v1/user/inventories` | User's inventories |
| GET | `/api/v1/user/cities` | User's cities |
| GET | `/api/v1/user/tokens` | List personal access tokens |
| POST | `/api/v1/user/tokens` | Create PAT |

### Organizations and Projects

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/api/v1/organizations` | List/create organizations |
| GET/PATCH | `/api/v1/organizations/{organization}` | Organization details |
| GET/POST | `/api/v1/organizations/{organization}/projects` | Projects |
| GET/PATCH | `/api/v1/projects/{project}` | Project details |
| GET/POST | `/api/v1/projects/{project}/modules` | Enabled modules |

### Cities and Inventories

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/api/v1/city/{city}/inventory` | City inventories |
| GET | `/api/v1/city/{city}/dashboard` | City dashboard data |
| GET | `/api/v1/city/{city}/population` | Population data |
| GET | `/api/v1/city/{city}/years` | Available inventory years |
| GET/POST | `/api/v1/inventory/{inventory}/activity-value` | Activity data CRUD |
| GET | `/api/v1/inventory/{inventory}/results` | Emissions results |
| GET | `/api/v1/inventory/{inventory}/progress` | Inventory completion progress |
| GET | `/api/v1/inventory/{inventory}/version-history` | Version diffs |

### GHGI Import/Export

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/city/{city}/inventory/{inventory}/import` | Import file upload |
| POST | `.../import/{importedFileId}/interpret` | LLM column mapping |
| POST | `.../import/{importedFileId}/extract` | LLM PDF extraction |
| POST | `.../import/approve` | Approve imported data |
| GET | `/api/v1/inventory/{inventory}/cdp` | CDP reporting data |

### HIAP

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/inventory/{inventory}/hiap` | Get/create HIAP ranking |
| GET | `/api/v1/inventory/{inventory}/hiap/status` | Job status |
| POST | `/api/v1/city/{city}/hiap/action-plan/generate/{rankingId}` | Generate action plan |
| GET | `/api/v1/city/{city}/modules/hiap/dashboard` | HIAP dashboard |

### Climate Advisor (Proxy)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/chat/threads` | Create chat thread |
| GET | `/api/v1/chat/threads/{threadId}/messages` | List messages |
| POST | `/api/v1/chat/messages` | Send message (SSE) |

### Stationary Energy Drafts (Agentic)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/stationary-energy-drafts/start` | Start draft workflow |
| GET | `/api/v1/stationary-energy-drafts/{draftRunId}` | Draft status |
| POST | `/api/v1/stationary-energy-drafts/{draftRunId}/review` | Review draft |
| POST | `/api/v1/stationary-energy-drafts/resume` | Resume draft |

### Internal CA Capabilities

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/internal/ca/user-token` | Exchange service token for user JWT |
| GET | `/api/v1/internal/ca/capabilities/allowed-capabilities` | List CA capabilities |
| GET | `/api/v1/internal/ca/capabilities/ghgi/inventory/list-accessible` | List user inventories |
| GET | `/api/v1/internal/ca/capabilities/ghgi/inventory/emissions-context` | Emissions context |
| POST | `/api/v1/internal/ca/capabilities/ghgi/stationary-energy/commit-notation-keys` | Commit notation keys |

### OAuth and MCP

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/.well-known/oauth-authorization-server` | OAuth discovery (RFC 8414) |
| GET | `/api/v1/oauth/authorize` | Authorization endpoint |
| POST | `/api/v1/oauth/token` | Token endpoint |
| GET | `/api/v1/.well-known/mcp-server` | MCP server discovery |

### Admin and Cron

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/admin/all-cities` | Admin city list |
| POST | `/api/v1/admin/mark-cities-public` | Mark cities public |
| GET | `/api/v1/cron/check-hiap-jobs` | HIAP job status check (internal) |
| GET | `/api/v1/check/health` | Health check |
| GET | `/api/v1/check/liveness` | Liveness probe |

### Public (Unauthenticated)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/public/city/{cityId}` | Public city profile |
| GET | `/api/v1/public/city/{cityId}/inventories` | Public inventories |
| GET | `/api/v1/public/project/{projectId}/cities` | Public project cities |

---

## global-api REST API

### v0 Endpoints (Catalogue and Legacy)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v0/catalogue` | GPC catalogue |
| GET | `/api/v0/catalogue/i18n` | Localized catalogue |
| GET | `/api/v0/catalogue/last-update` | Last sync timestamp |
| GET | `/api/v0/cityboundary/city/{locode}` | City GeoJSON boundary |
| GET | `/api/v0/city_context/city/{locode}` | City context for HIAP |
| GET | `/api/v0/city_attributes/{locode}` | City attributes |
| GET | `/api/v0/climate_actions` | Climate action catalog |
| GET | `/api/v0/ccra/city/{country}` | CCRA city data |
| GET | `/api/v0/ccra/risk_assessment/city/{actor}/{scenario}` | Risk assessment |
| GET | `/api/v0/emissions_factor/*` | Emission factor lookups |
| GET | `/api/v0/formula_input/*` | Formula input lookups |
| GET | `/api/v0/ghgi/emissions_forecast/{granularity}/{actor_id}/{year}` | Emissions forecast |
| GET | `/api/v0/source/{source}/city/{locode}/{year}/{GPC_refno}` | Citywide emissions |

### v1 Endpoints (Modern APIs)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/population/{actor_id}` | Population data |
| GET | `/api/v1/cities/search` | City search |
| GET | `/api/v1/source/{datasource}/{granularity}/{actor_id}/{year}/{gpc_ref}` | Unified GHGI emissions |
| GET | `/api/v1/projects` | Climate finance projects |
| GET | `/api/v1/climate-finance/opportunities` | Finance opportunities |
| GET | `/api/v1/cities/{locode}/action-policy-scores` | Policy scores |
| GET | `/api/v1/cities/{locode}/action-mitigation-feasibility-scores` | Mitigation feasibility |
| GET | `/api/v1/action-pathways` | Action pathways |
| GET | `/api/v1/action-legal-assessments` | Legal assessments |
| GET | `/api/v1/cities/{actor_id}/climate-risk/adapta` | AdaptaBrasil climate risk |

### Health

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Health check |

---

## hiap/ API

Base URL: `{HIAP_API_URL}`

### Prioritizer (`/prioritizer/v1`)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/prioritizer/v1/start_prioritization` | Start ranking job |
| POST | `/prioritizer/v1/start_prioritization_bulk` | Bulk ranking |
| GET | `/prioritizer/v1/check_prioritization_progress/{task_uuid}` | Poll progress |
| GET | `/prioritizer/v1/get_prioritization/{task_uuid}` | Get results |
| POST | `/prioritizer/v1/create_explanations` | Generate LLM explanations |
| POST | `/prioritizer/v1/translate_explanations` | Translate explanations |

### Plan Creator (`/plan-creator/v1`)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/plan-creator/v1/start_plan_creation` | Start plan generation |
| GET | `/plan-creator/v1/check_progress/{task_uuid}` | Poll progress |
| GET | `/plan-creator/v1/get_plan/{task_uuid}` | Get generated plan |
| POST | `/plan-creator/v1/translate_plan` | Translate plan |

---

## climate-advisor/ API

Base URL: `{CA_BASE_URL}`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Health check |
| POST | `/v1/threads` | Create chat thread |
| GET | `/v1/threads/{id}/messages` | List thread messages |
| POST | `/v1/messages` | Send message (SSE stream) |
| POST | `/v1/stationary-energy-drafts/start` | Start energy draft |
| GET | `/v1/stationary-energy-drafts/status` | Draft status |

---

## hiap-meed/ API (Experimental)

Base URL: hiap-meed service (not wired to app)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Health check |
| POST | `/v1/prioritize` | Synchronous MEED scoring |
| POST | `/v1/prioritize/exclusions/preview` | Preview exclusions |
| POST | `/v1/explanations/translate` | Translate explanations |

---

## Internal APIs (Service-to-Service)

### app ← climate-advisor

- **Auth:** `X-CA-Service-Key` header + user JWT exchange via `/api/v1/internal/ca/user-token`
- **Client:** `climate-advisor/service/app/services/citycatalyst_client.py`

### app ← hiap (indirect)

- hiap calls global-api directly; app calls hiap via `HiapApiService.ts`

---

## Data Models (app — Key Entities)

### Inventory

- **Fields:** `inventoryId` (UUID), `cityId`, `year`, `inventoryType`, `globalWarmingPotentialType`, `isPublic`
- **Relationships:** belongs to City; has many ActivityValue, InventoryValue, HighImpactActionRanking

### ActivityValue

- **Fields:** `activityValueId`, `inventoryValueId`, `activityData` (JSON), `metadata`
- **Relationships:** belongs to InventoryValue; has many GasValue

### HighImpactActionRanking

- **Fields:** `rankingId`, `inventoryId`, `actionType`, `status`, `isBulk`
- **Relationships:** belongs to Inventory; has many HighImpactActionRanked

### Organization / Project / City

- **Tenancy chain:** Organization → Project → City → Inventory
- **Access:** OrganizationAdmin, ProjectAdmin, CityUser join tables

### Validation

- Request validation via Zod schemas in `app/src/util/validation.ts`
- Sequelize model constraints (UUID PKs, NOT NULL, foreign keys)
