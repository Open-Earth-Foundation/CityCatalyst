# Agentic Module Scope Map

This document maps the current user-facing CityCatalyst modules so the agentic
expansion can be scoped from the product surface rather than from isolated API
endpoints.

The current app is a Next.js application under `app/src/app`. Most user actions
already flow through `app/src/services/api.ts` into route handlers under
`app/src/app/api/v1` and service classes under `app/src/backend`. The existing
MCP layer is in `app/src/app/api/v1/mcp/route.ts` and currently exposes a small,
mostly read-only set of tools.

## Current Agentic Surface

Existing MCP tools:

| Tool | Current capability | Module coverage |
| --- | --- | --- |
| `get_user_cities` | List cities accessible to the user, optionally with inventory counts. | City/project context |
| `get_city_profile` | Read city profile, demographics, inventories, collaborators, and metadata. | City context |
| `get_user_inventories` | List accessible GHG inventories with filters and optional emissions/details. | GHGI |
| `get_inventory_emissions` | Read emissions totals and sector/subsector summaries for an inventory. | GHGI results |
| `get_climate_action_plans` | Read ranked HIAP actions for an inventory and action type. | HIAP |
| `get_climate_risk_assessment` | Registered but not implemented. | CCRA |

Current gaps:

- MCP is not generated from the app's route/service capabilities.
- Tool handlers are one-off modules, not module-owned capability adapters.
- Write actions such as creating cities, updating inventory data, generating HIAP,
  selecting actions, publishing inventories, and managing organizations are not
  agent-callable.
- Long-running operations exist, but are not modeled as agent workflows with
  job status, resumability, user confirmation, and audit output.
- Some agent-facing operations already exist indirectly through chat, personal
  access tokens, OAuth metadata, and the Climate Advisor integration, but they
  are not unified under the module capability model.

## User-Facing Module Map

### 1. Authentication, Authorization, and Account Access

Primary surfaces:

- `app/src/app/[lng]/auth/*`
- `app/src/app/[lng]/authorize/page.tsx`
- `app/src/app/api/auth/[...nextauth]/route.ts`
- `app/src/app/api/v1/auth/*`
- `app/src/app/api/v1/oauth/metadata/route.ts`
- `app/src/app/api/v1/token/route.ts`

What users can do today:

- Sign up, log in, verify email, request password reset, update password, and
  delete account.
- Authorize OAuth clients when OAuth is enabled.
- Exchange auth codes/tokens for external access.
- Use session auth or personal access tokens for authenticated API/MCP access.

Backing services and APIs:

- NextAuth route.
- `auth/*`, `oauth/metadata`, `token`, `user/whoami`.
- Permission checks are centralized through `app/src/backend/permissions`.

Agentic scope:

- Read user identity, role, permissions, and access status.
- Create and revoke API tokens only with explicit user confirmation.
- Never let the agent bypass authorization or mint credentials silently.
- Add a confirmation gate for any account/security mutation.

### 2. User Settings and Personal Workspace

Primary surfaces:

- `app/src/app/[lng]/[inventory]/settings/page.tsx`
- `app/src/components/Tabs/MyProfileTab`
- `app/src/components/Tabs/my-inventories-tab`
- `app/src/components/Tabs/my-tokens-tab.tsx`
- `app/src/components/Tabs/my-apps-tab.tsx`
- `app/src/app/[lng]/user/invites/page.tsx`

What users can do today:

- Edit profile fields and preferred language.
- View accessible inventories and switch context.
- Create, view, and delete personal access tokens.
- View and revoke authorized OAuth applications.
- View, accept, reset, and cancel invites depending on role/context.

Backing services and APIs:

- `user`, `user/[userId]`, `user/inventories`, `user/invites`,
  `user/invites/accept`, `user/clients`, `user/clients/[client]`.
- `user/tokens` and `user/tokens/[id]`.

Agentic scope:

- Read profile, permissions, inventory access, token metadata, and app grants.
- Help users create a token through a confirm-before-create workflow.
- Revoke tokens/apps only after explicit confirmation.
- Summarize pending invites and guide acceptance.

### 3. Journey Navigator, City Home, and Module Catalog

