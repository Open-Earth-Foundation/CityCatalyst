# GHGI Upload AI — Baseline Measurement Requirements

**Project**: CityCatalyst (Brownfield)
**Task**: GHGI “Upload Existing Inventory” — Path B / Path C improvement (measurement-first)
**Created**: 2026-07-14T01:10:00Z
**Status**: Approved 2026-07-14T01:15:00Z — baseline fixture execution authorized
**Document Language**: English
**Parent plan**: `aidlc-docs/inception/plans/ghgi-upload-ai-baseline-level-1-plan.md` (Approved 2026-07-14)
**UI / orchestrator SoT**: [Notion — GHGI Upload Inventory — Import Flow Architecture](https://app.notion.com/p/openearth/39ceb557728b80a4a858faff4f6c59e2)

---

## 1. Intent

Improve latency, cost, reliability, and progress UX of **AI import paths** (Path B tabular interpret, Path C PDF extract) in the existing 3-step onboarding wizard.

**This Requirements document covers only the measurement baseline phase.** Optimization MVP requirements are **out of scope** until the baseline gate passes (see §8).

---

## 2. Scope

### In scope (this phase)

| Item | Notes |
|------|--------|
| Formal metrics for Path B and Path C | Wall-clock, chunk count, outcome, cost proxies |
| Fixed fixture matrix | `app/tmp-import-fixtures/` |
| Run protocol + empty results / gains tables | See measurement plan |
| Non-AI controls (Path A eCRF, near-eCRF Adapter D) | Comparison only — not optimization targets |
| Gate checklist before optimization Construction | Mandatory |
| Optional measurement-only instrumentation Requirements | Separate slice **if** manual capture is insufficient |

### Out of scope (this phase)

| Item | Notes |
|------|--------|
| Parallel chunk processing | Optimization — blocked |
| Prompt / model / `maxTokens` / retry / timeout changes | Optimization — blocked |
| Raising `MAX_TABLE_SHAPE_CHUNKS` | Optimization — blocked |
| Path B per-chunk progress UX | Optimization MVP candidate — after gate |
| Changing approve empty-inventory rule | Not a performance goal |
| Recreating monorepo reverse engineering | Reuse existing `aidlc-docs/inception/` |

### Application code

- **Forbidden** in this phase: optimization code.
- **Conditional later**: measurement-only instrumentation code — only after a dedicated Requirements slice is approved (not this document alone).

---

## 3. Clarifying Answers (Level 1 Q1–Q5)

User approved Level 1 without explicit Q1–Q5 answers. **Recommended defaults applied** (override anytime before baseline runs):

| # | Topic | Default applied |
|---|--------|-----------------|
| Q1 | Run ownership | **A** — Same engineer / agent session with local Docker |
| Q2 | AI run budget | **B** — Up to **3** full LLM runs per Path B/C fixture when cost allows; minimum **1** if budget-constrained (note in results) |
| Q3 | Instrumentation | **B** — Exhaust stopwatch + DB timestamps + existing debug logs first; then measurement-only instrumentation Requirements if gaps remain |
| Q4 | Path B progress UX | **A** — Candidate for **optimization MVP after gate** (not this phase) |
| Q5 | Extensions | **A** — Security / Resiliency / PBT remain **deferred** until optimization Requirements |

Record file: `aidlc-docs/inception/requirements/ghgi-upload-ai-baseline-questions.md`

---

## 4. Functional Requirements (Measurement Phase)

| ID | Requirement |
|----|-------------|
| FR-M1 | A written run protocol MUST define environment, empty-inventory precondition, fixture order, and recording fields. |
| FR-M2 | Baseline results MUST be recorded for at least one Path B fixture (F3 and/or F4) and Path C (F5). |
| FR-M3 | At least one non-AI control (F0 and/or F1/F2) MUST be recorded in the same environment for comparison. |
| FR-M4 | Each result row MUST include path, fixture ID, terminal `importStatus`, `rowCount` (if any), wall-clock segments, and notes (errors, truncation suspicion). |
| FR-M5 | Hypotheses document MUST remain labeled as code-backed hypotheses, not measured claims, until metrics support them. |
| FR-M6 | Gains table template MUST exist before any optimization; cells filled only after post-change re-runs. |
| FR-M7 | If required metrics cannot be observed manually, a **measurement-only instrumentation** Requirements slice MUST be written and approved before shipping instrumentation — still before optimization. |

---

## 5. Non-Functional Requirements (Measurement Phase)

| ID | Requirement |
|----|-------------|
| NFR-M1 | Baseline runs MUST use an **empty** inventory (approve returns HTTP 409 if inventory already has `InventoryValue` data). |
| NFR-M2 | Environment (OS, app/DB setup, `LLM_MODEL` / provider if known, date) MUST be noted once per results session. |
| NFR-M3 | Wall-clock SHOULD be captured with both human stopwatch and DB `created` / `lastUpdated` / `completedAt` when available. |
| NFR-M4 | Token/cost SHOULD be recorded when provider or app logs expose them; if unavailable, mark `N/A` and list as instrumentation gap. |
| NFR-M5 | Documentation language: English. |

---

## 6. Path Definitions (Reuse)

| Path | User-visible status after upload | API | LLM |
|------|----------------------------------|-----|-----|
| A eCRF | Often `waiting_for_approval` | `POST .../import` | No |
| D near-eCRF | Often `waiting_for_approval` | `POST .../import` | No |
| B tabular AI | `pending_ai_interpretation` → `POST .../interpret` | Yes | Yes |
| C PDF AI | `pending_ai_extraction` → `POST .../extract` | Yes | Yes |

Frontend: Notion state machine + `usePollUntil` (3s) + RTK endpoints.

---

## 7. Fixture Matrix

| ID | File | Role |
|----|------|------|
| F0 | `01-near-ecrf-BR-RIO-2022.csv` | Control — near-eCRF (prior: 74 rows → `waiting_for_approval`) |
| F1 | `02-ecrf-template.xlsx` | Control — Path A template |
| F2 | `06-ecrf-minimal-filled.xlsx` | Control — Path A minimal filled |
| F3 | `03-path-b-long-tidy-2022.csv` | Path B — tidy multi-row tabular |
| F4 | `04-path-b-wide-year.csv` | Path B — wide year shape |
| F5 | `05-path-c-sample-inventory.pdf` | Path C — PDF extract |

Details and protocol: `ghgi-upload-ai-baseline-measurement-plan.md`.

---

## 8. Baseline Gate (Blocks Optimization Construction)

Optimization Construction (parallelism, prompts, caps, Path B progress UX, etc.) may start only when:

1. This requirements doc + measurement plan + hypotheses + task execution plan are **approved**
2. Baseline **results** table is **filled** for Path B (F3 and/or F4) and Path C (F5)
3. At least one non-AI control is recorded
4. Environment is noted
5. Hypotheses remain correctly labeled until validated
6. **Optimization MVP** Requirements Analysis is completed and approved
7. If metrics were insufficient: measurement-only instrumentation Requirements approved, shipped, and baseline **re-run** completed

---

## 9. Success Criteria (This Phase)

- [ ] Protocol and empty baseline / gains tables ready to fill
- [ ] Explicit gate checklist in execution plan + `aidlc-state.md`
- [ ] No optimization or instrumentation application code shipped under this phase
- [ ] Next action after doc approval: run baseline on fixtures **or** approve instrumentation Requirements if capture gaps are already certain

---

## 10. Traceability

| User goal | Artifact |
|-----------|----------|
| Evidence before improvements | This doc + measurement plan |
| Empty gains table | Measurement plan § Gains |
| Hypotheses not treated as facts | `ghgi-upload-ai-bottlenecks-hypotheses.md` |
| Workflow / forbidden work | `ghgi-upload-ai-task-execution-plan.md` |
