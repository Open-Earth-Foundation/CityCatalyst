---
name: full-feature
description: End-to-end feature development workflow for CityCatalyst covering database, API, frontend, and tests. Use when the user asks to build a complete feature, implement a full user story, or create an end-to-end functionality.
---

# Full Feature Development

## Overview

A feature may touch several layers. First identify the layers required by the request and existing code, then follow their dependency order. Skip phases that do not apply; do not create a migration, API endpoint, RTK hook, or UI merely to complete this list.

## Workflow

### Phase 1: Database Layer

1. **Migration**: Create migration file in `app/migrations/` (see [create-migration skill](../create-migration/SKILL.md))
2. **Model**: Create Sequelize model in `app/src/models/`
3. **Register**: Add to `app/src/models/init-models.ts`
4. **Validate**: Follow the migration skill's database-target checks. Run migrations only against a verified disposable local/test database, or an explicitly authorized target. Creating a migration does not authorize applying it to a shared database.

### Phase 2: Backend API

5. **Validation**: Add Zod schemas to `app/src/util/validation.ts`
6. **Service** (optional): Create `app/src/backend/<Feature>Service.ts` for complex logic
7. **Route handler**: Create `app/src/app/api/v1/<feature>/route.ts` with `apiHandler`
8. **Swagger**: Add `@swagger` JSDoc above imports
9. **Test**: Create `app/tests/api/<feature>.jest.ts`

### Phase 3: Frontend Data Layer

10. **RTK Query**: Add endpoints to `app/src/services/api.ts`
    - Query with `providesTags`
    - Mutation with `invalidatesTags`
    - Add new tag type to `tagTypes` if needed

### Phase 4: Frontend UI

11. **i18n**: Add keys to `app/src/i18n/locales/en/<namespace>.json`
12. **Component(s)**: Create in `app/src/components/<Feature>/`
13. **Page** (if new route): Create `app/src/app/[lng]/<route>/page.tsx`
14. **Hook** (if complex logic): Create `app/src/hooks/use<Feature>.ts`
15. **Navigation**: Update sidebar/nav if adding a new page

### Phase 5: Quality

16. **Types**: Ensure all types are in `app/src/util/types.ts` or co-located
17. **Lint**: From `app/`, run ESLint on the changed supported files. Complete any broader required CI checks when available.
18. **Format**: From `app/`, run `npx prettier --write <changed-file> ...` with explicit paths. `npm run prettier` formats the entire app; reserve it for an explicitly requested formatting task.
19. **Test**: Run the relevant Jest tests and add regression coverage for changed behavior where practical. Run broader suites when required by CI or justified by shared-code impact, failures, or an unresolved risk. Once the necessary checks pass, finish; do not repeatedly broaden testing without new evidence.

Distinguish failures introduced by this change from pre-existing failures. Report unrelated blockers rather than expanding the feature to repair them. Apply each required post-change skill once to the final diff, revisiting only later edits.

## File Mapping

```
Feature: "Widget Management"

app/
├── migrations/20260410-add-widget.cjs          # DB migration
├── src/models/Widget.ts                         # Sequelize model
├── src/models/init-models.ts                    # Register model
├── src/util/validation.ts                       # + createWidgetRequest schema
├── src/backend/WidgetService.ts                 # Business logic
├── src/app/api/v1/widget/route.ts               # API handler (GET, POST)
├── src/app/api/v1/widget/[widget]/route.ts      # API handler (GET, PATCH, DELETE)
├── src/services/api.ts                          # + RTK Query endpoints
├── src/i18n/locales/en/widget.json              # i18n keys
├── src/components/Widget/widget-list.tsx         # List component
├── src/components/Widget/widget-form.tsx         # Form component
├── src/app/[lng]/cities/[cityId]/widget/page.tsx # Page
├── src/hooks/useWidget.ts                        # Custom hook (optional)
└── tests/api/widget.jest.ts                      # API tests
```

## Quick Reference

| Need | Location | Pattern |
|------|----------|---------|
| Auth check | `if (!session) throw createHttpError.Unauthorized()` | All protected routes |
| DB query | `db.models.Widget.findAll(...)` | Sequelize |
| Validate | `schema.parse(body)` | Zod (auto-caught as 400) |
| API error | `throw createHttpError.NotFound(...)` | http-errors |
| Data fetch | `api.useGetWidgetQuery(id)` | RTK Query hook |
| Translation | `t("widget.title")` | i18next |
| Styling | `bg="background.overlay"` | Chakra semantic tokens |