Primary surfaces:

- `app/src/app/[lng]/page.tsx`
- `app/src/app/[lng]/cities/page.tsx`
- `app/src/app/[lng]/cities/[cityId]/page.tsx`
- `app/src/components/HomePageJN/HomePage.tsx`
- `app/src/components/HomePageJN/ModuleCard.tsx`
- `app/src/components/ModuleWidgets/*`

What users can do today:

- Land in the appropriate city or inventory context.
- See the city hero, population, organization theme, action cards, and modules.
- Browse modules grouped by journey stage:
  - Assess and Analyze
  - Plan
  - Implement
  - Monitor, Evaluate and Report
- Launch internal modules such as GHGI and HIAP or external module URLs.
- See city dashboard widgets for GHGI, HIAP, and CCRA.

Backing services and APIs:

- `user`, `city/[city]`, `city/[city]/dashboard`, `modules`,
  `projects/[project]/modules`, `city/[city]/modules/[module]/access`.
- Module constants in `app/src/util/constants.ts`.
- Stage config in `app/src/config/stages.tsx`.

Agentic scope:

- Read city context, available modules, module access, dashboard summaries, and
  recommended next steps.
- Route users to the right workflow or call module capabilities directly.
- Expose module metadata as agent-readable capability discovery.

### 4. City Onboarding and City Management

Primary surfaces:

- `app/src/app/[lng]/cities/onboarding/*`
- `app/src/app/[lng]/cities/[cityId]/dashboard/page.tsx`
- `app/src/components/CityDashboard/CityDashboard.tsx`

What users can do today:

- Search/select a city, confirm city metadata, and create a city.
- Attach a new city to a project in enterprise mode.
- Fetch city boundary and area data.
- View dashboard summary across modules.
- Publish city/inventory results publicly when inventory data exists.

Backing services and APIs:

- `city`, `city/[city]`, `city/[city]/boundary`,
  `city/[city]/dashboard`, `bulk-locations`.
- `ProjectService`, `CityBoundaryService`, `PopulationService`.

Agentic scope:

- Search city candidates and explain the selected locode, boundary, country, and
  project context.
- Create a city only after confirmation with normalized metadata.
- Read and summarize city dashboard state.
- Recommend next module/workflow based on missing inventory, missing population,
  or module access.

### 5. GHGI Inventory Onboarding

Primary surfaces:

- `app/src/app/[lng]/cities/[cityId]/GHGI/onboarding/*`
- `app/src/app/[lng]/onboarding/*`

What users can do today:

- Create a GHG inventory for a city.
- Set inventory year, GPC inventory type, global warming potential type, and
  total country emissions.
- Add city, region, and country population data.
- Set the new inventory and city as the user's defaults.
- Start either normal inventory setup or upload/import mode.

Backing services and APIs:

- `city/[city]/inventory`, `city/[city]/population`, `user`.
- `InventoryService`, `PopulationService`, `CountryEmissionsService`.

Agentic scope:

- Prepare an inventory creation plan from user intent.
- Validate year/type/population requirements before mutation.
- Create inventory and population records after user confirmation.
- Recover users from missing inventory/city states.

### 6. GHGI Data Import

Primary surfaces:

- `app/src/app/[lng]/cities/[cityId]/GHGI/onboarding/import/page.tsx`
- `app/src/components/steps/GHGI/import/*`

What users can do today:

- Upload an inventory file.
- Validate file content and status.
- Trigger AI extraction for PDF/unstructured documents.
- Trigger AI interpretation for tabular files.
- Review detected mappings and override column mappings.
- Approve import into inventory values.
- Poll asynchronous status through upload, extraction, interpretation, approval,
  completion, and failure.

Backing services and APIs:

- `city/[city]/inventory/[inventory]/import`
- `city/[city]/inventory/[inventory]/import/[importedFileId]`
- `city/[city]/inventory/[inventory]/import/[importedFileId]/extract`
- `city/[city]/inventory/[inventory]/import/[importedFileId]/interpret`
- `city/[city]/inventory/[inventory]/import/approve`
- `AIInterpretationService`, `InventoryExtractionService`,
  `InventoryImportService`, `FileParserService`, `FileValidatorService`,
  `InventoryFileStorageService`, `PdfToTextService`.

