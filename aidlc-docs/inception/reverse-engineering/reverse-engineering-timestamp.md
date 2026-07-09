# Reverse Engineering Metadata

**Analysis Date**: 2026-07-09T19:16:00Z
**Document Language**: English (team lingua franca)
**Analyzer**: AI-DLC
**Workspace**: /home/davi/Área de trabalho/projects/open-earth/CityCatalyst
**Total Files Analyzed**: ~2000+ (monorepo scan)

## Artifacts Generated

- [x] business-overview.md
- [x] architecture.md
- [x] code-structure.md
- [x] api-documentation.md
- [x] component-inventory.md
- [x] technology-stack.md
- [x] dependencies.md
- [x] code-quality-assessment.md
- [x] reverse-engineering-timestamp.md

## Analysis Scope

| Area | Depth | Notes |
|------|-------|-------|
| Package discovery | Comprehensive | All 6 runtime + 6 tooling packages |
| Architecture | Comprehensive | Diagrams, data flows, integration points |
| Code structure | Comprehensive | Key files, patterns, conventions |
| API documentation | Standard | Representative sampling (~152 app routes, 35 global-api modules) |
| Dependencies | Standard | Internal graph + key external deps |
| Code quality | Standard | CI gates, coverage, technical debt |
| Business overview | Comprehensive | Transactions, glossary, component descriptions |

## Remaining Understanding Gaps

1. hiap vs hiap-meed product roadmap
2. GHGI calculation engine internals (formula tables)
3. CCRA canonical backend (global-api vs Replit)
4. global-api v0 deprecation timeline
5. MCP server full tool scope and auth model
6. OAuth/PAT scope definitions
7. Partner module (Journey Navigator) integration pattern
8. Agentic stationary-energy full draft-to-commit contract
9. Cross-service observability correlation
10. K8s secret rotation procedures
11. Integration test strategy across services
12. Catalogue sync cadence in production
