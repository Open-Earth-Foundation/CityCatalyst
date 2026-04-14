# AGENTS.md — CityCatalyst

> Comprehensive reference for AI coding agents working on the CityCatalyst web application.
> This file covers architecture, patterns, conventions, and the full codebase map.

---

## Commands

```bash
# Development
npm run dev                     # Next.js dev server (http://localhost:3000)
npm run build                   # Production build

# Quality
npm run lint                    # ESLint (Next.js core-web-vitals + i18next)
npm run prettier                # Prettier --write (semi: true)
npm run openapi:lint            # Spectral lint for OpenAPI spec

# Testing
npm run jest                    # All Jest tests (unit + API)
npm run e2e:test                # All Playwright E2E tests
npx jest --testPathPattern=path/to/file.jest.ts   # Single Jest test
npx playwright test tests/path/to/file.spec.ts    # Single Playwright test

# Database (PostgreSQL via Sequelize CLI)
npm run db:migrate              # Run pending migrations
npm run db:migrate:undo         # Undo last migration
npm run db:gen-migration -- --name <name>  # Generate timestamped migration
npm run db:seed                 # Run all seeders
npm run sync-catalogue          # Sync GPC catalogue from Global API

# i18n
npm run i18n:update             # Auto-translate EN keys to de, es, pt
```

---

## Architecture

```
app/src/
├── app/                        # Next.js 15 App Router
│   ├── [lng]/                  # Locale-prefixed pages (en, de, es, fr, pt)
│   │   ├── auth/               # Login, signup, password reset, invite acceptance
│   │   ├── admin/              # OEF admin panel
│   │   ├── cities/[cityId]/    # City pages: GHGI inventory, dashboard, settings
│   │   ├── onboarding/         # City/org onboarding flows
│   │   ├── organization/       # Org management, projects, billing
│   │   └── public/             # Public dashboards (unauthenticated)
│   ├── api/v1/                 # REST API (all routes use apiHandler wrapper)
│   └── docs/                   # Swagger UI (auto-generated OpenAPI)
│
├── backend/                    # Server-side business logic (services)
│   ├── permissions/            # Permission system (PermissionService, RoleChecker)
│   ├── hiap/                   # HIAP prioritization orchestration
│   ├── ccra/                   # Climate risk assessment services
│   └── llm/                    # LLM abstraction (OpenAI adapter, config)
│
├── components/                 # React components (Chakra UI v3)
│   ├── ui/                     # Design system primitives (button, dialog, field, data-table)
│   ├── Navigation/             # Navbar, sidebar, breadcrumbs
│   ├── Tabs/                   # Tab views (Activity, SubSector)
│   ├── Modals/                 # Dialogs (activity-modal, invite, delete)
│   ├── Sections/               # Page sections
│   ├── Skeletons/              # Loading states
│   ├── steps/                  # Multi-step wizards (GHGI, JourneyNavigator)
│   ├── shared/                 # Cross-feature shared components
│   ├── ChatBot/                # AI chat interface
│   ├── PublicDashboard/        # Public-facing dashboards
│   └── admin/                  # Admin-specific components
│
├── features/                   # Redux slices
│   └── city/                   # citySlice, openClimateCitySlice, inventoryDataSlice
│
├── hooks/                      # Custom React hooks (see list below)
├── i18n/                       # i18next config + locales/{en,de,es,fr,pt}/*.json
│
├── lib/                        # Core infrastructure
│   ├── auth.ts                 # NextAuth config (credentials, JWT, AppSession)
│   ├── auth/                   # PAT validator
│   ├── theme/                  # Chakra v3 theme system (recipes, custom-colors)
│   ├── custom-errors/          # ManualInputValidationError, CustomOrganizationError, CustomInviteError
│   ├── emails/                 # React Email templates (registration, invites, HIAP, etc.)
│   ├── mcp/                    # MCP server + tools (cities, emissions, action-plans, risk-assessment)
│   └── highlight.ts            # Highlight.io integration
│
├── models/                     # Sequelize v6 models (PostgreSQL)
│   ├── init-models.ts          # Model registration + associations
│   ├── index.ts                # DB connection (DATABASE_* env vars)
│   └── *.ts                    # Individual model files
│
├── services/                   # Client-side services
│   ├── api.ts                  # RTK Query API (createApi, ~2000 lines, main data layer)
│   ├── logger.ts               # Pino logger
│   ├── chatService.ts          # Chat SSE service
│   └── PDFExportService.ts     # PDF generation
│
└── util/                       # Shared utilities
    ├── api.ts                  # apiHandler, errorHandler, auth resolution, rate limiter
    ├── types.ts                # Central TypeScript types/interfaces for API contracts
    ├── validation.ts           # Zod schemas for request validation
    ├── enums.ts                # InventoryTypeEnum, GlobalWarmingPotentialTypeEnum, ImportStatusEnum
    ├── constants.ts            # Sector definitions, GPC config
    ├── feature-flags.ts        # FeatureFlags enum + hasFeatureFlag/hasServerFeatureFlag
    ├── helpers.ts              # General helpers
    ├── routes.ts               # Route path utilities
    ├── translate.ts            # Translation helpers
    ├── geojson.ts              # GeoJSON utilities
    ├── csv.ts                  # CSV export helpers
    ├── rate-limiter.ts         # In-memory rate limiter (200 req/min)
    ├── permission-errors.ts    # Permission error utilities
    ├── check-user-session.ts   # Session check helpers
    ├── big_int.ts              # BigInt utilities
    ├── ccra-constants.ts       # CCRA scoring constants
    ├── form-schema/            # Activity form schema definitions
    └── GHGI/                   # GPC reference resolver + data tables
```