Agentic scope:

- This is already an agent-adjacent workflow and should become a first-class
  workflow capability.
- Agent tools need job creation, status polling, mapping inspection, mapping
  override, and approve/reject steps.
- Approval must stay explicit because it mutates emissions inventory values.
- The agent should return a structured import report with row counts, warnings,
  inferred year, mapping confidence, and changed inventory values.

### 7. GHGI Data Entry and Data Source Connection

Primary surfaces:

- `app/src/app/[lng]/[inventory]/data/*`
- `app/src/app/[lng]/cities/[cityId]/GHGI/[inventory]/data/*`
- `app/src/components/Tabs/Activity/*`
- `app/src/components/Modals/activity-modal/*`

What users can do today:

- Browse GPC sectors, subsectors, subcategories, and scopes.
- See inventory completion progress by sector/subsector.
- Search available third-party data sources for an inventory/sector.
- Connect and disconnect third-party data sources.
- Manually choose methodology or direct measurement.
- Create, update, and delete activity values.
- Delete all activities in a scope.
- Mark a scope as not applicable with notation key/reason/explanation.
- Upload own data files when the feature flag is enabled.

Backing services and APIs:

- `inventory/[inventory]/progress`
- `datasource/[inventoryId]`
- `datasource/[inventoryId]/datasource/[datasourceId]`
- `inventory/[inventory]/value`
- `inventory/[inventory]/value/[subcategory]`
- `inventory/[inventory]/value/subsector/[subsector]`
- `inventory/[inventory]/activity-value`
- `inventory/[inventory]/activity-value/[id]`
- `inventory/[inventory]/notation-keys`
- `city/[city]/file`
- `DataSourceService`, `ActivityService`, `CalculationService`,
  `ManualnputValidationService`, `VersionHistoryService`.

Agentic scope:

- Read GPC structure, required scopes, progress, and missing data.
- Recommend the most important missing data to complete an inventory.
- Search and explain data sources before connection.
- Connect/disconnect external sources only after confirmation.
- Create/update/delete manual activity values only through validated,
  typed operations.
- Mark scopes not applicable through a specific notation-key tool.
- Every mutation should create version history and return recalculated impact.

### 8. GHGI Results, Reporting, Publishing, and Version History

Primary surfaces:

- `app/src/components/GHGI/ReportResults.tsx`
- `app/src/app/[lng]/[inventory]/InventoryResultTab/*`
- `app/src/components/GHGIHomePage/DownloadAndShareModals/*`
- `app/src/app/[lng]/[inventory]/InventoryVersionsTab/*`
- `app/src/app/[lng]/[inventory]/cdp/page.tsx`

What users can do today:

- View total emissions, top emissions, emissions per capita, sector totals,
  subsector/scope breakdowns, year-over-year sector changes, and emissions
  forecast.
- Download inventory reports as eCRF and CSV.
- Publish or unpublish public inventory results and copy the public URL.
- Submit inventory data to CDP.
- View version history and restore a previous version.

Backing services and APIs:

- `inventory/[inventory]/results`
- `inventory/[inventory]/results/[sectorName]`
- `inventory/[inventory]/results/emissions-forecast`
- `user/cities/[id]/results`
- `inventory/[inventory]/download`
- `inventory/[inventory]/cdp`
- `inventory/[inventory]`
- `inventory/[inventory]/version-history`
- `inventory/[inventory]/version-history/restore/[version]`
- `ResultsService`, `InventoryDownloadService`, `CSVDownloadService`,
  `ECRFDownloadService`, `CDPService`, `VersionHistoryService`.

Agentic scope:

- Read and summarize results at city/inventory/sector/subsector level.
- Explain drivers of emissions and missing-data effects.
- Generate downloadable exports as agent artifacts.
- Publish/unpublish only after explicit confirmation.
- CDP submission and restore-version operations must be confirm-gated.

### 9. GHGI Preferences

Primary surfaces:

- `app/src/app/[lng]/[inventory]/preferences/*`

What users can do today:

