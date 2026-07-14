# GHGI Upload AI — Optimization MVP Requirements

**Project**: CityCatalyst (Brownfield)  
**Created**: 2026-07-14T02:12:00Z  
**Status**: Approved 2026-07-14T02:13:00Z  
**Document Language**: English  
**Questions**: `ghgi-upload-ai-optimization-mvp-questions.md` (answered)  
**Baseline**: OpenRouter session 2026-07-14T02:00Z — gate PASSED  
**UI SoT**: [Notion — GHGI Upload Inventory — Import Flow Architecture](https://app.notion.com/p/openearth/39ceb557728b80a4a858faff4f6c59e2)

---

## 1. Intent Analysis

| Attribute | Assessment |
|-----------|------------|
| **User request** | Improve Path B / Path C of GHGI “Upload Existing Inventory” after measured baseline |
| **Request type** | Enhancement (performance, cost, correctness readiness, optional UX) |
| **Scope** | Multiple components in `app/` — `interpret` / `extract` routes, AI services, optional import UI progress |
| **Complexity** | Moderate |
| **Requirements depth** | Standard |

### Priorities (synthesized from Q1=E + Q4=D + Q5=B)

1. **Reduce Path B sequential LLM calls** (interpret + shape → fewer calls where safe) — primary lever on measured F3/F4 (~12 s, 2 calls, ~5.8–5.9k tokens).  
2. **Safer large-file shaping**: adaptive / raised `MAX_TABLE_SHAPE_CHUNKS` + **backend** progress signals for Path B.  
3. **Path C in scope**: hold or improve vs baseline; no parallel-chunk work in MVP; exercise with a new multi-chunk stress fixture during Construction.  
4. **Path B progress UX** (parity with Path C): **nice-to-have**, not blocking acceptance.

### Explicitly deferred (Q3=A)

- Parallel LLM chunk processing (Path B shape or Path C extract) until a multi-chunk baseline exists and H1 is measured.

---

## 2. Answers Summary

| # | Topic | Answer |
|---|--------|--------|
| Q1 | Primary goal | **E** Balanced (latency + UX + correctness) |
| Q2 | Paths | **C** Path B and Path C |
| Q3 | Parallel chunks | **A** Out of MVP |
| Q4 | Backend package | **D** Reduce Path B calls **+** adaptive/raise shape chunks + Path B progress reporting |
| Q5 | Path B progress UX | **B** Nice-to-have |
| Q6 | Acceptance | **A** Clear M2 or M6 gain; no rowCount/status regressions |
| Q7 | Stress fixture | **B** Add during Construction; use for gains validation |
| Q8 | User Stories | **A** Skip |
| Q9 | Non-goals | **A** Accept as proposed |
| Q10 | Security | **A** Enforce |
| Q11 | Resiliency | **A** Apply directional baseline |
| Q12 | PBT | **B** Partial (pure functions + serialization round-trips) |

---

## 3. Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-O1 | Path B MUST reduce the number of sequential LLM round-trips for typical small/medium tabular imports versus baseline (today: `interpretTabular` then ≥1 `shapeTable*` call), without changing the user-visible state machine (`pending_ai_interpretation` → `waiting_for_approval` / `failed`). |
| FR-O2 | Path B MUST expose per-chunk (or per-phase) progress in a form consumable by status polling (analogous to Path C `mappingConfiguration.extractionProgress`), even if the UI does not yet render it. |
| FR-O3 | Path B shape chunking MUST support more than the current hard cap behavior in a **safe** way (raise and/or make adaptive `MAX_TABLE_SHAPE_CHUNKS`), and MUST NOT silently drop remaining rows without a logged warning and/or surfaced error/warning in import status. |
| FR-O4 | Path C remains in MVP: behavior MUST hold or improve vs baseline F5 (status, rowCount quality). No parallel extract chunks in this MVP. |
| FR-O5 | Construction MUST add at least one **multi-chunk stress fixture** (Path B and/or Path C) under `app/tmp-import-fixtures/`, measure it once as extended baseline, and include it in after-change gains runs. |
| FR-O6 | Path B progress **UI** (ImportPage) SHOULD be implemented if low-cost once FR-O2 exists; MVP may ship without it (Q5=B). |
| FR-O7 | After-change protocol MUST fill the gains table in `ghgi-upload-ai-baseline-measurement-plan.md` for F3, F4, F5, F0 (control), plus the new stress fixture. |
| FR-O8 | Approve empty-inventory rule, Path A / near-eCRF deterministic paths, and OpenRouter provider choice MUST remain unchanged. |

---

## 4. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-O1 | **Acceptance (Q6=A):** At least one of M2 (wall-clock) or M6 (tokens) shows a **clear improvement** on F3 and/or F4 vs OpenRouter baseline; F5 M2/M6 hold or improve; **no** regressions in terminal success (`waiting_for_approval`) or unexplained `rowCount` drops on those fixtures. |
| NFR-O2 | Control F0 M1 MUST remain same order of magnitude (sanity; no AI path side effects). |
| NFR-O3 | Failures MUST continue to end in `failed` with actionable `errorLog` (no indefinite `pending_ai_*` after a hard extract/interpret error) — addresses baseline hang class on extract 400. |
| NFR-O4 | Structured logging MUST retain/improve correlation via `importedFileId`; MUST NOT log full file contents or API keys (Security). |
| NFR-O5 | LLM timeout/retry behavior MUST remain configurable via existing env (`LLM_TIMEOUT_MS`, `LLM_MAX_RETRIES`); document any intentional changes in gains notes. |
| NFR-O6 | New pure helpers (chunk sizing, progress payload shape, row-merge) SHOULD have example-based Jest tests; Partial PBT applies to pure functions / serialization round-trips (PBT-02/03/07/08/09). |

---

## 5. Non-Goals (confirmed)

- Changing Path A eCRF or Adapter D near-eCRF logic (except as measurement controls)
- Changing approve HTTP 409 empty-inventory rule
- Provider migration (OpenRouter already configured)
- Full rewrite of GPC prompts / taxonomy
- Measurement-only instrumentation service (unless gains table cannot be filled)
- Parallel chunk LLM execution (deferred)

---

## 6. Extension Configuration

| Extension | Enabled | Mode | Notes for this MVP |
|-----------|---------|------|--------------------|
| Security Baseline | **Yes** | Full blocking | Preserve auth on import routes; no secrets/PII dumps in logs; do not weaken upload validation |
| Resiliency Baseline | **Yes** | Directional | Apply to LLM failure modes, timeouts, status transitions; **org-level** DR/CI/RTO decisions → use **existing** CityCatalyst / GitHub Actions practices (**N/A** to redesign in this slice) |
| Property-Based Testing | **Yes** | **Partial** | Enforce PBT-02, PBT-03, PBT-07, PBT-08, PBT-09 only |

---

## 7. Proposed Construction Units (preview — finalize in Workflow Planning)

| Unit | Focus |
|------|--------|
| U1 | Path B LLM call reduction (`interpret/route.ts`, `AIInterpretationService`) |
| U2 | Path B adaptive shape chunks + progress persistence + fail-closed status |
| U3 | Path C hold/harden (status on extract errors) + multi-chunk stress fixture(s) |
| U4 | Optional: ImportPage Path B progress UX (if FR-O6 pursued) |
| U5 | Re-measure + fill gains table |

User Stories stage: **SKIP** (Q8=A).

---

## 8. Traceability to Hypotheses

| Hypothesis | MVP action |
|------------|------------|
| H1 sequential chunks | Deferred (no parallel); stress fixture prepares future measurement |
| H2 interpret + shape | **Address** via FR-O1 |
| H3 Path B progress | Backend required (FR-O2); UI optional (FR-O6) |
| H4 tokens/timeouts | Secondary; M6 improvement counts toward NFR-O1 |
| H5 thin tests / 409 | Tests for new helpers; 409 unchanged |

---

## 9. Success Criteria

- [ ] FR-O1–FR-O5 implemented and reviewed  
- [ ] Gains table filled; NFR-O1 met  
- [ ] Extensions respected (security logging/auth; resiliency on failure paths; partial PBT where applicable)  
- [ ] No optimization merged without before/after evidence in the measurement plan  

---

## 10. Next Stage After Approval

1. Workflow Planning for Optimization MVP (execution plan / units)  
2. Application Design only if U1–U3 need new component boundaries (likely light / per-unit Functional Design in Construction)  
3. Construction per unit → re-measure → gains table  

**No application optimization code** until this requirements document is approved.

---

## Approval record

Approved 2026-07-14 — proceed to Workflow Planning / Construction per execution plan.
