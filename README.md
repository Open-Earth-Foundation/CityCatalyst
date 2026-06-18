# CityCatalyst

**The open-source climate journey platform for cities — from measuring emissions to unlocking climate finance.**

[![codecov](https://codecov.io/github/Open-Earth-Foundation/CityCatalyst/graph/badge.svg?token=FD69J1XR6M)](https://app.codecov.io/github/Open-Earth-Foundation/CityCatalyst/tree/develop)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](./LICENSE)

CityCatalyst helps cities act on climate change without advanced technical skills.
It begins with a GPC-compliant greenhouse-gas inventory, then guides cities through
the full climate journey: assessing climate risk, prioritizing high-impact actions,
and preparing finance-ready projects — AI-assisted and open source throughout.

Built by the [Open Earth Foundation](https://openearth.org).

---

## The climate journey

CityCatalyst organizes its tools into four stages (the **Journey Navigator**):

| Stage | What cities do | Core modules |
|---|---|---|
| **Assess & Analyze** | Measure emissions, assess climate risk | **GHGI**, **CCRA** |
| **Plan** | Prioritize and sequence high-impact actions | **HIAP** (Actions & Plans) |
| **Implement** | Turn plans into bankable projects | *(partner modules)* |
| **Monitor, Evaluate & Report** | Track and report progress | *(partner modules)* |

**Core modules** (production):
- **GHGI** — Greenhouse-gas inventory aligned with the Global Protocol for Community-Scale (GPC). Auto-loads verified datasets and guides cities to a solid emissions baseline.
- **CCRA** — Climate Risk & Vulnerability Assessment. Identify exposed infrastructure and develop adaptation strategies.
- **HIAP** — High-Impact Actions & Plans. Identify, prioritize, and co-create practical, implementation-ready climate action plans.

The Journey Navigator also hosts a growing catalog of **partner/experimental modules**
(e.g. the Flourish climate-finance suite, NBS & Rooftop-Solar project builders, geospatial
risk maps). These are independently hosted and surfaced in-app via the module catalog.
*(The Journey Navigator is gated behind the `JN_ENABLED` feature flag.)*

## Architecture

CityCatalyst is a monorepo of cooperating services:

| Path | Service | Stack |
|---|---|---|
| [`app/`](./app) | Main web app — UI + REST API (`/api/v1`) | Next.js / TypeScript |
| [`global-api/`](./global-api) | Global emissions, risk & action data API | Python / FastAPI / PostGIS |
| [`climate-advisor/`](./climate-advisor) | Conversational AI advisor | Python / FastAPI / pgvector |
| [`hiap/`](./hiap), [`hiap-meed/`](./hiap-meed) | Action prioritization & plan generation | Python / FastAPI |
| [`api-demo/`](./api-demo) | Example OAuth API client | Static / Nginx |
| [`k8s/`](./k8s) | Kubernetes manifests (dev / test / prod) | YAML |

**Data standard:** GPC (Global Protocol for Community-Scale GHG Inventories).

## Integrating with CityCatalyst

CityCatalyst is built to be extended and integrated:

- **REST API** — documented via OpenAPI (`/api/v1`), see the [API wiki](https://github.com/Open-Earth-Foundation/CityCatalyst/wiki).
- **OAuth 2.0** — external apps authenticate via a standards-based authorization server (RFC 8414 discovery, PKCE).
- **Client SDKs** — generated from the OpenAPI spec (TypeScript & Python) via CI. *(Generated in CI; not yet published to a public registry.)*
- **MCP server** — a [Model Context Protocol](https://modelcontextprotocol.io) server exposes CityCatalyst tools (inventories, emissions, cities, action plans, risk) to AI agents.

## Quick start

Full setup instructions live in [`app/README.md`](./app#citycatalyst). In short:

```bash
git clone https://github.com/Open-Earth-Foundation/CityCatalyst.git
cd CityCatalyst/app
npm install
bash scripts/start-db.sh   # starts a local Postgres via Docker
cp env.example .env        # configure environment
npm run db:migrate && npm run db:seed
npm run dev
```

## Deployment

Containerized (Docker) and deployed to **AWS EKS** via **GitHub Actions**, with images
published to the GitHub Container Registry. Branch-based promotion: `develop` → dev,
`main` → test, version tags (`vX.Y.Z`) → production. See [`.github/workflows/`](./.github/workflows)
and [`k8s/`](./k8s).

## Documentation

- [App README & developer setup](./app#citycatalyst)
- [API documentation & wiki](https://github.com/Open-Earth-Foundation/CityCatalyst/wiki)

## Contributing

Contributions are welcome. Please open an issue to discuss substantial changes before
submitting a PR. Code is formatted with Prettier (TS) / Black (Python); PRs must pass
tests (Jest, Playwright, pytest), linting, and the OpenAPI lint check.

## License

[GNU Affero General Public License v3.0](./LICENSE) — © Open Earth Foundation,
a nonprofit public benefit corporation from California, USA.
