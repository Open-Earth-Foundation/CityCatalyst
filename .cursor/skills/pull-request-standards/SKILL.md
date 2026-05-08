---
name: pull-request-standards
description: Create or update pull requests with repository-derived context and concise title/body standards. Use when creating, updating, automating, drafting, or polishing PRs, or preparing GitHub PR tool payloads.
---

# Pull Request Standards

Use this skill whenever the user asks to create, update, automate, draft, or polish a pull request.

## Role

Act as a PR author who keeps pull request metadata accurate, short, and useful for reviewers.

## Task

Create a new PR or update an existing PR title/body from repository context. Do not paste full diffs, long prose, or generic checklists unless the project explicitly requires them.

## Input

Derive context instead of asking by default:

- **Owner and repo:** `git remote get-url origin`
- **Head branch:** `git rev-parse --abbrev-ref HEAD`
- **Base branch:** `git symbolic-ref refs/remotes/origin/HEAD` (extract the branch after `origin/`)
- **Commit context:** `git log origin/<base>..HEAD --oneline -20`
- **Detailed commit context when useful:** `git log origin/<base>..HEAD --pretty=format:"%s%n%b" -20`

If the user provides an explicit base, head, PR number, draft setting, title, or body requirement, use it.

## Output

### Title

- One line, about 72 characters or fewer.
- State what the PR does, not how it was implemented.
- Prefix with a ticket ID when the branch or work is tied to one, for example `ON-123: Short feature name`.
- Prefer imperative wording: `Add`, `Fix`, `Update`, `Align`.

Examples:

- `Fix inventory API null path handling`
- `Add regression tests for session expiry`
- `ON-1234: Align export job with new schema`

### Body

Keep the body short and concise. Prefer this structure:

1. **Summary** (1-3 sentences): What this PR does and why.
2. **Changes** (optional): Bullet list of main changes, only if it adds clarity.
3. **Commits** (optional): Short commit subject list when drafting from history.

Example:

```markdown
## Summary

Briefly states the user-visible outcome and motivation.

## Changes

- Touched area A
- Touched area B

## Commits (3)

- fix: handle null path in inventory API
- test: add regression coverage
- docs: clarify export limits
```

## Create Or Update Workflow

1. Derive `owner`, `repo`, `head`, and `base` from git state.
2. Check whether a PR already exists for the branch.
3. Inspect commits between `origin/<base>` and `HEAD`.
4. Draft a concise title and body using the standards above.
5. Create a PR when none exists, or update the existing PR when one exists or when the user asks to update.
6. Return the PR URL and summarize only the metadata changed.

## GitHub Tool Guidance

- Use GitHub MCP first for PR create/update operations.
- Before calling a GitHub MCP tool, read its schema/descriptor and follow the required parameters.
- If GitHub MCP is unavailable, unauthenticated, or not configured for the needed operation, fall back to the `gh` CLI.
- If both GitHub MCP and `gh` fail, stop and report the attempted paths, the relevant error, and the next action needed from the user.
- For creation, pass derived `owner`, `repo`, `head`, `base`, `title`, `body`, and draft mode when requested.
- For updates, first identify the existing PR by branch or user-provided PR number, then update only the requested or generated metadata.
- Preserve existing PR body sections that are clearly hand-authored and still relevant. Replace stale generated summaries, changes, or commit lists.
- If the branch is missing remotely, report that clearly and ask whether to push unless the user already requested a push.

## Push Policy

- Assume the branch is already pushed when the user only asks to create or update PR metadata.
- Do not run `git push` or `git push -u` unless the user explicitly asks.
- When push is explicitly requested, use the minimal push needed and continue the PR operation after push succeeds.
