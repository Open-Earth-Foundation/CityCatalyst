# Cursor Skills and Rules Naming Convention

This document defines the naming convention for Cursor skills and rules in CityCatalyst and related Open Earth Foundation repositories.

## Purpose

Consistent prefixes make skills discoverable, group related functionality, and clarify the domain/purpose at a glance.

## Taxonomy

### Skill Prefixes

| Prefix | Purpose | Examples |
|--------|---------|----------|
| `ticket-*` | Ticket and issue management workflows | `ticket-create`, `ticket-refine` |
| `nontech-*` | Non-technical contributor workflows | `nontech-contribute` |
| `dev-*` | Developer workflows (PR review, code quality, standards) | `dev-pr-review-gate`, `dev-pull-request-standards`, `dev-script-quality-gate` |
| `impl-*` | Implementation tasks (create components, endpoints, features) | `impl-create-component`, `impl-create-api-endpoint`, `impl-full-feature` |
| `docs-*` | Documentation tasks | `docs-after-change`, `docs-simplify-after-change` |
| `ai-*` | AI/LLM-specific operations | `ai-prompt-schema-authoring` |
| `k8s-*` | Kubernetes operations | `k8s-health-audit`, `k8s-readonly-query` |
| `repo-*` | Repository-wide operations and audits | `repo-doc-audit` |

### Rule Naming

Rules use descriptive kebab-case names that indicate their scope:

- Domain-specific: `nextjs-frontend.mdc`, `python-fastapi.mdc`, `sequelize-database.mdc`
- Component-specific: `chakra-ui-components.mdc`, `forms-validation.mdc`
- General: `general.mdc`, `project-architecture.mdc`, `testing.mdc`

Rules may also use prefixes when they are tightly coupled to a specific area (e.g., `api-routes.mdc`, `auth-permissions.mdc`, `rtk-query.mdc`).

## Benefits

1. **Discoverability** — Type `ticket-` in Cursor and see all ticket-related skills
2. **Grouping** — Related skills appear together in alphabetical listings
3. **Clarity** — The prefix signals the domain before reading the description
4. **Consistency** — Same convention across all OEF repositories (CityCatalyst, agentic-coder, etc.)

## Migration Notes

Skills were renamed in CC-505 to adopt this convention. Internal references (cross-skill links) were updated accordingly.

- Old: `create-ticket`, `refine-ticket`, `non-tech-contribute`
- New: `ticket-create`, `ticket-refine`, `nontech-contribute`

Skills that already followed a good prefix pattern (`k8s-*`, `repo-*`) were kept as-is.

## Adding New Skills

When creating a new skill:

1. Choose the appropriate prefix from the taxonomy above
2. Use kebab-case for the rest of the name
3. Update this document if introducing a new prefix category
4. Ensure the `name:` field in the skill's YAML frontmatter matches the directory name

## Cross-Repository Adoption

This convention applies to:

- **CityCatalyst** (this repo)
- **agentic-coder** (OEF's autonomous coding agent)
- Other OEF repositories using Cursor skills

When adding skills to a new repo, follow this taxonomy to maintain consistency across the organization.
