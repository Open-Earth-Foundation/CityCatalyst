# GHGI Upload AI — Optimization MVP — Requirement Verification Questions

**Created**: 2026-07-14T02:05:00Z  
**Document Language**: English  
**Stage**: Requirements Analysis (Optimization MVP)  
**Prerequisite**: Baseline gate PASSED (`ghgi-upload-ai-baseline-measurement-plan.md`, OpenRouter session 2026-07-14T02:00Z)

**Instructions**: Fill each `[Answer]:` tag (option letter and/or short note). Save the file or paste answers in chat.

---

## Baseline context (do not re-answer)

| Metric | F3 Path B | F4 Path B | F5 Path C | F0 control |
|--------|-----------|-----------|-----------|------------|
| M2 AI wall-clock | ~12.2 s | ~12.3 s | ~7.5 s | n/a |
| LLM calls | 2 (interpret + shape) | 2 | 1 (extract) | 0 |
| Shape/extract chunks | 1 | 1 | 1 | — |
| Tokens (approx) | ~5937 | ~5810 | ~3966 | — |
| Outcome | waiting_for_approval, 4 rows | same | same | 74 rows, ~4.1 s |

**Implication**: Current fixtures do **not** stress multi-chunk sequential loops (H1). Path B still pays **two** sequential LLM calls (H2). Path B has no progress UX (H3).

---

## Question 1
What is the **primary success goal** for this Optimization MVP?

A) Reduce Path B / Path C wall-clock (M2) on the measured fixtures and similar small files

B) Reduce LLM cost / token usage (M6) with acceptable latency

C) Improve UX (especially Path B progress / perceived wait) more than raw latency

D) Correctness / scale readiness (e.g. raise shape chunk caps, avoid truncation on large tables) even if small-fixture M2 barely changes

E) Balanced package: pick a small set spanning latency + UX + correctness (specify priorities in answer)

X) Other (please describe after [Answer]: tag below)

[Answer]: E

---

## Question 2
Which **paths** are in scope for MVP Construction?

A) Path B only (tabular interpret / shape)

B) Path C only (PDF extract)

C) Path B and Path C

D) Frontend/UX only (no backend LLM loop changes)

X) Other (please describe after [Answer]: tag below)

[Answer]: C

---

## Question 3
Given baseline `chunkCount=1` on F3/F4/F5, what should MVP do about **parallel chunk processing**?

A) Out of MVP — defer until we have a large multi-chunk fixture and measured H1

B) In MVP anyway (implement parallelization + add/obtain a large fixture to prove gains)

C) In MVP only as a guarded feature flag, validated later

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 4
Which **backend** change candidates are in MVP? (Choose one package.)

A) **Merge / reduce Path B LLM calls** (e.g. combine interpret+shape where safe) — highest leverage on measured F3/F4 (~2 calls → fewer)

B) **Prompt / maxTokens / timeout / retry tuning** only (no structural loop changes)

C) **Raise or make adaptive `MAX_TABLE_SHAPE_CHUNKS`** + progress reporting for Path B

D) **A + C** (fewer calls on small files + safer large-file shaping / progress)

E) **B + Path B progress UX only** (minimal backend)

X) Other (please describe after [Answer]: tag below)

[Answer]: D

---

## Question 5
Is **Path B interpret progress UX** (parity with Path C `extractionProgress`) in MVP?

A) Yes — required for MVP acceptance

B) Yes — nice-to-have if time allows; not blocking

C) No — separate ticket after MVP

X) Other (please describe after [Answer]: tag below)

[Answer]: B

---

## Question 6
What **acceptance bar** should after-change runs meet vs baseline (same fixtures, OpenRouter, gains table)?

A) Any clear improvement on M2 or M6 with no rowCount/status regressions

B) ≥20% M2 reduction on F3 and F4 (Path B); Path C hold or improve

C) ≥20% M6 (tokens) reduction on F3/F4 with M2 not worse than +10%

D) Qualitative UX acceptance (progress) + no functional regressions; latency optional

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 7
Should we **add a larger stress fixture** (multi-chunk Path B and/or Path C) before or as part of MVP?

A) Yes — required before Construction (measure multi-chunk baseline first)

B) Yes — add during MVP Construction and use for gains validation

C) No — MVP ships against current F0–F5 only

X) Other (please describe after [Answer]: tag below)

[Answer]: B

---

## Question 8
Should **User Stories** stage run for this MVP?

A) Skip — engineer-facing performance/UX tweak; requirements + gains table enough

B) Execute briefly — one persona (city inventory admin) + Path B wait/progress story

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 9
**Non-goals** for MVP (confirm or adjust):

Proposed non-goals: change Path A/near-eCRF; change approve empty-inventory 409 rule; provider migration (OpenRouter already in use); full rewrite of prompts/taxonomy; measurement instrumentation service (unless gaps block gains table).

A) Accept proposed non-goals as-is

B) Adjust — list additions/removals after [Answer]:

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 10 — Security Extensions
Should security extension rules be enforced for this Optimization MVP?

A) Yes — enforce all SECURITY rules as blocking constraints (recommended for production-grade applications)

B) No — skip all SECURITY rules (suitable for PoCs, prototypes, and experimental projects)

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 11 — Resiliency Extensions
Should the resiliency baseline be applied for this Optimization MVP?

A) Yes — apply as directional best practices and design-time guidance

B) No — skip the resiliency baseline

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 12 — Property-Based Testing Extension
Should property-based testing (PBT) rules be enforced for this Optimization MVP?

A) Yes — enforce all PBT rules as blocking constraints

B) Partial — enforce PBT only for pure functions and serialization round-trips

C) No — skip all PBT rules

X) Other (please describe after [Answer]: tag below)

[Answer]: B

---

## After you answer

Reply in chat when the `[Answer]:` fields are filled (or paste answers). Requirements Analysis will then produce `ghgi-upload-ai-optimization-mvp-requirements.md` — still **no** optimization application code until that requirements doc is approved.