- Browse preference screens for activities, transportation, and waste.
- Current preference cards have empty click handlers and do not appear to
  persist selected preferences.

Backing services and APIs:

- No persistence was identified in the current preference screens.

Agentic scope:

- Treat as informational for now.
- If preferences become persisted, model them as inventory-scoped structured
  settings with read/update tools and version history.

### 10. HIAP Climate Actions and Action Plans

Primary surfaces:

- `app/src/app/[lng]/cities/[cityId]/HIAP/*`
- `app/src/components/HIAP/*`
- `app/src/components/ClimateActionCard.tsx`
- `app/src/components/ActionDrawer.tsx`

What users can do today:

- Select an inventory year for HIAP.
- Generate mitigation or adaptation ranked climate actions.
- Poll existing/pending HIAP status.
- Reprioritize ranked actions.
- View ranked and unranked actions.
- Select/deselect ranked and unranked actions as city top picks.
- View detailed action drawer with sector, cost, timeline, explanation, hazard,
  adaptation effectiveness, and GHG reduction data.
- Export actions as PDF or CSV.
- Generate an implementation/action plan for a ranked action.
- View a generated action plan and export it as PDF.
- View HIAP version history.

Backing services and APIs:

- `inventory/[inventory]/hiap`
- `inventory/[inventory]/hiap/status`
- `city/[city]/hiap/action-plan`
- `city/[city]/hiap/action-plan/[id]`
- `city/[city]/hiap/action-plan/generate/[rankingId]`
- `inventory/[inventory]/version-history?module=hiap`
- `HiapService`, `HiapApiService`, `ActionService`,
  `ActionPlanService`, `BulkHiapPrioritizationService`.

Agentic scope:

- Read actions, status, action details, selected top picks, and generated action
  plans.
- Trigger ranking or reprioritization as a long-running workflow.
- Select top picks through a validated action ID list with confirmation.
- Generate action plans as long-running jobs with status and email/audit output.
- Export selected/all actions or plans as artifacts.

### 11. CCRA Climate Risk Assessment

Primary surfaces:

- `app/src/components/ModuleWidgets/CCRAMainWidget.tsx`
- `app/src/components/ModuleWidgets/CCRAWidget.tsx`
- External CCRA app link.

What users can do today:

- See top CCRA risks on the city dashboard when data is available.
- Open the full external CCRA risk results page for the city locode.

Backing services and APIs:

- `city/[city]/modules/ccra/dashboard`
- `CcraApiService`, `CcraService`.
- External CCRA service.

Agentic scope:

- Implement the currently stubbed `get_climate_risk_assessment` tool.
- Read and summarize top risks, hazard/exposure/vulnerability signals, and
  available indicator details.
- Link users to the full CCRA surface when an action needs external UI.
- Only add mutation tools if/when CCRA has CityCatalyst-owned write actions.

### 12. Organization, Project, Team, and Collaboration

Primary surfaces:

- `app/src/app/[lng]/organization/[id]/project/*`
- `app/src/app/[lng]/organization/[id]/account-settings/*`
- `app/src/components/Organization/*`
- `app/src/components/Project/*`
- `app/src/components/GHGIHomePage/AddCollaboratorModal/*`

What users can do today:

- View organizations, projects, project cards, and cities within projects.
- Create projects and edit project metadata.
- Manage organization account details and branding/white-label theme.
- Upload organization logo.
- Invite organization/team users and update roles.
- View project users and city/project membership.
- Transfer cities and delete cities from project settings.
- Add city collaborators from GHGI/home flows.

Backing services and APIs:

- `organizations`, `organizations/[organization]`,
  `organizations/[organization]/branding`,
  `organizations/[organization]/themes`,
  `organizations/[organization]/users`,
  `organizations/[organization]/role`,
  `organizations/[organization]/invitations`,
  `organizations/[organization]/invitations/accept`,
  `organizations/[organization]/projects`,
  `projects/[project]`, `projects/[project]/users`,
  `projects/[project]/boundaries`, `city/invite`, `city/transfer`,
  `city/[city]/user`.
- `ProjectsService`, `UserService`, `RoleBasedAccessService`,
  `ModuleAccessService`, `FileUploadService`.

