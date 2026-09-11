# AGENTS.md — CityCatalyst

> Essential contribution rules for the CityCatalyst web application.
> Read [the codebase map](docs/AGENT_CODEBASE_MAP.md) only when you need service, hook, model, or domain navigation. Verify details against the current code.

---

## Commands

```bash
# Development
npm run dev                     # Next.js dev server (http://localhost:3000)
npm run build                   # Production build

# Quality
npm run lint                    # ESLint (Next.js core-web-vitals + i18next)
npx prettier --write <file> ...  # Format explicit changed files (semi: true)
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
npm run i18n:update             # Auto-translate EN keys to de, es, pt, fr
```

---

## Task scope

- Complete the requested change and relevant validation. For review or planning requests, inspect and report without implementing unrequested changes.
- Preserve unrelated edits. Keep formatting and refactors within the task's scope.
- Resolve routine implementation choices from repository context; ask only when a missing answer materially changes scope, correctness, or authorization.
- Follow applicable skills without treating them as permission for additional work. Honor authorization already given and prepare a concrete result before seeking any still-required approval.

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
export const GET = apiHandler(
  async (req, { session, params, searchParams }) => {
    // session: AppSession | null (already resolved from any auth method)
    // params: Record<string, string> (route params, already awaited)
    // searchParams: Record<string, string> (query string)
    if (!session) throw new createHttpError.Unauthorized("Unauthorized");
    return NextResponse.json({ data: result });
  },
);
```

### Error Handling Hierarchy

| Error Type                                      | HTTP Status                      | Behavior                                       |
| ----------------------------------------------- | -------------------------------- | ---------------------------------------------- |
| `createHttpError.*` (http-errors)               | Varies (400, 401, 403, 404, 500) | Returns `{ error: { message, code?, data? } }` |
| `ZodError`                                      | 400                              | Returns `{ error: { message, issues } }`       |
| `ManualInputValidationError`                    | 400                              | Returns `{ error: { type, message, issues } }` |
| `CustomOrganizationError` / `CustomInviteError` | 409                              | Returns `err.data`                             |
| `SyntaxError` (bad JSON)                        | 400                              | Returns `{ error: { message } }`               |
| `SequelizeUniqueConstraintError`                | 400                              | Returns "Entity exists already."               |
| `OpenAI.APIError`                               | Forwarded                        | Forwards OpenAI error shape                    |
| Any other error                                 | 500                              | Returns "Internal server error" (logged)       |

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
- Add new keys to the **English** file — CI auto-translates to de, es, fr, pt. Explicitly requested corrections to existing locale values may edit that locale directly.
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
UPLOAD_OWN_DATA_ENABLED, OAUTH_ENABLED, ANALYTICS_ENABLED,
CCRA_MODULE, CA_SERVICE_INTEGRATION, HIGHLIGHT_ENABLED
```

- Parsed from `NEXT_PUBLIC_FEATURE_FLAGS` env (comma-separated) via `env()` from `@/lib/runtime-env`
- QA override via `localStorage` key `qa_feature_flags`
- Use `hasFeatureFlag(flag)` on client, `hasServerFeatureFlag(flag)` on server

---

## Runtime public env (`src/lib/runtime-env/`)

Replaces `next-runtime-env`. Injects allowlisted `NEXT_PUBLIC_*` vars into
`window.__ENV` at request time so k8s/runtime values are not frozen at build time.
`RuntimeEnvScript` uses `connection()` so the layout is not statically prerendered
with an empty env from the Docker build.

- Client/shared: `import { env } from "@/lib/runtime-env"` then `env("NEXT_PUBLIC_…")`
- Add new browser-facing keys to `PUBLIC_RUNTIME_ENV_KEYS` in `keys.ts`
- Full guide: [docs/RUNTIME_ENV.md](./docs/RUNTIME_ENV.md)

---

## Testing

Run checks appropriate to changed behavior and required gates. Use targeted tests first; broaden only for shared-code impact, failures, or a concrete unresolved risk. Once sufficient checks pass, finish. Distinguish pre-existing failures from regressions introduced by the task. Documentation-only edits need link/content validation rather than application test suites.

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

_This file is for agentic coding agents. Follow these rules for consistency and reliability._

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
