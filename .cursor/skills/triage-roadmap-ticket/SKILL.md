---
name: triage-roadmap-ticket
description: Pick the next safe ticket from docs/agent-runbook.md (or ROADMAP.md), confirm preconditions, and either implement it or explain why it should be deferred. Use when the user asks the agent to "pick a task", "do something useful", or runs an idle scan.
---

# triage-roadmap-ticket

The autonomous agent (`./run.sh watch jira` or Cursor in agent mode) needs a deterministic way to choose **what to work on next**.

## Source of truth

1. `docs/agent-runbook.md` — curated, ordered list of agent-safe tickets.
2. `ROADMAP.md` — broader CTO roadmap (some items are not agent-safe).
3. Live Jira/Linear — issues labelled `agent-ready`.

If all three are empty, fall back to a code scan (TODO / `console.log` / `as any`) — but cap at one cleanup PR per idle window.

## Decision tree

```
1. If a Jira/Linear `agent-ready` ticket exists → take it.
2. Else if agent-runbook.md has an unchecked item → take the top one.
3. Else if a code scan finds ≥ 2 hits in one category → propose ONE small PR.
4. Else → log "no work" and stop.
```

## Pre-flight before starting

For the chosen task, verify:

- The repo is on `develop` and clean (`git status` empty).
- The task touches < 10 files (`git grep` the keywords; if huge, surface to a human).
- Tests exist for the surface you're about to change. If not, write a smoke test first.
- The task is not blocked by another in-flight PR (search for similar branches: `git branch -a | grep <slug>`).

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
