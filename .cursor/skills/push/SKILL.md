---
name: push
description:
  Push current branch changes to origin and create or update the corresponding
  pull request via GitHub MCP; use when asked to push, publish updates, or create
  a pull request.
---

# Push

## Alignment with PR presentation rules

When a repository defines pull request **presentation** under **Cursor rules**,
follow that file for **title and body** shape and tone. The common companion rule is:

- `.cursor/rules/pull-request-standards.mdc`: titles and markdown body sections
  only; it does **not** define MCP usage or git steps.

This skill defines **when and how** to push, derive `owner` / `repo` / `base` /
`head`, discover or update PRs, and call GitHub. **Create and update PRs through
the GitHub MCP server** (`create_pull_request`, `update_pull_request`, etc.), not
via `gh pr create`, the GitHub web UI, or other mechanisms, unless the user
explicitly asks otherwise.

## Prerequisites

- **Git:** configured remotes and credentials to push (commonly `origin`).
- **GitHub MCP:** a GitHub MCP server enabled (commonly `user-github`) so the
  agent can call MCP tools. Before each MCP call, **read that tool’s
  schema/descriptor**, then call with the required parameters.
- The push remote is usually named `origin`; replace in commands if this clone uses
  a different name.

## Goals

- Push current branch changes to `origin` safely.
- Create a PR if none exists for the branch, otherwise update the existing open PR.
- Keep branch history clean when the remote has moved ahead.

## Related Skills

- `pull`: use when push is rejected or sync is not clean (non-fast-forward, merge
  conflict risk, or stale branch).

## Steps

### A. Git (local + push)

1. Identify current branch and confirm remote state (`git status`, tracking branch
   if any).
2. Run **local validation for this repository** before pushing:
   - Prefer what the repo documents (`README.md`, `CONTRIBUTING.md`, `Makefile`,
     package scripts, or CI config).
   - Typical patterns include `pytest`, `npm test`, `pnpm test`, `cargo test`,
     `go test ./...`, `make test`, or `pre-commit run --all-files`; use whatever is
     the documented or obvious minimal gate for *this* repo.
   - If there is no documented gate and nothing obvious, push is still allowed,
     but note that risk explicitly to the user.
3. **Derive GitHub coordinates** (do not ask the user for owner, repo, or default
   branch when they can be inferred):
   - **Owner & repo:** from `git remote get-url origin` (HTTPS or SSH GitHub URLs).
   - **Head (branch name):** `git rev-parse --abbrev-ref HEAD` (must not be
     detached; use a real branch for PRs).
   - **Base (default branch):** from `git symbolic-ref refs/remotes/origin/HEAD`
     (strip `refs/remotes/origin/` to get the branch name), or from documented
     repo workflow if symbolic ref is missing.
4. Push to `origin` with upstream tracking if needed.
5. If push fails:
   - **Non-fast-forward / sync:** run the `pull` skill to integrate
     `origin/<base>`, resolve conflicts, rerun step 2, then push again.
   - **Rewritten history:** retry with `git push --force-with-lease origin HEAD`
     only when a normal push is correctly rejected after rebase/amend/reset.
   - **Auth, permissions, or workflow restrictions:** stop and report the exact
     error; do not rewrite remotes or switch protocols as a workaround.

### B. GitHub MCP (PR discover, create, update)

6. **Discover an existing open PR** for this head branch using MCP (after reading
   the tool schema), for example `list_pull_requests` or `search_pull_requests`
   scoped to `owner` + `repo`. When a tool asks for a **head** filter, use the
   format that tool or the GitHub API expects (often `owner:branch` for the same
   repository). Resolve **closed vs merged vs open**:
   - If the branch is only tied to **merged or closed** PRs and new work is
     intended, **stop** and require a **new branch** (then a new PR); do not
     silently continue on a dead line.
   - If an **open** PR exists for this branch, note its **`pullNumber`** for
     updates.
7. **Title and body** must satisfy `.cursor/rules/pull-request-standards.mdc` when
   that file exists (short imperative title; body with Summary, optional Changes,
   optional Commits). To draft the **Commits** section, use local git against the
   same `<base>` as the PR, for example `git log origin/<base>..HEAD --oneline -20`
   and optionally `--pretty=format:"%s%n%b"` for a bit more context. If there is
   no such rule file, follow `.github/pull_request_template.md` when present, or
   the project’s documented PR format. Refresh the body for the **full** branch
   scope, not only the latest commits; do not reuse stale text.
8. **Create or update via MCP only** (no `gh` for PR create/edit unless the user
   overrides workspace rules):
   - **Create:** `create_pull_request` with `owner`, `repo`, `title`, `head`, `base`,
     and `body` (and `draft` if requested).
   - **Update:** `update_pull_request` with `owner`, `repo`, `pullNumber`, and any
     of `title`, `body`, `draft`, `state`, etc., per schema.
9. If the repo defines an **automated PR-body check**, run it and fix issues; if
   not, manually verify against step 7.
10. Return the PR **URL** from MCP results or from `pull_request_read` (`method:
    get`) using `owner`, `repo`, `pullNumber`.

## Commands (Git only)

These are individual Git commands, not a full shell script. Adapt the remote name
if the repository does not use `origin`. **PR actions are not shown here**; use
GitHub MCP per section B.

```text
git status
git rev-parse --abbrev-ref HEAD
git remote get-url origin
git symbolic-ref refs/remotes/origin/HEAD
git push -u origin HEAD
git push --force-with-lease origin HEAD
```

Use `git push --force-with-lease origin HEAD` only after rewritten local history
causes a normal push to be correctly rejected.

## Notes

- Do not use `--force`; prefer `--force-with-lease` only when history was rewritten.
- **Other repositories:** If a project has no Cursor PR rule file, still prefer
  GitHub MCP for agent-driven PR create/update when MCP is available; if MCP is
  unavailable, say so and stop, or use another mechanism (for example `gh`) **only
  if the user explicitly allows it**.
