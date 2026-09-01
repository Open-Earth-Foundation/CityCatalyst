---
name: dev-pr-review-gate
description: Review pull requests for high-impact issues only. Use when the user asks to review a PR, especially requests like "do a review of PR <id>", "review PR <id>", or "PR review". Evaluate security, AGENTS.md alignment, repository structure, reuse over reimplementation, complexity, and regression risk. Return only actionable comments worth changing.
---

# pr-review-gate

Use this skill when the user asks for a PR review.

## Primary objective

Find only issues that are truly worth changing before merge.

- Score each potential issue on a 1-10 **impact** scale (see scoring rubric below).
- Report only issues scored `>=7`.
- Skip low-value style nits and speculative suggestions.

## Review scope

Review the PR holistically against these dimensions. Every dimension can surface findings.

1. **Security** — authn/authz, secrets, injection, unsafe deserialization, access control on sensitive operations
2. **AGENTS.md alignment** — conventions and patterns in the relevant package's `AGENTS.md` (for example `hiap/AGENTS.md`, `climate-advisor/AGENTS.md`, `app/AGENTS.md`)
3. **Repository structure** — files in the right place, naming matches conventions, imports follow package rules (absolute imports in Python services; `@/` alias in `app/`)
4. **Reuse over reimplementation** — no duplicate utilities, helpers, or patterns when an existing one should be extended
5. **Complexity** — flag over-complex code that should be simplified before merge
6. **Regression risk** — whether changed code can break existing behavior, degrade output quality, or harm downstream consumers without adequate guardrails

Important nuance:
- `AGENTS.md` is general guidance. Controlled deviations are allowed when justified by context.
- If code deviates from `AGENTS.md`, check whether the deviation is intentional and sensible before flagging it.
- A convention violation that also risks regression should score higher than a cosmetic deviation alone.

### Security must-check list

For every PR review, always check at least:
- authentication and authorization correctness
- secrets exposure (hardcoded secrets, leaked tokens/keys, unsafe logging of secrets)
- injection risks (SQL/command/template/query injection vectors)
- unsafe deserialization or unsafe dynamic code execution patterns
- permission and access-control checks on sensitive operations

### Regression assessment (scoped to the diff)

Do **not** run a fixed checklist on every PR. Regression review applies only to **surfaces the PR actually touches**.

1. **Identify affected surfaces** from the diff — for example:
   - FastAPI routes or service logic (`hiap/`, `hiap-meed/`, `climate-advisor/`, `global-api/`)
   - prompts, retrieval, embeddings, or model/inference config
   - scoring, ranking, or feature-engineering pipelines
   - database migrations, seed data, or persistence layers
   - shared utilities imported by multiple callers
   - HTTP clients or payloads between services
   - Next.js API routes or backend services in `app/` (when the diff is there)

2. **Apply the relevant lenses** for those surfaces only:

| Surface touched | What to look for |
|-----------------|------------------|
| **ML / LLM / RAG** | Worse retrieval (chunking, top-k, filters), prompt drift, model or temperature changes, token budget blow-up, dropped context, ranking/scoring formula changes, regression in accuracy metrics (F1, precision/recall, NDCG, etc.) |
| **Backend / API logic** | Changed request/response contracts, status codes, validation rules, error handling, authz gates, calculation or aggregation logic |
| **Data & persistence** | Irreversible migrations, schema changes without `down()`, bulk transforms, seed changes that alter production-like data |
| **Shared code & integrations** | Refactored helpers with missed call sites; changed defaults or edge-case handling; sibling-service URL/payload/schema mismatches |
| **Client / UI** (only if diff includes it) | Broken API assumptions, stale cache invalidation, removed i18n keys, shared component contract changes |

3. **Prioritize backend and quality regressions** — accuracy, correctness, and service behavior matter more than cosmetic or structural nits. A prompt tweak that silently degrades retrieval is as review-worthy as a breaking API change.

When regression risk is plausible but unproven, lower **confidence** rather than inflating impact without evidence. When the diff clearly changes behavior on a critical path and lacks guardrails (tests, reversible migrations, eval/benchmark evidence, or backward-compatible handling), score impact accordingly.