---

## Key Backend Services (`src/backend/`)

| Service | Responsibility |
|---------|---------------|
| `UserService` | User CRUD, invites, org/project scoping |
| `InventoryService` | Inventory lookups by city, locode, permissions |
| `ActivityService` | Activity/gas value CRUD, emissions factors, versioning |
| `CalculationService` | Emissions math using methodology-specific formulas |
| `DataSourceService` | Data source management per inventory |
| `GPCService` | Resolves GPC reference numbers to sector/subsector/subcategory |
| `PermissionService` | `canAccessInventory`, `canCreateCity`, role-based checks |
| `EmailService` | All email flows (invites, password, projects) via React Email |
| `NotificationService` | Nodemailer singleton, admin notifications |
| `AdminService` | Bulk inventory creation, OpenClimate wiring |
| `ResultsService` | Emissions results aggregation, forecasts |
| `PopulationService` | Population data for city/year |
| `HiapService` | HIAP orchestration (S3, rankings, bulk jobs) |
| `HiapApiService` | HTTP client to external HIAP API |
| `ActionPlanService` | Action plan creation and management |
| `CcraService` | Climate risk normalization and scoring |
| `CcraApiService` | CCRA API client (Global API) |
| `ECRFDownloadService` | eCRF Excel template export |
| `ECRFImportService` | eCRF import parsing |
| `FileParserService` | XLSX/CSV parsing |
| `FileUploadService` | Generic file upload (S3 provider) |
| `FileValidatorService` | Import validation (size, format, CIRIS) |
| `AIInterpretationService` | LLM column mapping for tabular imports |
| `InventoryExtractionService` | LLM extraction from PDF documents |
| `CDPService` | CDP Green Star API client |
| `CityBoundaryService` | City GeoJSON from Global API |
| `UnitConversionService` | Unit conversion tables |
| `VersionHistoryService` | Inventory version diff/history |
| `ModuleService` | Module access management |
| `ModuleDashboardService` | Dashboard aggregation (GHGI/HIAP/CCRA) |

---

## Custom Hooks (`src/hooks/`)

