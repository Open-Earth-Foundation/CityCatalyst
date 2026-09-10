---
name: bump-deps-safely
description: Triage and merge a Dependabot or manual dependency-bump PR. Use when the user asks to review a deps PR, asks "is this dep safe to merge?", or you encounter a `dependabot/*` branch.
---

# bump-deps-safely

The CityCatalyst open-PR queue is dominated by Dependabot. This skill is the standard triage.

## Decide patch vs. minor vs. major

```bash
gh pr view <N> --json title,body
```

The title encodes the bump (e.g. `bump fastapi 0.128.0 → 0.135.3`). Apply semver:

- **Patch** (`X.Y.Z → X.Y.Z+1`) — almost always safe; merge after CI green.
- **Minor** (`X.Y → X.Y+1`) — read changelog highlights; merge after CI green + a smoke run of the affected service.
- **Major** (`X.0 → X+1.0`) — manual review required. Read the migration guide, schedule the bump, often split per service.

## Per-service smoke tests

Before merging anything `minor+`, run the service locally:

| Service | Smoke command |
|---------|---------------|
| `app` | `npm install && npm run dev` then visit `/en/cities`. |
| `global-api` | `pip install -r requirements.txt && alembic upgrade head && python main.py` then `curl localhost:8000/healthz`. |
| `climate-advisor` | `cd climate-advisor/service && uv sync && uv run uvicorn app.main:app --reload` then a POST to `/v1/chat`. |
| `hiap`, `hiap-meed` | `cd <svc> && uv sync && uv run pytest`. |

## High-risk dep families (extra care)

- `next` major bumps → check App Router behaviour, middleware compat.
- `react`/`react-dom` → align with `@next/env` and `@types/react` (we've shipped that desync — see `pborges/fix-align-react-and-next-env-versions`).
- `sequelize` → run all migrations on a scratch DB.
- `langchain*`, `langgraph*`, `openai-agents` → the Climate Advisor / HIAP chains are sensitive; run a real chat smoke.
- `fastapi`, `uvicorn`, `sqlalchemy` → run all global-api tests.
- `pgvector`, `chromadb` → re-ingest a small dataset.

## When to consolidate

If 5+ dep PRs are open across the same service, consider a **batch bump** branch (`chore/deps-2026-04`) that pulls the patches together and runs the smoke once. Reduces PR noise.

## Anti-patterns

- Merging multiple major bumps on one branch.
- "I'll fix it after merge" — Dependabot bumps that fail CI must be fixed **on the bump branch**, not on `develop`.
- Auto-merge enabled without a CI green-gate. Don't.
