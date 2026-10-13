# Agent Runbook — CityCatalyst

**Purpose:** the curated, ordered list of tasks that an autonomous agent (Cursor in agent mode, agentic-coder, Cursor Cloud Agent) is allowed to pick up without further approval.

Distilled from the team's tracked roadmap (Linear, configured per-team via MCP) and current-state of `develop`. Updated by the core engineering team.

> This file is the **stable, opensource-friendly** subset. The live roadmap lives in Linear and is connected via the team's MCP config — it is intentionally not committed here, since multiple downstream initiatives may attach to the same repo. Agents that have a configured Linear MCP should query it first; this runbook is the fallback.

> **Rules of the road**
> - Pick the **top unchecked item** in the section that matches your current capability budget (Quick / Medium / Large).
> - Branch off `develop`. One ticket = one PR.
> - Use the matching skill (linked per item).
> - **Do not open the PR yourself unless explicitly told to.** Push the branch and stop.
> - Cross items out as you ship: `- [x]`.

---

## Quick (≤ 30 min, ≤ 5 files)

- [ ] **Sanitise 5xx error responses** — central `errorHandler` in `src/util/api.ts` should never echo `err.message` to the client. Skill: `create-api-endpoint`. Rule: `security-baseline`.
- [ ] **Bound the rate-limiter map** — add a `setInterval(cleanup, 5 * 60_000)` in the rate-limiter module so the IP map doesn't grow unbounded. Skill: `simplify-after-change`. Rule: `security-baseline` §rate-limiting.
- [ ] **Sweep remaining `console.log` / `console.warn`** — repo-wide grep across `app/src/**/*.tsx`, except tests. Add a fast lint rule (`no-console` with `error` exceptions) if missing.
- [ ] **Remove unnecessary `User.findAll()` on login** — load the single user by email instead of scanning all users.
- [ ] **Align `react-dom` and `@next/env` versions** with the `next` major in `app/package.json`.
- [ ] **Remove duplicate `pytest`** entry in `global-api/requirements.txt`.
- [ ] **Remove duplicate `NEXT_PUBLIC_FEATURE_FLAGS`** in `app/.env.example`.
- [ ] **Type the bearer-token + session helpers** — replace `any` in auth helpers (`src/util/api.ts` auth resolution path).
- [ ] **Upgrade outdated GitHub Actions** to latest major (v4/v5).
- [ ] **Fix i18n cookie middleware bugs** — `app/src/middleware.ts` language detection / cookie setting.
- [ ] **Remove `console.log` from `TooltipCard`** (`app/src/components/EmissionsForecast/TooltipCard.tsx`).

## Medium (≤ 2h, ≤ 20 files)

- [ ] **Add `AbortSignal` + timeout to all external fetches** in `src/backend/`. Skill: `tighten-fetch-resilience`. Rule: `security-baseline` §network.
- [ ] **Lock `db.initialize()` behind a mutex** — prevent concurrent pool creation on cold start. Skill: `simplify-after-change`.
- [ ] **`.catch()` and `await` HIAP background jobs** in `src/backend/hiap/HiapService.ts`. Skill: `tighten-fetch-resilience`.
- [ ] **Add liveness/readiness/startup probes** to `k8s/test/cc-test-web-deploy.yml` — match `k8s/cc-web-deploy.yml`. Rule: `k8s-cron-conventions`.
- [ ] **Loading states on public project page** — replace "N/A → real" flicker with `Skeleton`. Skill: `create-component`.
- [ ] **Empty states on file table, inventories, HIAP/GHGI widgets**. Skill: `create-component`.
- [ ] **Replace `as any` in `src/backend/`** — incremental, file-by-file. Rule: `general` (no over-typing, but no `any` either).
- [ ] **Add Zod validation for env vars** — `src/util/env.ts` (new). Reject startup if required env missing in non-dev. Skill: `script-quality-gate`.
- [ ] **Add the `bump-deps-safely` triage** to the next 5 open Dependabot PRs — see [open queue](https://github.com/Open-Earth-Foundation/CityCatalyst/pulls?q=is%3Apr+is%3Aopen+author%3Aapp%2Fdependabot).

## Large (≥ half-day, ≥ 20 files — coordinate before starting)

- [ ] **Split `app/src/services/api.ts`** (2171 LOC) by domain. Skill: `refactor-large-file`. One PR per domain.
- [ ] **Granular error boundaries** — wrap each major widget so a single error doesn't kill the page.
- [ ] **HIAP `processBatch` transactionality** — wrap status changes + HIAP call in a transaction or compensating action.
- [ ] **i18n the ~40 hardcoded strings** in public pages, aria-labels, placeholders. Skill: `add-i18n-strings`.
- [ ] **Fix N+1 in `ActivityService`** — bulk-load related entities in one query.
- [ ] **Component-level UI tests** (continuous effort) — Jest + Testing Library on Chakra components. Rule: `testing`.

## Continuous (run on idle / weekly)

- [ ] **Repo doc audit** — `repo-doc-audit` skill, monthly.
- [ ] **OpenAPI lint** after every API change — `npm run openapi:lint`. Rule: `openapi-sdk`.
- [ ] **Translate i18n diff** — auto-runs via `web-translate.yml` on push to `develop`; verify the PR.

---

## How to add a new ticket here

1. Write a 1-line description **followed by the matching skill link**.
2. Bucket it Quick / Medium / Large (not by importance — by capability budget for one agent run).
3. Keep it self-contained — do not pin to a personal branch name; in-flight work belongs on the live tracker.
4. If you complete a ticket but realise it was wrongly categorised, fix the bucket on the same PR.

## What this runbook is **not**

- It's not a Linear / Jira replacement. It's a curated, opensource-friendly subset.
- It's not for strategic items (sunsetting features, repo-level rewrites, hiring).
- It's not for items requiring product input.
