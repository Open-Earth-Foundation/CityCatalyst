# GHGI Upload AI — Baseline Questions (Q1–Q5)

**Created**: 2026-07-14T01:10:00Z  
**Status**: Defaults applied (user approved Level 1 without explicit answers)  
**Override**: Edit `[Answer]:` lines and re-approve requirements if needed

---

## Question 1
Who will execute fixture runs after the measurement docs are approved?

A) Same engineer / this agent session with local Docker

B) Separate QA / eng later; docs only for now

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 2
For Path B/C, acceptable number of full LLM runs per fixture for baseline?

A) 1 (cheap, noisier)

B) 3 (recommended)

C) Defer AI runs until instrumentation lands; fill controls only first

X) Other (please describe after [Answer]: tag below)

[Answer]: B (minimum 1 if budget-constrained; note actual N in results)

---

## Question 3
Instrumentation preference if stopwatch + DB timestamps + debug logs are insufficient?

A) Prefer a small measurement-only instrumentation Requirements slice before any AI optimization

B) Exhaust manual methods first; only then consider instrumentation

C) Skip instrumentation forever; accept coarse wall-clock only

X) Other (please describe after [Answer]: tag below)

[Answer]: B

---

## Question 4
Treat “add interpret progress like Path C” as:

A) In scope for optimization MVP (after gate)

B) Separate UX ticket later

C) Out of scope for this initiative

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 5
Extension opt-in for this task cycle?

A) Keep Security / Resiliency / PBT deferred until optimization Requirements

B) Re-evaluate now

X) Other (please describe after [Answer]: tag below)

[Answer]: A
