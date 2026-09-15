# CityCatalyst — Agent Brief

**Read this first.** Every AI agent (Cursor, Cursor Cloud Agent, agentic-coder, Codex, Claude Code) and every new human contributor opens this file before touching the repo.

This is a 1-page contract. The full conventions live in `.cursor/rules/` and the named workflows in `.cursor/skills/`.

---

## What this repo is

CityCatalyst is Open Earth Foundation's **flagship climate-tech product**: a multi-tenant SaaS that lets cities build GHG inventories, run risk assessments (CCRA), prioritise climate actions (HIAP), and chat with a Climate Advisor.

It is a **pnpm-free monorepo** with five deployable units:

| Folder | What | Stack | Base branch |
|--------|------|-------|-------------|
| `app/` | Next.js 15 App Router web + REST API | TS, Chakra v3, RTK Query, Sequelize, NextAuth | `develop` |
| `global-api/` | Shared global data API | Python 3.11, FastAPI, SQLAlchemy 2, Alembic | `develop` |
| `climate-advisor/` | RAG chat agent | Python, FastAPI, LangGraph, pgvector | `develop` |
| `hiap/` | Action prioritisation | Python 3.12, FastAPI, LangGraph, XGBoost | `develop` |
| `hiap-meed/` | MEED scoring engine | Python 3.12, FastAPI | `develop` |
| `k8s/` | Shared Kubernetes manifests | YAML | — |

> Day-to-day product work targets **`develop`**. `main` is the test/staging promotion branch. Tags `v*.*.*` go to production.

---

## What you must NOT do

- **Do not open a PR unless explicitly told to** in the active task. Push the branch and stop; a human reviews and opens it.
- **Do not merge your own PR if you are an agent.** Humans review and merge.
- **Do not force-push to `develop`/`main` or rewrite shared history.**
- **Do not commit secrets.** Anything matching `*key*`, `*token*`, `*secret*`, `*.env`, `credentials.json` is a hard stop.
- **Do not skip the rules in `.cursor/rules/`** — they are the team's accumulated taste.
- **Do not introduce new dependencies "just because."** Reuse first; document why if you must add.
- **Do not modify `AGENTS.md`, `.cursor/rules/`, `.cursor/skills/`, or `docs/agent-runbook.md` without core-team review.** These are the agentic foundation, curated by the core engineering team. (Product code merges are unaffected — any tech-team member can merge product code as today.)

## What you must always do

- Branch off `develop` with a name from `.cursor/rules/git-conventions.mdc`.
- Use **Conventional Commits** with the ticket ID when known (`feat(api): add /widgets endpoint (ON-1234)`).
- Run the local quality gates **before** pushing:
  ```bash
  cd app && npm run lint && npm run prettier && npm run jest && npm run openapi:lint
  ```
  (Python services: `pytest`, `black`, `flake8`, `mypy`.)
- After **any** change, run the `docs-after-change` skill.
- For PR text, use the `pull-request-standards` skill.

---

## How to find your way

| You want to | Open |
|------------|------|
| Add a UI component | `.cursor/skills/create-component/SKILL.md` |
| Add a REST endpoint | `.cursor/skills/create-api-endpoint/SKILL.md` |
| Add an RTK query | `.cursor/skills/add-rtk-endpoint/SKILL.md` |
| Add a DB migration | `.cursor/skills/create-migration/SKILL.md` |
| Build a feature end-to-end | `.cursor/skills/full-feature/SKILL.md` |
| Add a k8s CronJob + cron route | `.cursor/skills/add-cron-job/SKILL.md` |
| Add a feature flag | `.cursor/skills/add-feature-flag/SKILL.md` |
| Add UI strings (i18n) | `.cursor/skills/add-i18n-strings/SKILL.md` |
| Make a `fetch()` call resilient | `.cursor/skills/tighten-fetch-resilience/SKILL.md` |
| Triage a Dependabot PR | `.cursor/skills/bump-deps-safely/SKILL.md` |
| Split a large file | `.cursor/skills/refactor-large-file/SKILL.md` |
| Write a commit message | `.cursor/skills/commit-message-standards/SKILL.md` |
| Open / draft a PR | `.cursor/skills/pull-request-standards/SKILL.md` |
| Review a PR | `.cursor/skills/pr-review-gate/SKILL.md` |
| Pick the next backlog ticket (Linear via MCP, runbook fallback) | `.cursor/skills/triage-backlog-ticket/SKILL.md` |

| You want a rule reminder | Open |
|--------------------------|------|
| General code taste | `.cursor/rules/general.mdc` |
| Repo architecture & path aliases | `.cursor/rules/project-architecture.mdc` |
| Branches, commits, PRs | `.cursor/rules/git-conventions.mdc` |
| Security baseline (auth, secrets, fetch) | `.cursor/rules/security-baseline.mdc` |
| OS / shell defaults (POSIX, WSL2, PowerShell) | `.cursor/rules/os-shell.mdc` |
| Windows CMD (`cmd.exe`) cheatsheet | `.cursor/rules/cmd-windows.mdc` |
| Next.js App Router | `.cursor/rules/nextjs-frontend.mdc` |
| Chakra UI v3 | `.cursor/rules/chakra-ui-components.mdc` |
| RTK Query / Redux | `.cursor/rules/rtk-query.mdc` |
| Sequelize / Postgres | `.cursor/rules/sequelize-database.mdc` |
| API routes / `apiHandler` | `.cursor/rules/api-routes.mdc` |
| OpenAPI / SDK generation | `.cursor/rules/openapi-sdk.mdc` |
| Auth / NextAuth | `.cursor/rules/auth-permissions.mdc` |
| i18n | `.cursor/rules/i18n.mdc` |
| Forms / Zod | `.cursor/rules/forms-validation.mdc` |
| Python / FastAPI services | `.cursor/rules/python-fastapi.mdc` |
| LangGraph / RAG services | `.cursor/rules/langgraph-services.mdc` |
| Tests | `.cursor/rules/testing.mdc` |
| K8s / cron | `.cursor/rules/k8s-cron-conventions.mdc` |

---

## Curated backlog for autonomous agents

`docs/agent-runbook.md` is the authoritative list of tickets safe for an agentic run (`./run.sh watch jira` against this repo). Pick from there before scanning the codebase.

---

## Quickstart (humans)

```bash
cd app
npm install
cp .env.example .env.local        # ask the team in #engineering for dev secrets
npm run db:migrate
npm run dev                        # http://localhost:3000

# in another terminal:
cd global-api
pip install -r requirements.txt
ALEMBIC_URL=postgresql+psycopg2://… alembic upgrade head
python main.py                     # http://localhost:8000
```

For the full multi-service local setup, see `app/README.md` and `docs/Components.md`.

---

## Glossary (don't get this wrong)

- **GPC** — Global Protocol for Community-scale GHG Emissions.
- **GHGI** — Greenhouse Gas Inventory.
- **HIAP** — High Impact Action Prioritization.
- **CCRA** — Climate Change Risk Assessment.
- **MEED** — Mitigation, Equity, Environment, Development scoring.
- **Locode** — UN/LOCODE city identifier; primary city key org-wide. **Never** use `city_id` as the join key.
- **Inventory** — a city's emissions data for one year.
- **Sector / SubSector / SubCategory** — GPC hierarchy.

---

## Questions / corrections

If anything in this file or in `.cursor/` is wrong, missing, or stale — **fix it in the same PR** that surfaced the gap. The agent contract only works if it's trustworthy.
