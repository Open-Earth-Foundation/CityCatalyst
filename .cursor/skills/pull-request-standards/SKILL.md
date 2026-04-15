---
name: pull-request-standards
description: Create pull requests with repository-derived context, concise title/body standards, and GitHub MCP execution steps. Use when creating or automating a PR, generating PR title/body text, or preparing `create_pull_request` payloads.
---

# Pull Request Standards

Use this skill whenever the user asks to create, automate, draft, or polish a pull request.

## Derive context from the repository

Do not ask for owner, repo, or base branch by default. Derive them:

- **Owner and repo:** `git remote get-url origin`
- **Head branch:** `git rev-parse --abbrev-ref HEAD`
- **Base branch:** `git symbolic-ref refs/remotes/origin/HEAD` (extract branch name after `origin/`)

Use these values in GitHub MCP `create_pull_request`.

## PR title rules

- Keep title to one line and about 72 characters or fewer.
- State what the PR does, not how it was implemented.
- Prefix with ticket ID when branch/work is tied to one (for example `ON-5396: ...`).
- Prefer imperative wording: `Add`, `Fix`, `Update`.

Examples:

- `ON-5396: MEED high-level implementation - pipeline and architecture`
- `Fix inventory API null path handling`
- `Add version history tests`

## PR body rules

Keep the body short and practical:

1. **Summary** (1-3 sentences): What changed and why.
2. **Changes** (optional): Bullet list of key changes if helpful.
3. **Commits** (optional): Short commit subject list, commonly from `git log origin/<base>..HEAD --oneline`.

Avoid pasting full diffs and avoid generic checklists unless explicitly requested by project standards.

Example:

```markdown
## Summary

Adds basic MEED pipeline frontend with stubs and mock data, plus architecture and implementation plan.

## Changes

- Pipeline frontend with stubs and mock values
- Implementation plan and architecture doc
- Sample data for development

## Commits (4)

- chore: implemented basic pipeline frontend with stubs and mock data
- chore: updated implementation plan and uploaded sample data
- chore: added architecture and implementation plan
- chore: updated gitignore for cursor rules and agents md
```

## GitHub MCP execution guidance

- Prefer `create_pull_request` with derived `owner`, `repo`, `head`, `base`, and generated `title`/`body`.
- Generate commit context with `git log origin/<base>..HEAD --oneline -20`.
- Use `--pretty=format:"%s%n%b"` variant when body context is needed.
- If user asks for draft PR, set draft mode.
- If user requests explicit base/head overrides, follow user input.

## Remote branch and push policy

- Assume the branch is already pushed when the user asks to create a PR.
- Do **not** run `git push` or `git push -u` unless the user explicitly asks.
- If PR creation fails because the head branch is missing remotely, report that clearly and ask whether to push.
- When push is explicitly requested, prefer the minimal command needed and continue PR creation after push succeeds.

## Minimal workflow checklist

- [ ] Derive `owner/repo/head/base` from git state.
- [ ] Inspect commits between `origin/<base>` and `HEAD`.
- [ ] Draft concise title and body with the structure above.
- [ ] Skip push by default; only push when explicitly requested.
- [ ] Create PR using GitHub MCP `create_pull_request`.