| Hook | Purpose |
|------|---------|
| `useLogin` | Wraps NextAuth `signIn("credentials")`, analytics, redirect |
| `useUserPermissions` | Check user permissions for resources |
| `useAdminGuard` | Redirect non-admin users |
| `useModuleAccess` | Check if current project has a module enabled |
| `useModuleAccessLayout` | Module access for layout gating |
| `useRouteParams` | Extract typed route params |
| `use-latest-inventory` | Get the latest inventory for a city |
| `use-inventory-organization` | Get org context for an inventory |
| `use-organizational-context` | Org context provider (Context + localStorage) |
| `useChat` | Chat with AI assistant |
| `useSSEStream` | Server-Sent Events streaming |
| `useFuzzySearch` | Client-side fuzzy search |
| `usePollUntil` | Polling with stop condition |
| `useScrollSpy` | Scroll position tracking |
| `useEnterSubmit` | Submit form on Enter |
| `use-copy-to-clipboard` | Clipboard copy helper |
| `use-action-plan` | Action plan management |
| `use-activity-form` | Complex activity value form (react-hook-form wrapper) |
| `use-activity-validation` | Activity data validation |
| `use-emission-factors` | Emission factor fetching for forms |
| `Toasts` | Toast notification helpers |

---

## API Route Pattern (Critical)

Every API route MUST use `apiHandler` from `@/util/api`. It provides:
- **Auth resolution** (NextAuth session → Bearer JWT → PAT → OAuth → service-to-service)
- **DB initialization** (`db.initialize()` on first request)
- **Organization frozen check** (blocks mutations on frozen orgs)
- **Rate limiting** (200 req/min per IP, disabled during Playwright)
- **Centralized error handling** via `errorHandler`
- **Request logging** (method, path, status, user, duration)

### Handler Signature

```typescript
export const GET = apiHandler(async (req, { session, params, searchParams }) => {
  // session: AppSession | null (already resolved from any auth method)
  // params: Record<string, string> (route params, already awaited)
  // searchParams: Record<string, string> (query string)
  if (!session) throw new createHttpError.Unauthorized("Unauthorized");
  return NextResponse.json({ data: result });
});
```

### Error Handling Hierarchy

| Error Type | HTTP Status | Behavior |
|-----------|-------------|----------|
| `createHttpError.*` (http-errors) | Varies (400, 401, 403, 404, 500) | Returns `{ error: { message, code?, data? } }` |
| `ZodError` | 400 | Returns `{ error: { message, issues } }` |
| `ManualInputValidationError` | 400 | Returns `{ error: { type, message, issues } }` |
| `CustomOrganizationError` / `CustomInviteError` | 409 | Returns `err.data` |
| `SyntaxError` (bad JSON) | 400 | Returns `{ error: { message } }` |
| `SequelizeUniqueConstraintError` | 400 | Returns "Entity exists already." |
| `OpenAI.APIError` | Forwarded | Forwards OpenAI error shape |
| Any other error | 500 | Returns "Internal server error" (logged) |

### Swagger JSDoc

Add `@swagger` comments above imports for OpenAPI generation:

```typescript
/**
 * @swagger
 * /api/v1/my-resource:
 *   get:
 *     operationId: getMyResource
 *     summary: Description
 *     tags:
 *       - my-resource
 *     responses:
 *       200:
 *         description: Success
 */
```

---

## RTK Query (`src/services/api.ts`)

Main client-side data layer. Uses `fetchBaseQuery` with `baseUrl: "/api/v1/"` and `credentials: "include"`.

### Existing Tag Types

```
UserInfo, UserPermissions, InventoryProgress, UserInventories, SubSectorValue,
InventoryValue, ActivityValue, UserData, FileData, CityData, ReportResults,
YearlyReportResults, SectorBreakdown, Inventory, CitiesAndInventories, Inventories,
Invites, Organizations, OrganizationInvite, Projects, Organization, Project,
ProjectUsers, UserAccessStatus, Cities, Hiap, HiapJobs, Themes, Client,
CityDashboard, Modules, GHGIDashboard, HiapDashboard, Authz, CCRADashboard,
ProjectModules, ActionPlan, VersionHistory, PersonalAccessToken, AdminModules
```

