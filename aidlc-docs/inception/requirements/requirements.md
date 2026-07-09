# Requirements

**Project**: CityCatalyst (Brownfield)
**Phase**: INCEPTION — Requirements Analysis
**Created**: 2026-07-09T19:42:00Z
**Document Language**: English (team lingua franca)

---

## Intent Analysis Summary

| Attribute | Assessment |
|-----------|------------|
| **User request** | Document the CityCatalyst project and structure AI-DLC artifacts to support future implementation tasks |
| **Request type** | Documentation / knowledge capture (not implementation) |
| **Scope estimate** | Monorepo-wide documentation; no application code changes |
| **Complexity estimate** | Moderate — multi-service brownfield with existing reverse-engineering artifacts |
| **Depth applied** | Standard |

### Context

Open Earth Foundation operates from California with an engineering team distributed across multiple countries. **English is the lingua franca** for all AI-DLC and project documentation.

The reverse-engineering phase is complete. This phase formalizes requirements for the **documentation-only inception work** that prepares the team for subsequent implementation tasks (to be defined separately).

---

## Functional Requirements

### FR-1: Project documentation foundation

The system shall maintain a complete set of reverse-engineering artifacts under `aidlc-docs/inception/reverse-engineering/` describing architecture, business context, APIs, dependencies, and code quality.

**Status**: Complete (approved 2026-07-09).

### FR-2: English-only documentation

All AI-DLC artifacts (plans, requirements, reverse engineering, audit, state tracking, and future construction docs) shall be written in **English**.

**Rationale**: Distributed team; California HQ; consistent onboarding and review.

### FR-3: Structured artifact layout

Documentation shall follow the AI-DLC directory structure defined in `aws-aidlc-rules/core-workflow.md`:

```
aidlc-docs/
├── inception/
│   ├── plans/
│   ├── reverse-engineering/
│   ├── requirements/
│   └── (future: user-stories/, application-design/)
├── construction/
└── aidlc-state.md, audit.md
```

### FR-4: Traceability for future tasks

Requirements and workflow planning shall explicitly state that **implementation is out of scope** for the current phase and that future tasks will reference reverse-engineering artifacts as the technical baseline.

### FR-5: No application code changes

No modifications to application source code under `app/`, `global-api/`, `hiap/`, `climate-advisor/`, `hiap-meed/`, or other runtime packages during this phase.

### FR-6: Understanding gaps preserved

Open questions identified during reverse engineering (12 items in `reverse-engineering-timestamp.md`) shall remain documented for resolution during future implementation planning.

---

## Non-Functional Requirements

### NFR-1: Clarity and maintainability

Documentation shall be clear, structured, and navigable for engineers joining from any timezone or country.

### NFR-2: Accuracy

Documentation shall reflect the current codebase state as of the reverse-engineering analysis date (2026-07-09).

### NFR-3: Diagram validity

Mermaid and ASCII diagrams shall follow `aws-aidlc-rule-details/common/content-validation.md` rules.

### NFR-4: Audit trail

All user inputs and AI decisions shall be logged in `aidlc-docs/audit.md` with timestamps and complete raw user input.

### NFR-5: No production impact

This phase shall not affect deployed EKS environments (dev/test/prod).

---

## User Scenarios

### Scenario 1: New engineer onboarding

An engineer in any country opens `aidlc-docs/inception/reverse-engineering/architecture.md` and understands the hub-and-spoke monorepo, service boundaries, and main execution flows without reading source code first.

### Scenario 2: Planning a future feature

A tech lead uses `component-inventory.md`, `dependencies.md`, and `api-documentation.md` to identify affected packages and integration points before scoping an implementation task.

### Scenario 3: Resuming AI-DLC workflow

A team member reads `aidlc-state.md` and continues from Workflow Planning when a concrete implementation request is ready.

---

## Business Context

| Item | Detail |
|------|--------|
| **Organization** | Open Earth Foundation (California, USA) |
| **Product** | CityCatalyst — open-source climate journey platform for cities |
| **License** | AGPL v3 |
| **Current goal** | Establish documentation foundation; defer implementation |
| **Success criteria** | Complete AI-DLC inception documentation in English; team can plan next tasks |

---

## Technical Context

| Item | Detail |
|------|--------|
| **Monorepo** | `app/`, `global-api/`, `climate-advisor/`, `hiap/`, `hiap-meed/`, `k8s/`, etc. |
| **Architecture** | Hub-and-spoke; `app` orchestrates Python microservices via HTTP |
| **Baseline artifacts** | `aidlc-docs/inception/reverse-engineering/*` (9 files) |
| **Out of scope** | Code generation, deployment, infrastructure changes |

---

## Extension Configuration

| Extension | Enabled | Decided At | Notes |
|-----------|---------|------------|-------|
| Security Baseline | Deferred | Requirements Analysis | Re-evaluate when implementation begins |
| Resiliency Baseline | Deferred | Requirements Analysis | Re-evaluate when implementation begins |
| Property-Based Testing | Deferred | Requirements Analysis | Re-evaluate when implementation begins |

---

## Workflow Decisions

| Stage | Decision | Rationale |
|-------|----------|-----------|
| Reverse Engineering | Execute | Brownfield; completed and approved |
| Requirements Analysis | Execute | Formalize documentation-phase scope |
| User Stories | **Skip** | No user-facing feature in scope |
| Workflow Planning | **Execute next** | Define path for documentation completion and future implementation handoff |
| Application Design | Skip (for now) | No new components until implementation task defined |
| Units Generation | Skip (for now) | No code units until implementation task defined |
| Code Generation | Skip | Explicitly out of scope |

---

## Acceptance Criteria

- [x] Reverse-engineering artifacts complete and approved
- [x] Requirements document created in English
- [x] Clarifying questions answered and recorded
- [x] Extension opt-in status recorded (deferred)
- [x] User Stories explicitly skipped with rationale
- [x] Workflow Planning approved
- [x] Inception completion summary created
- [x] All aidlc-docs files consistently in English

---

## Open Items for Future Phases

When an implementation task is defined, the team should:

1. Re-run or refresh reverse engineering if the codebase has changed significantly
2. Opt in or out of Security, Resiliency, and PBT extensions
3. Decide whether User Stories are needed based on user impact
4. Resolve the 12 understanding gaps listed in `reverse-engineering-timestamp.md`