Agentic scope:

- Read organization/project/team/city membership and permissions.
- Create/update projects, invite users, change roles, transfer cities, or delete
  cities only through confirmation and role checks.
- Treat branding/logo updates as file workflows with preview and confirmation.
- Return clear audit summaries for every membership or city transfer change.

### 13. Admin Console

Primary surfaces:

- `app/src/app/[lng]/admin/*`
- `app/src/app/[lng]/admin/bulk-inventory-actions/*`
- `app/src/app/[lng]/admin/ManageModulesList`
- `app/src/app/[lng]/admin/OAuthClientList`

What admins can do today:

- View and search organizations.
- Create organizations and organization invites.
- Resend invites.
- Freeze and unfreeze organizations.
- View organization details, profile, team, projects, and modules.
- Run bulk inventory creation.
- Run bulk data download.
- Run bulk HIAP prioritization and inspect HIAP jobs.
- Manage module records.
- Manage OAuth clients when the feature flag is enabled.

Backing services and APIs:

- `admin/all-cities`, `admin/bulk`, `admin/bulk-hiap-prioritization`,
  `admin/connect-sources`, `admin/mark-cities-public`,
  `admin/update-inventories`, `admin/modules`,
  `admin/modules/[module]`, `admin/project/[projectId]/hiap-jobs`,
  `organizations`, `organizations/[organization]/active-status`,
  `client`, `client/[client]`.
- `AdminService`, `ModuleService`, `ProjectsService`,
  `BulkHiapPrioritizationService`.

Agentic scope:

- Admin capabilities should be a separate high-risk capability pack.
- Read/admin reporting can be lower risk.
- Bulk creation, bulk publishing, module creation/deletion, OAuth client
  changes, and organization freeze/unfreeze require confirmation, dry-run
  preview, and audit logs.

### 14. Public Dashboards and Public Project Pages

Primary surfaces:

- `app/src/app/[lng]/public/[inventory]/page.tsx`
- `app/src/app/[lng]/public/cities/[cityId]/dashboard/page.tsx`
- `app/src/app/[lng]/public/project/[project]/*`
- `app/src/app/[lng]/public/dashboard/[cityId]/[[...params]]/page.tsx`

What public users can do today:

- View public inventory results.
- View public city dashboards.
- View public project pages with map, project metrics, partner logos,
  collaborators, and links to GHGI/HIAP/CCRA results.

Backing services and APIs:

- `public/city/[cityId]`
- `public/city/[cityId]/dashboard`
- `public/city/[cityId]/inventories`
- `public/project/[projectId]/cities`
- `projects/[project]/summary`

Agentic scope:

- Read-only public tools are safe candidates for unauthenticated or limited
  agent access.
- Public tools should expose only data that is already published/public.
- Avoid cross-linking to private city/inventory IDs unless the same information
  is public.

### 15. Methodologies and Static Guidance

Primary surfaces:

- `app/src/app/[lng]/methodologies/page.tsx`
- `app/src/app/[lng]/docs/page.tsx`

What users can do today:

- Read methodology content by sector.
- Browse OpenAPI/docs UI.

Backing services and APIs:

- Static methodology content in the app.
- OpenAPI JSON route under `api/openapi/json`.

Agentic scope:

- Expose methodology lookup as a read-only reference tool.
- Agent can cite methodology guidance when explaining data requirements,
  scopes, or calculation assumptions.

### 16. Chat, Climate Advisor, and Assistant APIs

Primary surfaces:

- `app/src/components/ChatBot/*`
- `app/src/hooks/useChat.ts`
- `app/src/services/chatService.ts`
- `app/src/app/api/v1/chat/*`
- `app/src/app/api/v1/assistants/*`
- `app/src/app/api/v1/internal/ca/user-token/route.ts`

What users can do today:

- Use a chat UI that conditionally routes to the Climate Advisor service or the
  legacy OpenAI Assistant implementation based on feature flags.
- Create chat threads and stream messages.
- Save assistant thread IDs to the CityCatalyst database.
- Legacy assistant flow has a `requiresAction` callback stub in the frontend.

