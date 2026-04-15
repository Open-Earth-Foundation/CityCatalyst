---
name: pr-review-gate
description: Review pull requests for high-impact issues only. Use when the user asks to review a PR, especially requests like "do a review of PR <id>", "review PR <id>", or "PR review". Focus on security, repository conventions, reuse over reimplementation, structure consistency, and unnecessary complexity. Return only actionable comments worth changing.
---

# pr-review-gate

Use this skill when the user asks for a PR review.

## Primary objective

Find only issues that are truly worth changing before merge.

- Score each potential issue on a 1-10 impact scale.
- Report only issues scored `>=7`.
- Skip low-value style nits and speculative suggestions.

## Review scope

Review the PR against these points:

1. Security issues
2. Alignment with `AGENTS.md` guidelines where they make sense
3. Existing repository structure is followed
4. No unnecessary reimplementation of existing functionality (for example re-creating a utility that already exists)
5. Complexity is reasonable; flag only truly over-complex code that should be simplified

Important nuance:
- `AGENTS.md` is general guidance. Controlled deviations are allowed when justified by context.
- If code deviates from `AGENTS.md`, check whether the deviation is intentional and sensible before flagging it.

### Security must-check list

For every PR review, always check at least:
- authentication and authorization correctness
- secrets exposure (hardcoded secrets, leaked tokens/keys, unsafe logging of secrets)
- injection risks (SQL/command/template/query injection vectors)
- unsafe deserialization or unsafe dynamic code execution patterns
- permission and access-control checks on sensitive operations

## Workflow

1. Identify PR context

- If a PR number or URL is provided, inspect that PR diff and files changed.
- If only branch/diff context is available, review the effective change set.

### PR data source requirement

- For PR inspection, use the GitHub MCP server connection (`user-github`) tooling.
- Do not use GitHub CLI (`gh`) for reading PR data in this workflow.
- Before calling an MCP tool, first read that MCP tool schema/descriptor and then call it with the required parameters.
- If MCP access is unavailable, report that as a blocker instead of silently switching to `gh`.

2. Evaluate each finding candidate

For each candidate issue, assign:
- `impact` (1-10): how important it is to fix before merge
- `confidence` (high/medium/low): how sure you are from available evidence

Only keep candidates with:
- `impact >= 7`, and
- sufficient evidence in the diff/code context

Tests/regression check rule:
- Evaluate missing tests or regression risk only for high-impact changes (for example security-sensitive logic, permission checks, critical business logic, or data integrity paths).
- Do not request tests for low-impact refactors or minor non-critical edits.

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
- Keep `comment` concise (1-3 sentences).
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
- Favor maintainability and security over personal style.
- Prefer existing utilities/helpers over introducing duplicate logic.