### Pattern for Adding Endpoints

```typescript
// Query
getMyResource: builder.query<ResponseType, string>({
  query: (id) => `my-resource/${id}`,
  transformResponse: (response: { data: ResponseType }) => response.data,
  providesTags: (_r, _e, id) => [{ type: "MyResource", id }],
}),

// Mutation
createMyResource: builder.mutation<ResponseType, RequestBody>({
  query: (body) => ({ url: "my-resource", method: "POST", body }),
  invalidatesTags: ["MyResource"],
}),
```

Most API responses wrap data in `{ data: ... }` — use `transformResponse` to unwrap.

---

## Database (Sequelize v6 + PostgreSQL)

### Core Models

**Tenancy**: `Organization` → `Project` → `City` → `Inventory`
**Users**: `User`, `CityUser`, `CityInvite`, `OrganizationAdmin`, `ProjectAdmin`, `OrganizationInvite`, `ProjectInvite`
**GPC Hierarchy**: `Sector` → `SubSector` → `SubCategory` → `Scope`, `ReportingLevel`
**Emissions Data**: `InventoryValue`, `ActivityValue`, `GasValue`, `ActivityData`, `EmissionsFactor`, `FormulaInput`
**Data Sources**: `DataSource` (DataSourceI18n), `DataSourceActivityData`, `DataSourceEmissionsFactor`, `DataSourceGHGs`, `DataSourceMethodology`, `DataSourceReportingLevel`, `DataSourceFormulaInput`
**Catalogue**: `Catalogue`, `Methodology`, `GHGs`, `GasToCO2Eq`
**Planning**: `ActionPlan`, `HighImpactActionRanking`, `HighImpactActionRanked`, `UnrankedActionSelection`
**Product**: `Module`, `ProjectModules`, `Version`, `ImportedInventoryFile`, `UserFile`, `Theme`
**OAuth**: `OAuthClient`, `OAuthClientI18N`, `OAuthClientAuthz`, `PersonalAccessToken`

### Conventions

- Primary keys: UUIDs with `DataTypes.UUIDV4` default
- Timestamps: `created` / `lastUpdated` (not `createdAt` / `updatedAt`)
- Migrations: `.cjs` files, always implement both `up()` and `down()`
- Registration: Every model must be registered in `init-models.ts`

---

## i18n (i18next)

- Client hook: `useTranslation` from `@/i18n/client` (not raw `react-i18next`)
- Always pass `lng` from the `[lng]` route param
- Namespaces map to JSON files: `src/i18n/locales/en/<namespace>.json`
- Only add keys to the **English** file — CI auto-translates to de, es, fr, pt
- All user-facing strings must use `t()` (ESLint `i18next` rule enforced)
- Key format: kebab-case (`"inventory-not-found"`, `"save-changes"`)

---

## Authentication

- **NextAuth v4** with Credentials provider (email + bcrypt)
- **JWT** session strategy — `AppSession` extends user with `id` and `role`
- **Roles**: `Roles.Admin` (OEF admin), `Roles.User` (regular)
- **Server-side**: `Auth.getServerSession()` or use `session` from `apiHandler`
- **Client-side**: `SessionProvider` in providers, `useSession()` hook
- **Middleware** (`src/middleware.ts`): CORS for API, i18n redirects, `withAuth` for protected pages

---

## Feature Flags (`src/util/feature-flags.ts`)

```
ENTERPRISE_MODE, PROJECT_OVERVIEW_ENABLED, ACCOUNT_SETTINGS_ENABLED,
UPLOAD_OWN_DATA_ENABLED, JN_ENABLED, OAUTH_ENABLED, ANALYTICS_ENABLED,
CCRA_MODULE, CA_SERVICE_INTEGRATION, HIGHLIGHT_ENABLED
```

