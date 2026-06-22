---
name: create-ticket
description: Generate structured Linear tickets (stories, tasks, bugs, spikes) with AI-enriched code references and acceptance criteria from a brief description. Use when the product team asks to create a ticket, write a story, draft a task, report a bug, or plan a spike for CityCatalyst.
---

# Create Ticket

Generate a sprint-ready Linear ticket from a short description. The agent classifies the work, asks targeted questions, searches the codebase for relevant references, and outputs formatted markdown.

For ticket type definitions, estimation policy, and Linear conventions, see [reference.md](reference.md).

## Workflow

### Phase 1: Classify

Determine the ticket type from the user's description. If ambiguous, ask:

```
AskQuestion:
  id: ticket_type
  prompt: "What type of work is this?"
  options:
    - Story (user-facing feature or enhancement)
    - Task (technical work not directly visible to users)
    - Bug (defect in existing functionality)
    - Spike (time-boxed research to reduce uncertainty)
    - Incident (production issue requiring immediate response)
```

Then determine the area:

```
AskQuestion:
  id: ticket_area
  prompt: "Which area does this primarily affect?"
  options:
    - Core Product (app/ — frontend + API + DB)
    - Data (global-api/)
    - AI/ML (hiap/, hiap-meed/, climate-advisor/)
    - Infrastructure (k8s/, CI/CD, DevOps)
    - Multiple (cross-cutting)
  allow_multiple: true
```

### Phase 2: Gather Context

Ask follow-up questions conditional on the ticket type.

**For Story:**

```
AskQuestion:
  id: story_context
  prompt: "Who is the primary user persona?"
  options:
    - City official / inventory manager
    - Platform admin
    - Data analyst / researcher
    - External API consumer
    - Internal team member
```

Then ask in free-form (normal message): "What should the user be able to do, and what value does it provide?"

**For Bug:**

```
AskQuestion:
  id: bug_severity
  prompt: "How severe is this bug?"
  options:
    - Critical (data loss, security, or complete feature broken)
    - Major (feature partially broken, workaround exists)
    - Minor (cosmetic, edge case, or low-impact)
```

Then ask: "What are the steps to reproduce, and what is the expected vs actual behavior?"

**For Task:**

Ask: "What triggers this work? Are there dependencies or deadlines?"

**For Spike:**

```
AskQuestion:
  id: spike_timebox
  prompt: "What timebox for this investigation?"
  options:
    - 1 day
    - 2 days
    - 3 days
```

Then ask: "What decision or work does this spike unblock?"

### Phase 3: AI Enrichment

After gathering context, perform codebase analysis:

1. **Find relevant code** — Use `Grep` and `Glob` to locate:
   - Files in the affected service(s) related to the described functionality
   - Similar patterns or existing implementations that serve as reference
   - Related models, API routes, components, or services

2. **Identify technical implications** — Based on code analysis, determine:
   - Is a database migration needed?
   - Is a new API endpoint required?
   - Are new i18n keys needed?
   - Should a feature flag wrap this?
   - Which existing services/hooks/components can be reused?

3. **Draft acceptance criteria** — Generate 3-6 testable AC items from the description and code context.

### Phase 4: Generate Output

Produce the ticket in this exact markdown format:

```markdown
## [TYPE] Title

### Summary
2-3 sentence description of the work and its purpose.

### User Story
<!-- Include only for type: Story -->
As a [persona], I want [capability] so that [benefit].

### Context & Code References
- **Relevant files:**
  - `path/to/file.ts` — brief reason this file is relevant
  - `path/to/other.ts` — brief reason
- **Similar implementations:** describe existing patterns to follow
- **Affected services:** list services (app / global-api / hiap / etc.)

### Acceptance Criteria
- [ ] Specific, testable criterion 1
- [ ] Specific, testable criterion 2
- [ ] Specific, testable criterion 3
- [ ] <!-- PM: add additional criteria here -->

### Definition of Ready
- [ ] Design/Figma link attached (if UI work)
- [ ] API contract defined (if backend)
- [ ] Dependencies identified
- [ ] AC reviewed by engineer
- [ ] Estimate assigned

### Technical Notes
- **Suggested approach:** brief description based on codebase patterns
- **Migration needed:** Yes/No
- **New API endpoint:** Yes/No
- **i18n keys needed:** Yes/No
- **Feature flag:** Yes/No (recommend for: new pages, major behavior changes)
- **Reusable existing code:** list hooks/components/services to leverage

### Open Questions
- <!-- PM: list unknowns or decisions pending -->

### Metadata
| Field | Value |
|-------|-------|
| Type | Story / Task / Bug / Spike |
| Priority | <!-- to fill --> |
| Estimate | <!-- Fibonacci: 1,2,3,5,8,13 --> |
| Impact | <!-- High / Medium / Low --> |
| Team | <!-- Core Product / Data / AI / Infra --> |
| Labels | <!-- suggested labels from reference.md --> |
| Sprint | <!-- to assign --> |
```

### Phase 5: Review & Refine

After presenting the output:

1. Highlight which fields still need human input (Priority, Estimate, Sprint, Figma link).
2. Ask if the PM wants to adjust anything before copying to Linear.
3. If the PM provides additional context, regenerate the affected sections.

## Conventions

- Always search the codebase before generating technical notes — never guess file paths.
- Keep code references to 3-8 files maximum; prefer the most relevant ones.
- Acceptance criteria must be testable (avoid vague "should work well" language).
- For Spikes, replace "Acceptance Criteria" with "Questions to Answer" (a list of what the spike must clarify).
- For Incidents, add a "Timeline" section and skip estimation.
- Use the team's Linear label conventions from [reference.md](reference.md).

## Quick Examples

**Input:** "Users need to export their inventory data as PDF"

**Output type:** Story

**Key sections generated:**
- User story: "As a city official, I want to export my inventory as PDF so that I can share it with stakeholders offline."
- Code refs: `app/src/services/pdf.ts`, `app/src/app/api/v1/inventory/[inventory]/route.ts`, existing PDF generation patterns
- Technical notes: No migration, new API endpoint (GET /api/v1/inventory/:id/export/pdf), i18n keys for export UI, feature flag recommended

---

**Input:** "The emissions chart crashes when a sector has zero values"

**Output type:** Bug

**Key sections generated:**
- Steps to reproduce with code path
- Code refs: chart component, data transformation logic
- Technical notes: No migration, no new endpoint, fix in existing component
