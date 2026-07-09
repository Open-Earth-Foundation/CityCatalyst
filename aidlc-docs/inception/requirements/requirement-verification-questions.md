# Requirements Clarification Questions

**Project**: CityCatalyst (Brownfield)
**Phase**: INCEPTION — Requirements Analysis
**Created**: 2026-07-09T19:38:00Z
**Language**: English (team lingua franca)

Please answer each question by filling in the letter choice after the `[Answer]:` tag. If no option fits, choose **Other** and describe after `[Answer]:`.

---

## Question 1 — Primary objective

The initial request was **reverse engineering** to understand the architecture. What implementation goal should guide the next AI-DLC phases?

A) Documentation / reverse engineering only — no implementation planned at this time

B) New product feature in CityCatalyst (describe in Q2)

C) Bug fix or specific issue (describe in Q2)

D) Refactoring, technical improvement, or tech debt (describe in Q2)

E) Integration or migration (e.g., hiap-meed, global-api v1, new module)

F) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 2 — Work description

Describe in 2–5 sentences what you intend to build, fix, or improve. If Q1 is **A**, note any future work or use N/A.

A) _(Use the [Answer]: field below for a free-text description — do not select a letter here)_

X) Other (please describe after [Answer]: tag below)

[Answer]: The initial phase is only to document the project and structure the documents for the next tasks. No application code changes are in scope. Future implementation tasks will be defined separately after the documentation foundation is complete.

---

## Question 3 — Estimated scope

What is the likely scope of changes?

A) Single file or isolated component

B) Single package/service (e.g., `app/` only, `hiap/` only)

C) Multiple monorepo packages (e.g., `app/` + `climate-advisor/`)

D) System-wide cross-cutting change

E) Not yet defined — need help scoping

F) Other (please describe after [Answer]: tag below)

[Answer]: F — Documentation-only scope across the full monorepo (all packages described in reverse-engineering artifacts); no code modifications in this phase.

---

## Question 4 — Affected packages

Which monorepo packages should be in scope?

A) `app/` only (Next.js — UI + API)

B) `app/` + one Python service (`global-api`, `hiap`, `climate-advisor`, or `hiap-meed`)

C) Multiple Python services + `app/`

D) Infrastructure only (`k8s/`, CI/CD, Docker)

E) Documentation and AI-DLC only — no code changes

F) Other (please describe after [Answer]: tag below)

[Answer]: E

---

## Question 5 — Users and impact

Who is the primary beneficiary of this work?

A) End users in cities (web UI, climate journey)

B) Developers / external integrators (API, OAuth, MCP, SDK)

C) OEF administrators (admin panel, bulk operations)

D) Internal engineering team (maintainability, observability, CI)

E) Combination of more than one of the above

F) Other (please describe after [Answer]: tag below)

[Answer]: D — Internal engineering team distributed across multiple countries; documentation must support onboarding and future task planning.

---

## Question 6 — Priority non-functional requirements

Which quality attribute is **most critical** for this work?

A) Security and compliance (auth, sensitive data, AGPL)

B) Performance and scalability

C) Reliability and resilience (fault tolerance, recovery)

D) Maintainability and clarity

E) Testability and test coverage

F) No specific NFR for this phase

G) Other (please describe after [Answer]: tag below)

[Answer]: D — Clear, maintainable documentation structure for a distributed engineering team.

---

## Question 7 — Success criteria

How will we know this work is successfully complete?

A) Feature working locally with passing tests

B) Deploy approved in dev/test environment

C) Complete documentation and AI-DLC artifacts (no code)

D) Specific business metrics or KPIs (describe in [Answer])

E) Product stakeholder approval (describe in [Answer])

F) Other (please describe after [Answer]: tag below)

[Answer]: C

---

## Question 8 — Constraints and timeline

Are there important constraints?

A) No rigid deadline — quality is the priority

B) Short deadline — prefer minimum viable solution

C) Do not change existing public API contracts

D) Do not introduce new external dependencies

E) Maintain compatibility with current EKS environments (dev/test/prod)

F) Other (please describe after [Answer]: tag below)

[Answer]: F — All AI-DLC and project documentation must be written in **English** (team lingua franca; company based in California, team distributed internationally). No application code changes in this phase.

---

## Question 9 — Security Extensions

Should security extension rules be enforced for this project?

A) Yes — enforce all SECURITY rules as blocking constraints (recommended for production-grade applications)

B) No — skip all SECURITY rules (suitable for PoCs, prototypes, and experimental projects)

X) Other (please describe after [Answer]: tag below)

[Answer]: X — Deferred until implementation tasks begin. Documentation phase only; security baseline will be re-evaluated when code changes are in scope.

---

## Question 10 — Resiliency Extensions

Should the resiliency baseline be applied to this project?

**What this extension is.** Enabling it applies directional, design-time best practices for building resilient systems, derived from the AWS Well-Architected Framework (Reliability Pillar).

**What this extension is NOT.** Enabling it does not make your workload production-ready nor certify any availability, RTO, or RPO target.

A) Yes — apply the resiliency baseline as directional best practices and design-time guidance (recommended for business-critical workloads)

B) No — skip the resiliency baseline (suitable for PoCs, prototypes, and experimental projects)

X) Other (please describe after [Answer]: tag below)

[Answer]: X — Deferred until implementation tasks begin. Documentation phase only.

---

## Question 11 — Property-Based Testing Extension

Should property-based testing (PBT) rules be enforced for this project?

A) Yes — enforce all PBT rules as blocking constraints (recommended for projects with business logic, data transformations, serialization, or stateful components)

B) Partial — enforce PBT rules only for pure functions and serialization round-trips

C) No — skip all PBT rules (suitable for simple CRUD applications, UI-only projects, or thin integration layers)

X) Other (please describe after [Answer]: tag below)

[Answer]: X — Deferred until implementation tasks begin. Documentation phase only.

---

## Question 12 — User Stories

Should the **User Stories** phase be included in the AI-DLC workflow for this work?

A) Yes — include User Stories (recommended for user-facing features)

B) No — skip User Stories and proceed to Workflow Planning after Requirements

C) Decide later based on raised requirements

D) Other (please describe after [Answer]: tag below)

[Answer]: B — Documentation-only phase; user stories are not applicable until a concrete implementation task is defined.

---

**Status**: Answered on 2026-07-09T19:42:00Z
