# Agent Runbook — CityCatalyst

**Purpose:** the curated, ordered list of tasks that an autonomous agent (Cursor in agent mode, agentic-coder, Cursor Cloud Agent) is allowed to pick up without further approval.

Distilled from `ROADMAP.md` and current-state of `develop`. Updated by the CTO.

> **Rules of the road**
> - Pick the **top unchecked item** in the section that matches your current capability budget (Quick / Medium / Large).
> - Branch off `develop`. One ticket = one PR.
> - Use the matching skill (linked per item).
> - **Do not open the PR yourself unless explicitly told to.** Push the branch and stop.
> - Cross items out as you ship: `- [x]`.

---

## Quick (≤ 30 min, ≤ 5 files)

- [ ] **Sanitise 5xx error responses** — central `errorHandler` in `src/util/api.ts` should never echo `err.message` to the client. Tracked: `pborges/fix-sanitize-500-error-responses`. Skill: `create-api-endpoint`, rule: `security-baseline`.
- [ ] **Bound the rate-limiter map** — add a `setInterval(cleanup, 5 * 60_000)` in the rate-limiter module so the IP map doesn't grow unbounded. Skill: `simplify-after-change`. Rule: `security-baseline` §rate-limiting.
- [ ] **Sweep remaining `console.log` / `console.warn`** — repo-wide grep across `app/src/**/*.tsx`, except tests. Add a fast lint rule (`no-console` with `error` exceptions) if missing. Tracked: `agent/remove-debug-console-statements-from-ui-components`.
- [ ] **Remove unnecessary `User.findAll()` on login** — already prepared on `pborges/fix-unnecessary-findall-on-login`; just rebase + open PR.
- [ ] **Align `react-dom` and `@next/env` versions** — `pborges/fix-align-react-and-next-env-versions`.
- [ ] **Remove duplicate `pytest`** entry in `global-api/requirements.txt` — `pborges/fix-duplicate-pytest-in-requirements`.
- [ ] **Remove duplicate `NEXT_PUBLIC_FEATURE_FLAGS`** in `app/.env.example` — `pborges/fix-duplicate-feature-flags-env-example`.
- [ ] **Type the bearer-token + session helpers** — replace `any` in auth helpers — `pborges/fix-type-bearer-token-and-session-helpers`.
- [ ] **Upgrade outdated GitHub Actions** to latest major (v4/v5) — `pborges/fix-upgrade-outdated-ci-actions`.
- [ ] **Fix three i18n cookie middleware bugs** — `pborges/fix-i18n-cookie-middleware-bugs`.
- [ ] **Remove `console.log` from `TooltipCard`** — `pborges/remove-console-log-from-tooltipcard`.

## Medium (≤ 2h, ≤ 20 files)

- [ ] **Add `AbortSignal` + timeout to all external fetches** in `src/backend/`. Skill: `tighten-fetch-resilience`. Rule: `security-baseline` §network.
- [ ] **Lock `db.initialize()` behind a mutex** — prevent concurrent pool creation on cold start (ROADMAP §1.4). Skill: `simplify-after-change`.
- [ ] **`.catch()` and `await` HIAP background jobs** in `src/backend/hiap/HiapService.ts` (ROADMAP §1.3). Skill: `tighten-fetch-resilience`.
- [ ] **Add liveness/readiness/startup probes** to `k8s/test/cc-test-web-deploy.yml` — match `k8s/cc-web-deploy.yml`. Rule: `k8s-cron-conventions`.
- [ ] **Loading states on public project page** — replace "N/A → real" flicker with `Skeleton`. Skill: `create-component`. Rule: ROADMAP §2.2.
- [ ] **Empty states on file table, inventories, HIAP/GHGI widgets** — see ROADMAP §2.3. Skill: `create-component`.
- [ ] **Replace `as any` in `src/backend/`** — incremental, file-by-file. Rule: `general` (no over-typing, but no `any` either).
- [ ] **Add Zod validation for env vars** — `src/util/env.ts` (new). Reject startup if required env missing in non-dev. Skill: `script-quality-gate`.
- [ ] **Add the `bump-deps-safely` triage** to the next 5 open Dependabot PRs — see [open queue](https://github.com/Open-Earth-Foundation/CityCatalyst/pulls?q=is%3Apr+is%3Aopen+author%3Aapp%2Fdependabot).

## Large (≥ half-day, ≥ 20 files — coordinate before starting)

- [ ] **Split `app/src/services/api.ts`** (2171 LOC) by domain. Skill: `refactor-large-file`. One PR per domain.
- [ ] **Granular error boundaries** — wrap each major widget so a single error doesn't kill the page. ROADMAP §4.1.
- [ ] **HIAP `processBatch` transactionality** — wrap status changes + HIAP call in a transaction or compensating action. ROADMAP §4.2.
- [ ] **i18n the ~40 hardcoded strings** in public pages, aria-labels, placeholders. Skill: `add-i18n-strings`.
- [ ] **Fix N+1 in `ActivityService`** — bulk-load related entities in one query. ROADMAP §3.3.
- [ ] **Component-level UI tests** (continuous effort) — Jest + Testing Library on Chakra components. Rule: `testing`.

## Continuous (run on idle / weekly)

- [ ] **Repo doc audit** — `repo-doc-audit` skill, monthly.
- [ ] **OpenAPI lint** after every API change — `npm run openapi:lint`. Rule: `openapi-sdk`.
- [ ] **Translate i18n diff** — auto-runs via `web-translate.yml` on push to `develop`; verify the PR.

---

## How to add a new ticket here

1. The CTO (or a senior eng) writes a 1-line description **followed by the matching skill link**.
2. Bucket it Quick / Medium / Large (not by importance — by capability budget for one agent run).
3. If a branch already exists, mention it (`Tracked: <branch>`).
4. If you complete a ticket but realise it was wrongly categorised, fix the bucket on the same PR.

## What this runbook is **not**

- It's not a Jira/Linear replacement. It's a curated subset.
- It's not for CTO-strategic items (sunsetting features, repo-level rewrites, HR).
- It's not for items requiring product input.