Backing services and APIs:

- `chat/threads`, `chat/messages`.
- `assistants`, `assistants/threads/*`, `assistants/files/[fileId]`.
- `ChatService`, `useSSEStream`, Climate Advisor integration.

Agentic scope:

- This should become the UI layer over the shared agent runtime, not a separate
  capability universe.
- Tool calls should route through module capability adapters with consistent
  permissions, confirmations, audit logging, and progress events.
- Legacy function-call handling should either be completed or replaced by the
  unified agent runtime.

## Architecture Scope For Agentic Conversion

The module map points to a modular capability architecture:

1. Module capability manifest

Each user-facing module should own a manifest that describes:

- Module ID and name.
- Read capabilities.
- Mutation capabilities.
- Long-running workflows.
- Required permissions.
- Confirmation requirements.
- Input and output schemas.
- Audit/version-history behavior.
- Whether the capability can be public, authenticated user, organization admin,
  project admin, or platform admin.

2. Query/command/workflow separation

Use three capability types:

- Query: read-only, safe to call automatically.
- Command: immediate mutation, requires validation and usually confirmation.
- Workflow: multi-step or async process with job status, polling, cancellation
  if supported, and final report.

3. Module-owned adapters

Do not put business logic inside MCP handlers. MCP and chat should call module
adapters that reuse existing services:

- `ghgi.capabilities.ts`
- `hiap.capabilities.ts`
- `ccra.capabilities.ts`
- `city.capabilities.ts`
- `organization.capabilities.ts`
- `admin.capabilities.ts`

The adapter should be the stable contract. MCP, chat, scheduled jobs, and future
agent UIs can all use the same adapter.

4. Central capability registry

Replace the manual MCP tool registry with a registry that can expose:

- MCP tools.
- Internal chat tools.
- OpenAPI-like capability metadata.
- UI-readable operation descriptors.

The existing MCP route can stay as the transport layer.

5. Permission and confirmation middleware

Before any adapter runs:

- Resolve session/token.
- Check RBAC and resource scope.
- Classify risk.
- Require confirmation for write/destructive/bulk/publication/security actions.
- Log actor, resource, input summary, output summary, and resulting version/job.

6. Workflow engine for long-running operations

Standardize import, HIAP generation, action plan generation, bulk HIAP, bulk
inventory creation, bulk download, and CDP submission as workflows with:

- Start operation.
- Status operation.
- Result operation.
- Recover/resume operation.
- Structured error model.
- User-facing progress events.

7. Artifact model

Exports should be first-class agent artifacts:

- GHGI CSV/eCRF.
- HIAP CSV/PDF.
- Action plan PDF.
- Bulk downloads.
- Import reports.

8. Human-in-the-loop boundaries

Require explicit approval for:

- Creating cities/inventories/projects/organizations.
- Updating or deleting emissions data.
- Connecting/disconnecting data sources.
- Approving imports.
- Publishing/unpublishing.
- CDP submission.
- Restoring versions.
- Invites/role changes/tokens/OAuth clients.
- Admin bulk operations.

9. Testing and evaluation

For each capability add:

- Schema validation tests.
- Permission tests.
- Dry-run/confirmation tests for risky commands.
- Golden-output tests for summaries.
- Workflow resume/status tests for async jobs.

## Suggested First Capability Pack

Start with a thin vertical slice that proves the architecture:

1. City context query tools:
   - get current/default city
   - list accessible cities
   - get city dashboard
   - list modules for city/project

2. GHGI read tools:
   - get inventory summary
   - get inventory progress
   - get missing data by sector/subsector/scope
   - get emissions results and sector breakdown

3. GHGI guided write workflow:
   - create activity value
   - update activity value
   - mark scope not applicable
   - all with dry-run and confirm-before-commit

4. HIAP read/generate tools:
   - get HIAP status
   - get ranked/unranked actions
   - start HIAP generation
   - poll generation
   - select top actions with confirmation

5. Import workflow:
   - upload/start import
   - poll status
   - inspect mappings
   - approve with confirmation

This gives coverage across read, command, and long-running workflow patterns
without opening the full admin/security surface first.
