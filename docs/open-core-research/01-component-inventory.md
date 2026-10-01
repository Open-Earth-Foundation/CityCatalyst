# Component inventory

Every significant capability in the monorepo, classified as **CORE** (domain-agnostic infrastructure), **CLIMATE** (the inventory, risk, actions and plans, energy model and advisor content), **GCoM** (specific to GCoM reporting), or **OEF** (specific to OEF's own deployment). Codebase at commit `65731e28`, 1 October 2026. Paths relative to the repository root. The clone is shallow and grafted at 16 June 2026, so creation dates of older files are **UNVERIFIED**.

## 1. Identity, authentication, authorisation

| Capability | Class | Key paths | What exists |
|---|---|---|---|
| Session login | CORE | [app/src/lib/auth.ts](../../app/src/lib/auth.ts) | NextAuth v4 with a credentials provider only (email and bcrypt), JWT sessions. No single sign-on, OpenID Connect, SAML or LDAP. `docs/Components.md` claims LDAP; it does not exist. |
| Multi-factor authentication | CORE | [app/src/lib/2fa.ts](../../app/src/lib/2fa.ts), `app/src/app/api/v1/auth/2fa/*` | Authenticator-app codes with ten hashed recovery codes; added 15 September 2026, recovery codes 21 September, admin view 28 September. The issuer name is hard-coded. |
| Login rate limit | CORE | `app/src/util/rate-limiter.ts` | In memory; merged 18 September 2026. |
| OAuth 2.0 server | CORE, flag-gated | `app/src/app/[lng]/authorize/`, `app/src/app/api/v1/auth/code/route.ts`, [app/src/app/api/v1/token/route.ts](../../app/src/app/api/v1/token/route.ts), `app/src/app/api/v1/oauth/metadata/route.ts` | Authorisation code with PKCE and refresh tokens; discovery per RFC 8414. Scopes are only `read` and `write`. Tokens are JWTs signed with a shared secret, no published keys. No registration, revocation or introspection endpoint. Single-use codes enforced with an in-memory cache. |
| OAuth client registry | CORE | [app/src/models/OAuthClient.ts](../../app/src/models/OAuthClient.ts), `OAuthClientAuthz.ts`, `app/src/app/api/v1/client/*` | Public clients with one redirect URI each. Client creation and deletion check only that a session exists ([client/route.ts:186](../../app/src/app/api/v1/client/route.ts)); no admin-role check found. |
| Personal access tokens | CORE | `app/src/models/PersonalAccessToken.ts`, `app/src/lib/auth/access-token-validator.ts` | Hashed tokens with read and write scopes. No tests found. |
| Unified request authentication | CORE | [app/src/util/api.ts](../../app/src/util/api.ts) | Custom hook, then personal token, then bearer JWT (service token or OAuth token), then cookie session. Also request logging, an in-memory per-address rate limit, and the "frozen organisation" write block. |
| Role-based permissions | CORE, climate-named | [app/src/backend/permissions/](../../app/src/backend/permissions/) | Global roles user and admin; scoped roles organisation admin, project admin, collaborator (via `CityUser`), public reader. Methods are named for inventories and cities. Public read keys on `Inventory.isPublic`. |
| Service-to-service | CORE pattern | `app/src/backend/climate-advisor-token.ts`, `app/src/app/api/v1/internal/ca/*` | The app mints user tokens for the advisor service; the advisor validates by calling back with a service key. |

## 2. Tenancy, entitlements, flags

| Capability | Class | Key paths | What exists |
|---|---|---|---|
| Tenancy hierarchy | CORE, leaf is City | `app/src/models/Organization.ts`, `Project.ts`, [City.ts](../../app/src/models/City.ts), [CityUser.ts](../../app/src/models/CityUser.ts) | Organization, Project, City, Inventory. Organisation has plan type, trial end, theme and logo; Project has a city count limit; City has a unique UN/LOCODE; `CityUser` has no role column. |
| Invites | CORE | `OrganizationInvite.ts`, `ProjectInvite.ts`, `CityInvite.ts` | One invite table per level. |
| Programme entity | **MISSING** | | No Program model; "programme" appears only as funding programmes in the concept-note builder. |
| Module registry | CORE, content OEF | `app/src/models/Module.ts`, `app/seed-data/modules/modules.json`, `app/src/util/constants.ts` | Thirteen seeded rows: five internal, eight external prototype URLs. External modules open in a new tab with no context or token hand-off. Module identifiers are hard-coded in constants. |
| Per-module entitlement | CORE | `app/src/models/ProjectModules.ts`, `app/src/backend/ModuleAccessService.ts` | Per project with expiry. Enforcement is mostly client-side: three API files call the access check; module API trees do not. |
| Feature flags | CORE, per deployment | `app/src/util/feature-flags.ts`, `app/docs/QA_FEATURE_FLAGS.md` | Fourteen flags from an environment variable set per environment by the deploy workflows. |
| Organisation frozen, plan, trial | CORE | `app/src/util/api.ts`, `organizations/[organization]/active-status/route.ts` | Exists. |
| White-label theming | CORE | `app/src/models/Theme.ts`, `organizations/[organization]/branding/route.ts` | Exists; the GCoM design is planned as a token layer on it. |

## 3. Integration surfaces

| Capability | Class | Key paths | What exists |
|---|---|---|---|
| REST API and OpenAPI | CORE | `app/src/app/api/v1/**` (216 route files), `app/scripts/build-swagger-doc.ts` | Annotations in code, spec generated at build. The spec's title describes greenhouse-gas inventories. |
| Generated SDKs | CORE, broken | `.github/workflows/sdk-generator.yml` | TypeScript and Python generated as CI artifacts only; Ruby, Swift and Kotlin disabled; the trigger path `app/src/api/**` does not exist, so the workflow runs only by hand. The tech deep-dive's "five languages on every API change" overstates this. |
| OAuth demo client | CORE, example | `api-demo/` | Static page with a browser OAuth library. |
| Signed outbound webhooks | CORE, events climate-named | [docs/WebhooksArchitecture.md](../WebhooksArchitecture.md), `app/src/models/WebhookSubscription.ts`, `WebhookDelivery.ts`, `app/src/backend/webhooks/`, `k8s/cc-process-webhook-deliveries.yml` | HMAC-SHA256 over timestamp and body in platform-named headers; Postgres outbox; cron worker every five minutes; at-least-once delivery. Three events emitted (`inventory.published`, `plan.generated`, `datasource.connected`), five reserved. Merged 31 August 2026. |
| MCP server | CORE transport, CLIMATE tools | [app/src/lib/mcp/](../../app/src/lib/mcp/), `app/src/app/api/v1/mcp/route.ts`, `app/src/app/api/v1/.well-known/mcp-server/route.ts` | Hand-rolled JSON-RPC over HTTP; six tools, one a stub; protocol version 2024-11-05; no resources or prompts; no tests. The advisor service pins an MCP library but does not import it. |
| Agent capability registries | CORE pattern, CLIMATE content | `app/src/backend/agentic/*/registry.ts`, `app/src/app/api/v1/internal/ca/capabilities/**` | Typed definitions with operation type, resource scope, confirmation and write flags; three parallel definitions with no shared base. |
| Disclosure to CDP | GCoM | `app/src/backend/CDPService.ts` | Machine-to-machine submission exists. |

## 4. Records, versioning, provenance

| Capability | Class | Key paths | What exists |
|---|---|---|---|
| The record is an inventory | CLIMATE used as infrastructure | [app/src/models/Inventory.ts](../../app/src/models/Inventory.ts) | Publish state is a boolean plus timestamp; no draft, review or approved workflow. |
| Change history | CORE mechanism, climate-bound | [app/src/models/Version.ts](../../app/src/models/Version.ts), `app/src/backend/VersionHistoryService.ts` | Row-level diff log with restore, keyed by inventory, covering five GHGI and HIAP tables. |
| Value-level provenance | CLIMATE | `InventoryValue.ts`, `ActivityValue.ts`, `DataSource.ts` | Data source and methodology on each value. |
| Release provenance in the data service | CORE pattern | `global-api/db/provenance.py`, `global-api/engineering-standards/` | Dataset release identifiers on queries. |
| Audit log | **MISSING** as generic | request log in `api.ts`; `RetentionActionLog.ts`; `ConsentRecord.ts` | No general audit-event table. |
| Native input catalogue | CORE | `app/src/models/NativeInputCatalog.ts`, [docs/NativeInputCatalog.md](../NativeInputCatalog.md) | A pointer catalogue of inputs and artifacts with soft-typed kind and owner, availability and supersession. |

## 5. Jobs, files, AI, privacy

| Capability | Class | Key paths | What exists |
|---|---|---|---|
| Worker pattern | CORE | `app/src/app/api/v1/cron/*`, `k8s/cc-process-*.yml`, `cc-enforce-retention.yml` | Postgres outbox with leases and backoff, driven by Kubernetes cron jobs calling the API. No queue broker. |
| PDF OCR pipeline | CORE | `app/src/models/PdfOcrJob.ts`, `app/src/backend/PdfOcrService.ts`, `MistralOcrService.ts` | Durable jobs; external OCR provider. |
| File storage | CORE, model GPC-bound | `app/src/backend/FileUploadService.ts`, `UserFile.ts` | The upload model carries sector, scope and GPC reference fields. |
| Tabular and LLM import mapping | CLIMATE, generic technique | `FileParserService.ts`, `AIInterpretationService.ts`, `ImportMappingService.ts`, `ECRFImportService.ts` | Exists. |
| Bulk operations | CLIMATE and GCoM flavoured | `BulkInventoryImport*.ts`, `admin/bulk/route.ts`, `BulkHiapPrioritizationService.ts` | Bulk eCRF import with dry run (28 September 2026); bulk city creation by LOCODE list; bulk prioritisation. |
| LLM abstraction | CORE, thin | `app/src/backend/llm/` | One provider in the app; the advisor uses a router. |
| Agent runtime | runtime CORE-candidate, content CLIMATE | `climate-advisor/service/app/` | FastAPI with an agents SDK, streaming, threads, vector store. |
| Concept-note builder | CLIMATE, generic document workflow | [docs/ConceptNoteBuilderArchitecture.md](../ConceptNoteBuilderArchitecture.md), `app/src/app/api/v1/concept-notes/**`, advisor `services/cnb/` | Exists; two migration chains in the advisor. |
| GDPR module | CORE | `app/src/backend/gdpr/`, `ConsentRecord.ts`, `RetentionActionLog.ts`, `app/docs/GDPR_DATA_PROTECTION.md` | Consent, subject-access export, retention cron; merged 28 September 2026. Domain-agnostic. |

## 6. User interface platform

| Capability | Class | Notes |
|---|---|---|
| Internationalisation | CORE | Five languages; forty namespaces, about half climate-module; database content localised in three different shapes. |
| Design system | CORE | Chakra v3 primitives under `app/src/components/ui/`. |
| Component package | CORE, half-built | `app/src/components/package/` exports one component; no package manifest; its README says LGPL, which conflicts with the root licence. |
| Charts and maps | CLIMATE | Nivo in four files; pigeon-maps for maps; no generic chart wrapper. |
| Dashboards | pattern CORE, content CLIMATE | `ModuleDashboardService.ts` hard-wires three modules. |

## 7. Spatial capability

| Item | What exists |
|---|---|
| Boundaries | One polygon per city in `modelled.city_polygon`, declared as text in the migration; no PostGIS column type or extension migration; the database image provides PostGIS. |
| Spatial queries | Area in two projections (one valid only for the contiguous United States) and one point-in-polygon lookup in [global-api/routes/legacy/city_boundaries_endpoint.py](../../global-api/routes/legacy/city_boundaries_endpoint.py). |
| Joins | Every live dataset is joined by identifier (LOCODE or actor identifier); the grid crosswalks that joined gridded emissions by area overlap were dropped. |
| Hierarchy | Flat country and region attributes; no parent and child table; no validity dates; no 3D; no graph or ontology tooling. |
| Libraries | Geospatial Python libraries declared but never imported; the app has pigeon-maps and a WKT parser only. |

## 8. Services and deployment

| Service | Stack | Link to the app | Class |
|---|---|---|---|
| `app/` | Next.js 16, Sequelize and Postgres (162 migrations), Redux Toolkit | | CORE and CLIMATE |
| `global-api/` | FastAPI, SQLAlchemy and Alembic (74 revisions) over the warehouse | HTTP reads; catalogue synced weekly into app tables | CORE pattern; content CLIMATE and OEF |
| `climate-advisor/` | FastAPI, agents SDK, pgvector, MLflow | HTTP and streaming; calls back with a service key; own databases | runtime CORE-candidate; content CLIMATE |
| `hiap/`, `hiap-meed/` | FastAPI, XGBoost, ChromaDB, MLflow | HTTP; async jobs polled by cron; no authentication observed (**UNVERIFIED** whether network policies protect them) | CLIMATE |
| Release ladder | `.github/workflows/*-develop.yml`, `*-test.yml`, `*-tag.yml`; `k8s/`, `k8s/test/`, `k8s/prod/` | `develop` to dev, `main` to test on the same cluster, plain version tags to production; manifests copied per environment with `kubectl set env`; no Helm or Kustomize | CORE |

## 9. Licence metadata

| Location | Finding |
|---|---|
| `LICENSE`, `hiap/LICENSE.md` | AGPL-3.0 |
| `app/package.json` | no licence field |
| `hiap`, `hiap-meed`, `climate-advisor` project files | no licence field |
| `climate-advisor/README.md` | refers to a licence file that does not exist |
| `global-api/`, `api-demo/` | no licence file |
| `app/src/components/README.md` | says LGPL |

## 10. GCoM-specific and OEF-instance-specific

**GCoM:** eCRF templates and import and export (`app/templates/`, `ECRFDownloadService.ts`, `ECRFImportService.ts`), CIRIS detection, CDP submission, one partner logo in the public project page. No code names GCoM explicitly; eCRF is the Common Reporting Framework's spreadsheet form (**Inference**).

**OEF instance:** `openearth.dev` hostnames in manifests and service defaults; the support email, default sender and default organisation and project identifiers in constants; the module seed with prototype URLs; analytics providers; the data-service content for Chile, Brazil and Minnesota; the OCR and model providers; "CityCatalyst" hard-coded in webhook headers, the TOTP issuer, the MCP realm and the advisor's token issuer.

## 11. Where climate vocabulary leaks into infrastructure

| Leak | Evidence |
|---|---|
| City is the tenant leaf | `CityUser` without a role; `Project.cityCountLimit`; the permission context carries organisation, project, city and inventory identifiers; `WebhookService.emitForCity`; city-named email templates; `User.defaultCityId` |
| Inventory is the generic record | `Version.inventoryId`; permission methods named for inventories; public read keyed on `Inventory.isPublic`; the input catalogue's scope; the MCP tools; the webhook event `inventory.published` |
| UN/LOCODE as the only identifier | Unique key on City; country derived from the first two characters in `DataSourceService.ts`; 145 files mention locode; the data service's boundary and context routes key on it |
| GPC taxonomy in shared schema | `SECTORS` in constants beside module identifiers and the support email; sector, subsector, scope and gas tables; GPC fields on the generic upload model; the data service's catalogue keyed on GPC reference numbers |
| Emission units in shared helpers | `formatEmissions` and the CO2-equivalent suffix in `util/helpers.ts`; the UI primitives themselves are clean |
| Domain events in the core | A static array of climate-named events, not registered by modules |
| Hard-wired module identifiers | Constants, module visibility, the dashboard service, the version-history model list |
| Branding in core surfaces | "climate data" in the MCP description; "greenhouse gas inventories" in the OpenAPI description |

## 12. Tests

| Service | Test files | Gating |
|---|---|---|
| app | 178 Jest files, 13 Playwright specs | Build, OpenAPI lint, Jest with a coverage-regression gate, Playwright; deploy depends on tests |
| climate-advisor | 93 | Grouped runs before build |
| hiap, hiap-meed | 15 and 25 | Build depends on tests |
| global-api | 13 | Only in the develop workflow, piped without `pipefail`, so a failure may not fail the step (**Inference**) |

Covered core areas: OAuth client, authorisation and discovery; multi-factor authentication; permissions; module access; webhooks; GDPR; OCR; the input catalogue; bulk import. **No tests** for the MCP server or personal access tokens.

## 13. What changed since 24 July 2026

1,316 commits and 193 merged pull requests. Platform-relevant groups: multi-factor authentication and recovery codes (September); login rate limit; signed webhooks (August); the native input catalogue and the advisor capability registries (August to September); about 36 concept-note-builder pull requests; the energy model module; bulk eCRF import; the GDPR module (28 September); runtime environment injection; re-enabled end-to-end tests. No functional change to OAuth, MCP or personal access tokens beyond typing.

`docs/Components.md` (text from 2023) describes an Express API, LDAP login, a workflow engine, a data payment service and a separate harmonisation service, none of which exist, and omits the advisor, the prioritisation services, MCP, webhooks, tokens, modules, the concept-note builder, OCR, GDPR, bulk import, version history, SDK generation and themes.

## 14. Observations worth a ticket

1. OAuth client creation and deletion are not admin-gated.
2. The SDK workflow's trigger path does not exist.
3. OAuth code replay protection and rate limiting are in memory while the deployment runs two replicas.
4. The prioritisation services accept calls without authentication.
5. The data service's test step may not fail the build.
6. Area is computed in two different projections.
7. Per-service licence metadata is missing and one README says LGPL.
