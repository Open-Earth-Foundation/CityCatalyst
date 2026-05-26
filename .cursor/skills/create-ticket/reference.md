# Ticket Taxonomy & Conventions

Reference material for the `create-ticket` skill. The agent reads this file when it needs taxonomy details, Linear conventions, or estimation guidance.

## Issue Types

| Type | Purpose | Pointed? | Who Creates |
|------|---------|----------|-------------|
| **Epic** | Large initiative spanning multiple sprints (e.g., "HIAP v2 Integration") | No (derived from children) | PM / PO |
| **Story** | User-facing value delivery with clear acceptance criteria | Yes (Fibonacci) | PM / PO |
| **Task** | Technical work not directly user-visible (refactor, infra, CI/CD, migrations) | Yes (Fibonacci) | Engineer / Tech Lead |
| **Spike** | Time-boxed research/investigation to reduce uncertainty | No (time-boxed: 1-3 days) | Engineer or PM |
| **Bug** | Defect in existing functionality | Yes (Fibonacci) | Anyone |
| **Incident** | Production issue requiring immediate response | No (tracked by MTTR/severity) | On-call / SRE |
| **Sub-task** | Breakdown of a Story/Task for sprint tracking | No (parent carries points) | Engineer |

## Story Point Policy

- **Scale:** Fibonacci — 1, 2, 3, 5, 8, 13
- **Rule:** Anything estimated above 13 must be split into smaller items.
- **What it measures:** Effort + complexity + uncertainty (never calendar time).
- **Time tracking:** Every ticket records actual time spent so the team can compare effort vs elapsed time across same-point items, feed velocity charts, and compute DORA/ROI metrics.

### ROI & Metrics Guidance

Each Story or Task carries an **Impact** field:

| Impact | Definition |
|--------|-----------|
| High | Affects >50% of users or directly tied to revenue/funding milestone |
| Medium | Improves experience for a significant segment or unblocks other high-impact work |
| Low | Quality-of-life improvement, internal tooling, or minor polish |

This enables: `points-delivered / impact-weighted` analysis per sprint, ROI dashboards, and investment allocation reviews.

### DORA Metrics Tracked

| Metric | Source |
|--------|--------|
| Lead Time for Changes | Ticket created -> PR merged |
| Deployment Frequency | Releases per sprint |
| Change Failure Rate | Incidents / total deployments |
| Mean Time to Recovery | Incident created -> resolved |

## Linear Mapping

| Taxonomy Type | Linear Concept | Notes |
|---------------|---------------|-------|
| Epic | **Project** (or parent Issue with sub-issues) | Use Projects for multi-sprint initiatives |
| Story | Issue with label `story` | Estimate field = Fibonacci points |
| Task | Issue with label `task` | Estimate field = Fibonacci points |
| Bug | Issue with label `bug` | Estimate field = Fibonacci points |
| Spike | Issue with label `spike` | No estimate; set due date as timebox |
| Incident | Issue with label `incident`, priority: Urgent | Link to monitoring alert if available |
| Sub-task | Sub-issue (child of a Story or Task) | No separate estimate |

### Linear Labels (recommended)

| Label | Color hint | Applied to |
|-------|-----------|-----------|
| `story` | Blue | User-facing features |
| `task` | Gray | Technical work |
| `bug` | Red | Defects |
| `spike` | Purple | Research/investigation |
| `incident` | Orange | Production issues |
| `frontend` | Teal | Touches app/ UI |
| `backend` | Green | Touches app/ API or services |
| `ai` | Violet | Touches hiap, hiap-meed, climate-advisor |
| `data` | Yellow | Touches global-api or data pipelines |
| `infra` | Dark gray | k8s, CI/CD, DevOps |

### Linear Priorities

| Priority | When to use |
|----------|-------------|
| Urgent | Incidents, security vulnerabilities, data loss |
| High | Sprint commitment, blocking other work |
| Medium | Important but not blocking |
| Low | Nice-to-have, backlog grooming candidates |

## Team Areas

| Area | Services | Typical owners |
|------|----------|----------------|
| Core Product | `app/` (frontend + API + DB) | Product + Engineering |
| Data | `global-api/` | Data team |
| AI/ML | `hiap/`, `hiap-meed/`, `climate-advisor/` | AI team |
| Infrastructure | `k8s/`, `.github/workflows/`, DevOps | Engineering |

## Definition of Ready (DoR) Checklist

A ticket is ready for sprint when:

- [ ] Summary and acceptance criteria are clear and unambiguous
- [ ] Design/Figma link attached (if UI work)
- [ ] API contract or schema defined (if backend/data work)
- [ ] Dependencies identified and unblocked
- [ ] Acceptance criteria reviewed by at least one engineer
- [ ] Estimate assigned (for pointed types)
- [ ] Impact field set (High/Medium/Low)

## Definition of Done (DoD) Checklist

A ticket is done when:

- [ ] Code merged to develop branch
- [ ] All acceptance criteria verified
- [ ] Unit/integration tests passing
- [ ] No new lint errors introduced
- [ ] i18n keys added (if user-facing text)
- [ ] Documentation updated (if API or architecture change)
- [ ] Deployed to staging and smoke-tested
- [ ] Time tracked (actual hours logged)
