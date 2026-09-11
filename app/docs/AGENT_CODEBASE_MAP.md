# CityCatalyst app codebase map

Navigation reference for [app/AGENTS.md](../AGENTS.md). Read only the sections relevant to the task. These lists are discovery aids, not exhaustive contracts: verify paths, exports, tags, and versions in the current code before relying on them. `../package.json` defines the app dependencies (currently Next.js `^16.3.0`).

## Contents

- [Architecture](#architecture)
- [Backend services](#key-backend-services-srcbackend)
- [Custom hooks](#custom-hooks-srchooks)
- [RTK Query tags](#rtk-query-tag-reference)
- [Database models](#database-model-reference)
- [Domain glossary](#domain-glossary)
- [Sibling services](#sibling-services-same-monorepo-different-stacks)

## Architecture

```
app/src/
├── app/                        # Next.js App Router
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

| Service                      | Responsibility                                                 |
| ---------------------------- | -------------------------------------------------------------- |
| `UserService`                | User CRUD, invites, org/project scoping                        |
| `InventoryService`           | Inventory lookups by city, locode, permissions                 |
| `ActivityService`            | Activity/gas value CRUD, emissions factors, versioning         |
| `CalculationService`         | Emissions math using methodology-specific formulas             |
| `DataSourceService`          | Data source management per inventory                           |
| `GPCService`                 | Resolves GPC reference numbers to sector/subsector/subcategory |
| `PermissionService`          | `canAccessInventory`, `canCreateCity`, role-based checks       |
| `EmailService`               | All email flows (invites, password, projects) via React Email  |
| `NotificationService`        | Nodemailer singleton, admin notifications                      |
| `AdminService`               | Bulk inventory creation, OpenClimate wiring                    |
| `ResultsService`             | Emissions results aggregation, forecasts                       |
| `PopulationService`          | Population data for city/year                                  |
| `HiapService`                | HIAP orchestration (S3, rankings, bulk jobs)                   |
| `HiapApiService`             | HTTP client to external HIAP API                               |
| `ActionPlanService`          | Action plan creation and management                            |
| `CcraService`                | Climate risk normalization and scoring                         |
| `CcraApiService`             | CCRA API client (Global API)                                   |
| `ECRFDownloadService`        | eCRF Excel template export                                     |
| `ECRFImportService`          | eCRF import parsing                                            |
| `FileParserService`          | XLSX/CSV parsing                                               |
| `FileUploadService`          | Generic file upload (S3 provider)                              |
| `FileValidatorService`       | Import validation (size, format, CIRIS)                        |
| `AIInterpretationService`    | LLM column mapping for tabular imports                         |
| `InventoryExtractionService` | LLM extraction from PDF documents                              |
| `CDPService`                 | CDP Green Star API client                                      |
| `CityBoundaryService`        | City GeoJSON from Global API                                   |
| `UnitConversionService`      | Unit conversion tables                                         |
| `VersionHistoryService`      | Inventory version diff/history                                 |
| `ModuleService`              | Module access management                                       |
| `ModuleDashboardService`     | Dashboard aggregation (GHGI/HIAP/CCRA)                         |

---

## Custom Hooks (`src/hooks/`)

| Hook                         | Purpose                                                     |
| ---------------------------- | ----------------------------------------------------------- |
| `useLogin`                   | Wraps NextAuth `signIn("credentials")`, analytics, redirect |
| `useUserPermissions`         | Check user permissions for resources                        |
| `useAdminGuard`              | Redirect non-admin users                                    |
| `useModuleAccess`            | Check if current project has a module enabled               |
| `useModuleAccessLayout`      | Module access for layout gating                             |
| `useRouteParams`             | Extract typed route params                                  |
| `use-latest-inventory`       | Get the latest inventory for a city                         |
| `use-inventory-organization` | Get org context for an inventory                            |
| `use-organizational-context` | Org context provider (Context + localStorage)               |
| `useChat`                    | Chat with AI assistant                                      |
| `useSSEStream`               | Server-Sent Events streaming                                |
| `useFuzzySearch`             | Client-side fuzzy search                                    |
| `usePollUntil`               | Polling with stop condition                                 |
| `useScrollSpy`               | Scroll position tracking                                    |
| `useEnterSubmit`             | Submit form on Enter                                        |
| `use-copy-to-clipboard`      | Clipboard copy helper                                       |
| `use-action-plan`            | Action plan management                                      |
| `use-activity-form`          | Complex activity value form (react-hook-form wrapper)       |
| `use-activity-validation`    | Activity data validation                                    |
| `use-emission-factors`       | Emission factor fetching for forms                          |
| `Toasts`                     | Toast notification helpers                                  |

---


## RTK Query tag reference

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


## Database model reference

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


## Domain Glossary

| Term            | Meaning                                                                        |
| --------------- | ------------------------------------------------------------------------------ |
| GPC             | Global Protocol for Community-Scale Greenhouse Gas Emissions                   |
| GHGI            | Greenhouse Gas Inventory — a city's emissions profile                          |
| Inventory       | A specific city's emissions data for a given year                              |
| Sector          | Top-level GPC category (Stationary Energy, Transportation, Waste, IPPU, AFOLU) |
| SubSector       | Second-level GPC category within a sector                                      |
| SubCategory     | Third-level GPC category (most granular)                                       |
| Scope           | Emissions scope (1: direct, 2: indirect energy, 3: other indirect)             |
| ActivityValue   | An individual emissions data entry (e.g., fuel consumption)                    |
| GasValue        | Gas-specific emissions for an activity (CO2, CH4, N2O, etc.)                   |
| InventoryValue  | Aggregated emissions per sub-category                                          |
| EmissionsFactor | Factor to convert activity data to emissions                                   |
| DataSource      | External data provider for emissions factors/activity data                     |
| HIAP            | High Impact Action Prioritization — ranking climate actions                    |
| CCRA            | Climate Change Risk Assessment                                                 |
| Locode          | UN/LOCODE city identifier (e.g., "BR RIO")                                     |
| eCRF            | Electronic Common Reporting Framework (GPC Excel format)                       |
| AR5/AR6         | IPCC Assessment Report versions for Global Warming Potential values            |
| GWP             | Global Warming Potential — converts gases to CO2 equivalent                    |

---

## Sibling Services (same monorepo, different stacks)

| Service         | Path               | Stack                                 | Purpose                  |
| --------------- | ------------------ | ------------------------------------- | ------------------------ |
| global-api      | `global-api/`      | Python FastAPI + SQLAlchemy + Alembic | Data services, GIS       |
| climate-advisor | `climate-advisor/` | Python FastAPI + LangChain + pgvector | RAG chat agent           |
| hiap            | `hiap/`            | Python FastAPI + XGBoost + ChromaDB   | Action prioritization ML |
| hiap-meed       | `hiap-meed/`       | Python FastAPI                        | MEED scoring pipeline    |
| api-demo        | `api-demo/`        | Static HTML + nginx                   | OAuth demo SPA           |

---
