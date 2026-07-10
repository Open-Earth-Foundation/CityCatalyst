---
name: impl-full-feature
description: End-to-end feature development workflow for CityCatalyst covering database, API, frontend, and tests. Use when the user asks to build a complete feature, implement a full user story, or create an end-to-end functionality.
---

# Full Feature Development

## Overview

A complete feature in CityCatalyst touches up to 7 layers. Follow this order to avoid dependency issues.

## Workflow

### Phase 1: Database Layer

1. **Migration**: Create migration file in `app/migrations/` (see [impl-create-migration skill](../impl-create-migration/SKILL.md))
2. **Model**: Create Sequelize model in `app/src/models/`
3. **Register**: Add to `app/src/models/init-models.ts`
4. **Run**: `cd app && npm run db:migrate`

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
17. **Lint**: `cd app && npm run lint`
18. **Format**: `cd app && npm run prettier`
19. **Test**: `cd app && npm run jest`

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
