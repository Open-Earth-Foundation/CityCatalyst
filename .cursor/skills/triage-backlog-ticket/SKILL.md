---
name: triage-backlog-ticket
description: Pick the next safe ticket to work on from the configured tracker (Linear MCP, Jira, or the curated `docs/agent-runbook.md`), confirm preconditions, and either implement it or explain why it should be deferred. Use when the user asks the agent to "pick a task", "do something useful", or runs an idle scan.
---

# triage-backlog-ticket

The autonomous agent (Cursor in agent mode, Cursor Cloud Agent, `agentic-coder` in `watch` mode) needs a deterministic way to choose **what to work on next**.

## Sources of truth (in priority order)

1. **Live tracker via MCP / API** — Linear (recommended), Jira, GitHub Issues. Look for tickets explicitly labelled `agent-ready` (or your team's equivalent). The MCP server name and project filter are configured per-team — see your local Cursor / `agentic-coder` config.
2. **`docs/agent-runbook.md`** — the curated subset of agent-safe tickets distilled from the live tracker. Use this when the tracker MCP is unavailable, or as a stable list during opensource / external runs.
3. **Code scan fallback** — TODO / FIXME / `console.log` / `as any` / empty catch. Use only when (1) and (2) are empty. Cap at one cleanup PR per idle window.

> This repo is open source. The Linear / Jira project ID is **not** committed — it's read from your local MCP config or env. Multiple downstream projects may attach to the same repo; don't hardcode a tracker scope here.

## Decision tree

```
1. If a tracker `agent-ready` ticket exists → take the top one.
2. Else if `docs/agent-runbook.md` has an unchecked item → take the top one.
3. Else if a code scan finds ≥ 2 hits in one category → propose ONE small PR.
4. Else → log "no work" and stop.
```

## Pre-flight before starting

For the chosen task, verify:

- The repo is on `develop` and clean (`git status` empty).
- The task touches < 10 files (`git grep` the keywords; if huge, surface to a human).
- Tests exist for the surface you're about to change. If not, write a smoke test first.
- The task is not blocked by another in-flight PR (`gh pr list --search <slug>`).

If any precondition fails, mark the ticket as "blocked" and pick the next one.

## Implementation

Follow the relevant skill:

- API change → `create-api-endpoint` or `full-feature`.
- UI change → `create-component`.
- DB change → `create-migration`.
- External call → `tighten-fetch-resilience`.
- New cron → `add-cron-job`.
- New flag → `add-feature-flag`.
- Splitting a file → `refactor-large-file`.

After the change: `docs-after-change` → `simplify-after-change` → `commit-message-standards` → `pull-request-standards`.

## When to defer

Defer (don't ship) if:

- The change requires a product decision ("should this be a flag?", "should we sunset X?").
- The acceptance criteria are vague.
- The fix would make the diff > 500 LOC across > 10 files.
- A passing CI check is impossible without infrastructure changes (e.g. needs a new secret).

In all those cases, write a short note in the run log explaining why and move on.