- Parsed from `NEXT_PUBLIC_FEATURE_FLAGS` env (comma-separated)
- QA override via `localStorage` key `qa_feature_flags`
- Use `hasFeatureFlag(flag)` on client, `hasServerFeatureFlag(flag)` on server

---

## Testing

### Jest (API + Unit)

- File naming: `*.jest.ts` (NOT `*.test.ts`)
- Location: `app/tests/`
- Config: `jest.config.ts` (ESM via `ts-jest`, `@/` paths via `moduleNameMapper`)
- Helpers (`tests/helpers.ts`):
  - `setupTests()` — loads env, mocks `Auth.getServerSession` with test user
  - `teardownTests()` — restores mock
  - `mockRequest(body?, searchParams?, headers?)` — creates `NextRequest`
  - `mockRequestFormData(formData)` — for file uploads
  - `expectStatusCode(response, code)` — assertion with helpful error messages
  - `testUserID`, `testCityID`, `testUserData` — fixtures

### Playwright (E2E)

- File naming: `*.spec.ts`
- Config: `playwright.config.ts`
- Runs against a real dev/test server

---

## Code Style

- **Semicolons**: Yes (Prettier enforced)
- **Imports**: ES modules (`import ... from ...`)
- **Exports**: Prefer named exports over default
- **Types**: TypeScript types/interfaces for all function signatures and props
- **Naming**: PascalCase (components/classes), camelCase (variables/functions)
- **Files**: kebab-case for utilities and component files, PascalCase for feature folders
- **Path alias**: Always use `@/` (maps to `src/`)
- **Import order**: external → internal (`@/`) → relative (`./`)
- **Functions**: Small, focused, explicit return types preferred
- **Errors**: Use `http-errors` on server, meaningful messages always
- **Logging**: `import { logger } from "@/services/logger"` (Pino)
- **Styling**: Chakra v3 semantic tokens (never raw colors)
- **Strings**: All user-facing text via `t()` from i18next

---

## Domain Glossary

| Term | Meaning |
|------|---------|
| GPC | Global Protocol for Community-Scale Greenhouse Gas Emissions |
| GHGI | Greenhouse Gas Inventory — a city's emissions profile |
| Inventory | A specific city's emissions data for a given year |
| Sector | Top-level GPC category (Stationary Energy, Transportation, Waste, IPPU, AFOLU) |
| SubSector | Second-level GPC category within a sector |
| SubCategory | Third-level GPC category (most granular) |
| Scope | Emissions scope (1: direct, 2: indirect energy, 3: other indirect) |
| ActivityValue | An individual emissions data entry (e.g., fuel consumption) |
| GasValue | Gas-specific emissions for an activity (CO2, CH4, N2O, etc.) |
| InventoryValue | Aggregated emissions per sub-category |
| EmissionsFactor | Factor to convert activity data to emissions |
| DataSource | External data provider for emissions factors/activity data |
| HIAP | High Impact Action Prioritization — ranking climate actions |
| CCRA | Climate Change Risk Assessment |
| Locode | UN/LOCODE city identifier (e.g., "BR RIO") |
| eCRF | Electronic Common Reporting Framework (GPC Excel format) |
| AR5/AR6 | IPCC Assessment Report versions for Global Warming Potential values |
| GWP | Global Warming Potential — converts gases to CO2 equivalent |

---

## Sibling Services (same monorepo, different stacks)

| Service | Path | Stack | Purpose |
|---------|------|-------|---------|
| global-api | `global-api/` | Python FastAPI + SQLAlchemy + Alembic | Data services, GIS |
| climate-advisor | `climate-advisor/` | Python FastAPI + LangChain + pgvector | RAG chat agent |
| hiap | `hiap/` | Python FastAPI + XGBoost + ChromaDB | Action prioritization ML |
| hiap-meed | `hiap-meed/` | Python FastAPI | MEED scoring pipeline |
| api-demo | `api-demo/` | Static HTML + nginx | OAuth demo SPA |

---

_This file is for agentic coding agents. Follow these rules for consistency and reliability._
