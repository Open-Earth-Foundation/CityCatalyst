---
name: ticket-refine
description: Enrich an existing ticket with detailed technical breakdown, sub-tasks, code references, and estimation guidance. Use when an engineer asks to refine a ticket, break down a story, add technical details, estimate a task, or decompose work into sub-tasks.
---

# Refine Ticket

Take an existing ticket (pasted markdown or description) and enrich it with engineering-specific details: sub-task breakdown, precise code references, implementation approach, and estimation rationale.

For ticket taxonomy and estimation conventions, see [../ticket-create/reference.md](../ticket-create/reference.md).

## Workflow

### Step 1: Parse the Ticket

Read the provided ticket content and extract:
- Type (Story / Task / Bug / Spike)
- Summary and acceptance criteria
- Any existing code references or technical notes

If the ticket is just a title or brief description, treat it as needing full technical enrichment.

### Step 2: Codebase Analysis

Search the repository to build a technical picture:

1. **Identify affected layers** — For each acceptance criterion, determine which layers are touched:
   - Database (models, migrations)
   - Backend API (routes, services, validation)
   - Frontend data (RTK Query endpoints, Redux slices)
   - Frontend UI (components, pages, hooks)
   - External services (global-api, hiap, climate-advisor)

2. **Find implementation anchor points** — Locate the specific files where changes will be made:
   - Use `Glob` to find relevant models: `app/src/models/<Entity>.ts`
   - Use `Grep` to find related API routes: pattern in `app/src/app/api/v1/`
   - Use `Grep` to find related components: pattern in `app/src/components/`
   - Use `Grep` for RTK Query endpoints: pattern in `app/src/services/api.ts`

3. **Identify reusable patterns** — Find existing code that solves similar problems:
   - Similar API handlers with the same auth/validation pattern
   - Components with comparable UI requirements
   - Existing hooks or utilities that can be extended

### Step 3: Break into Sub-tasks

Decompose the ticket into implementation sub-tasks. Follow this layer order to avoid dependency issues:

```
1. [DB]       Migration / model changes
2. [API]      Validation schemas + route handlers
3. [Service]  Backend business logic (if complex)
4. [RTK]      RTK Query endpoints (query + mutation)
5. [UI]       Components + pages
6. [i18n]     Translation keys
7. [Test]     Unit/integration/E2E tests
8. [Docs]     API docs, README updates
```

Each sub-task should be:
- Independently reviewable (could be its own PR)
- Estimated separately if useful
- Linked to specific files

### Step 4: Estimate

Provide estimation rationale using the team's Fibonacci scale:

| Points | Guideline |
|--------|-----------|
| 1 | Single file change, trivial logic, <1h work |
| 2 | 2-3 files, straightforward pattern, <half day |
| 3 | Multiple files, some decisions required, ~1 day |
| 5 | Cross-layer work, new patterns needed, 2-3 days |
| 8 | Significant feature, multiple PRs likely, ~1 week |
| 13 | Large scope, architectural decisions, should consider splitting |

Factors to weigh:
- Number of layers touched
- Novelty (new pattern vs following existing convention)
- Uncertainty (clear requirements vs ambiguous)
- Testing complexity
- Review/iteration cycles expected

### Step 5: Generate Enriched Output

Append or replace the technical sections of the ticket:

```markdown
### Technical Breakdown

**Implementation approach:**
Brief description of the recommended approach, referencing existing patterns.

**Affected files (by layer):**

| Layer | File | Change |
|-------|------|--------|
| DB | `app/migrations/YYYYMMDD-<name>.cjs` | New migration |
| Model | `app/src/models/<Entity>.ts` | New/modified model |
| Validation | `app/src/util/validation.ts` | New Zod schema |
| API | `app/src/app/api/v1/<route>/route.ts` | New handler |
| RTK | `app/src/services/api.ts` | New query/mutation |
| Component | `app/src/components/<Feature>/<name>.tsx` | New component |
| Page | `app/src/app/[lng]/<route>/page.tsx` | Wire component |
| i18n | `app/src/i18n/locales/en/<ns>.json` | New keys |
| Test | `app/tests/api/<feature>.jest.ts` | API tests |

**Reusable code:**
- `app/src/backend/SomeService.ts` — similar pattern for X
- `app/src/components/Existing/thing.tsx` — reuse for Y
- `app/src/hooks/useSomething.ts` — extend for Z

### Sub-tasks

- [ ] **[DB]** Create migration for <entity> table — *1 pt*
- [ ] **[API]** Add validation schema and route handler — *2 pts*
- [ ] **[RTK]** Add query and mutation endpoints — *1 pt*
- [ ] **[UI]** Build <component> with form/list — *3 pts*
- [ ] **[i18n]** Add translation keys — *1 pt*
- [ ] **[Test]** Write API and component tests — *2 pts*

### Estimation

| Item | Points | Rationale |
|------|--------|-----------|
| Total | X | Summary of complexity factors |

### Risks & Dependencies

- Risk: <describe any uncertainty>
- Dependency: <blocked by ticket X or external decision>
- Note: <anything the PM should know>
```

## Conventions

- Always verify file paths by searching the codebase — never invent paths.
- Reference the [impl-full-feature skill](../impl-full-feature/SKILL.md) layer order for consistency.
- Sub-tasks should map to potential PRs (reviewable independently).
- If total estimate exceeds 13 points, recommend splitting into multiple tickets.
- For Spikes: instead of sub-tasks, output a list of investigation steps and expected deliverables (decision doc, PoC, etc.).
- For Bugs: include a "Root Cause" section describing where the defect likely lives based on code analysis.