## Impact scoring rubric (1-10)

Use this rubric so security, conventions, and regression are scored consistently:

| Score | Typical meaning |
|-------|-----------------|
| 9-10 | Critical security flaw, data loss/corruption risk, near-certain production regression, or strong evidence of degraded model/LLM output on a critical path |
| 7-8 | Likely regression or meaningful security/convention violation that should fix before merge; important behavior or quality change without adequate guardrails |
| 4-6 | Possible concern in an unaffected or low-risk area — note internally, do **not** report (below threshold) |
| 1-3 | Style, preference, or speculative issue — skip |

**Regression amplifies impact.** Examples (mix of Python and `app/`):
- `climate-advisor/`: retrieval `top_k` lowered or reranker removed with no eval note → 7+ if recall/precision likely drops
- `hiap/` or `hiap-meed/`: scoring weights or feature normalization changed without benchmark comparison → 8+
- `global-api/`: response field renamed on an endpoint consumed by `app/` or other services → 8+ if callers not updated
- Shared Python utility renamed with call sites missed in the diff → 8+
- `app/`: permission or validation tightened/loosened on an inventory or emissions path → 7–9 depending on blast radius
- Pure refactor with identical behavior and existing coverage → usually below 7 unless evidence says otherwise

## Workflow

1. Identify PR context

- If a PR number or URL is provided, inspect that PR diff and files changed.
- If only branch/diff context is available, review the effective change set.
- Read the relevant package `AGENTS.md` for each area the diff touches.

### PR data source requirement

- For PR inspection, use the GitHub MCP server connection (`user-github`) tooling.
- Do not use GitHub CLI (`gh`) for reading PR data in this workflow.
- Before calling an MCP tool, first read that MCP tool schema/descriptor and then call it with the required parameters.
- If MCP access is unavailable, report that as a blocker instead of silently switching to `gh`.

2. Evaluate each finding candidate

For each candidate issue, assign:
- `impact` (1-10): how important it is to fix before merge, using the rubric above (include regression severity)
- `confidence` (high/medium/low): how sure you are from available evidence

Only keep candidates with:
- `impact >= 7`, and
- sufficient evidence in the diff/code context

When assessing regression:
- Limit scope to surfaces present in the diff; do not invent risks in untouched packages.
- For shared or imported code, trace callers when the diff is small enough.
- Prefer concrete failure modes ("reranker skip may return irrelevant chunks") over vague "might break".
- Do not demand new tests for every change; **do** raise impact when a critical behavior or quality change has no plausible safety net.

3. De-duplicate and tighten

- Merge overlapping findings into one clear comment.
- Keep each comment short and concrete.
- Prefer "what is wrong + why it matters + minimal fix direction".

4. Output paste-ready review comments

Return comments in a compact format that can be pasted directly into PR review tools.

## Output format (required)

If there are findings, output:

```markdown
- file: path/to/file.py
  line: 123
  severity: 8/10
  comment: Short actionable comment describing the issue and why it should be changed.
```

Rules:
- Use one bullet per finding.
- Include exact `file` and `line`.
- Keep `comment` concise (1-3 sentences); mention regression or security impact when that is the main reason for the score.
- Do not include praise, summaries, or optional nits in this section.
- Return at most 5 findings, choosing the highest-impact items (`impact >= 7`) first.
- No false precision for line numbers: if exact line is unclear from diff context, use the nearest changed line and write `line: near <number>`.

If there are no findings with `impact >= 7`, output exactly:

```markdown
No review comments above 7/10 impact.
```

## Review guardrails

- Do not request changes without evidence in the code/diff.
- Do not invent missing context; state uncertainty and skip if not strong enough.
- Do not review regression in code paths the PR did not touch.
- Favor maintainability, security, and regression safety over personal style.
- Prefer existing utilities/helpers over introducing duplicate logic.
- Do not file drive-by refactors or "add tests everywhere" requests unless the change introduces high regression risk on a touched critical path.
