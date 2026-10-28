# Module interoperability — a contract for modules reading each other's data

Companion to [`MeedModuleMigration.md`](./MeedModuleMigration.md).
**Status:** proposal for review.

---

## 1. Why this document exists

Bringing MEED+ into CityCatalyst raises a requirement that is bigger than MEED+ itself:

> For HIAP to rank mitigation actions, it must be able to read the city's emissions inventories in
> CityCatalyst. Modules should be interoperable and communicate with each other.

Right now the platform has **module isolation** (`Module`, `ProjectModules`, `ModuleAccessService`,
`useModuleAccess`) but no **module composition**. Where one module needs another's data today, it
reaches directly into the other's tables:

```
HiapService.getCityContextAndEmissionsDataImpl(inventoryId)
  └── db.models.Inventory.findByPk(…, include: [City, InventoryValue])
  └── PopulationService.getPopulationDataForCityYear(…)
  └── ResultsService.getTotalEmissionsBySector([inventoryId])
```

That works for one consumer. MEED+ would be the second, and it needs *different, richer* data than
HIAP does — GPC-reference-level values rather than five sector totals. Adding a second bespoke
reach-in is the moment to define the pattern instead, because the queue behind it is real:

- **MEED+ → GHGI** (this migration)
- **CCRA → HIAP** — risk-informed adaptation ranking
- **HIAP → NBS / Rooftop Solar Project Builders** — ranked actions as project-builder input
- **Any module → city dashboard**, which `ModuleDashboardService` already aggregates

---

## 2. Current state

### What exists

| Mechanism | What it does | What it doesn't do |
|---|---|---|
| `Module` / `ProjectModules` | Registry + per-project entitlement, with expiry | Says nothing about what a module *provides* or *requires* |
| `ModuleAccessService` / `useModuleAccess` | Gates access; redirects on denial | No notion of data preconditions |
| `ModuleDashboardService` + `city/[city]/modules/<m>/dashboard` | Per-module dashboard aggregation for the city view | Each dashboard is hand-written per module |
| `ModuleWidgets/` (`GHGIWidget`, `HIAPWidget`, `CCRAWidget`, `CCRAMainWidget`) | Cross-module surfacing on the city dashboard | Presentation only, no shared data contract |
| `InventoryService` / `ResultsService` | The de facto GHGI read layer | Not framed or documented as a cross-module interface; consumers bypass it |
| MCP tools (`lib/mcp/`) | `get_inventory_emissions`, `get_climate_action_plans`, … | Agent-facing transport, hand-wired, and — per [`AgenticModuleScope.md`](./AgenticModuleScope.md) — not intended as the runtime path between modules |

### The gaps

1. **No provider contract.** Consumers query `db.models.*` directly, so a GHGI schema change can
   silently break HIAP, MEED, and anything else downstream.
2. **No declared preconditions.** `HIAP/page.tsx` handles "no inventory" by redirecting to
   `GHGI/onboarding`. It works, but it is invisible to the Modules screen — a user sees an enabled
   card and only discovers the missing prerequisite after clicking through.
3. **No granularity contract.** HIAP gets 5 sector totals; MEED needs per-GPC-reference values.
   Without a defined shape, each consumer invents its own query and its own edge-case handling
   (nulls, notation keys, rounding, locode formatting).
4. **Duplicated normalization.** Locode formatting (`CLANT` → `CL ANT`), null→0 coercion, and
   integer rounding live inside `HiapService`. MEED would copy them; the third consumer would copy
   them again.

---

## 3. Proposal

Three pieces, each independently useful and each shippable on its own.

### 3.1 Provider contract — a typed read layer per module

Each module that owns data exposes a **server-side reader** as the only sanctioned way another
module reads it. For GHGI this is mostly a matter of *framing and completing* what already exists
(`InventoryService` + `ResultsService`) rather than writing something new:

| Capability | Granularity | Backed by |
|---|---|---|
| `getInventoryMeta(inventoryId)` | year, locode, city, GWP, scope | `InventoryService` |
| `getCitywideTotal(inventoryId)` | single tCO₂e figure | `ResultsService` |
| `getEmissionsBySector(inventoryId)` | 5 GPC sectors | `ResultsService.getTotalEmissionsBySector` (existing) |
| `getEmissionsBySubSector(inventoryId)` | GPC sub-sector | `ResultsService.getTotalEmissionsBySectorAndSubsector` (existing) |
| `getEmissionsByGpcReference(inventoryId)` | **per `gpcReferenceNumber`, with activities and notation keys** | **new** — `InventoryValue` ⋈ `SubSector` |

Normalization (locode formatting, null handling, rounding) lives **in the provider**, once.

Consumers:
- `MeedInventoryService.buildCityInput()` — first consumer of `getEmissionsByGpcReference`
- `HiapService.getCityContextAndEmissionsDataImpl()` — refactored onto `getEmissionsBySector`,
  deleting its private `getSectorEmissions` helper and its inline locode formatter

This is deliberately a **plain typed service boundary**, not a new framework. No HTTP hop, no
plugin registry, no new auth surface — it stays inside `apiHandler`'s existing security envelope
and remains directly testable with the existing Jest helpers.

> **Explicitly rejected: MCP as the runtime transport.** [`AgenticModuleScope.md`](./AgenticModuleScope.md)
> already argues this for CC↔CA, and the reasoning applies verbatim here — it would add another
> tool surface, auth path, schema layer, and test matrix. MCP stays agent-facing.

### 3.2 Declared preconditions

Let a module declare what it needs, so the platform can render a real state instead of a silent
redirect.

```ts
// illustrative
requires: [
  { module: "GHGI", capability: "inventory", predicate: "hasNonZeroSectorEmissions" }
]
```

Consumed in three places:

- **Modules screen** (`HomePageJN/HomePage.tsx`) — the card shows *"Needs a GHG inventory first"*
  with a link, instead of appearing fully available
- **Module entry page** — replaces the ad-hoc redirect in `HIAP/page.tsx` (and the one MEED would
  otherwise copy)
- **City dashboard widgets** — a meaningful empty state rather than a blank card

Cheapest viable version: a static declaration next to the `Modules` constant plus one resolver
service. It does not need to live in the database to be useful.

### 3.3 Cross-module dashboard surface

Follow the existing pattern rather than inventing one — add
`api/v1/city/[city]/modules/meed/dashboard` alongside the `ghgi` / `hiap` / `ccra` routes, and a
`MEEDWidget` in `components/ModuleWidgets/`, so a city's dashboard shows prioritization state next
to inventory and risk state.

The generalization worth making while adding the fourth one: the four dashboard routes are
structurally identical (resolve city → check module access → aggregate → shape response). They
could share a `ModuleDashboardService` helper instead of repeating the scaffolding.

---

## 4. Scope and sequencing

Only §3.1's new capability (`getEmissionsByGpcReference`) is **required** for MEED+ to work. The
rest can follow.

| Piece | Required for MEED+? | Notes |
|---|---|---|
| `getEmissionsByGpcReference` | **Yes** | Blocking — MEED cannot call `/v1/prioritize` without it |
| Framing `InventoryService`/`ResultsService` as the provider contract | No | Cheap while touching the same code; prevents the second bespoke reach-in |
| Refactoring `HiapService` onto the contract | No | Pays for itself the moment GHGI's schema changes |
| Declared preconditions | No | Removes a real UX rough edge; improves the Modules screen for every module |
| MEED dashboard widget | No | Natural follow-up once rankings are persisted |

**Suggested framing:** do the blocking capability plus the provider framing during the MEED
backend work (they are the same code, touched at the same time); treat preconditions and the
dashboard widget as separate, independently valuable tickets.

---

## 5. Open questions

1. **Contract location.** A new `src/backend/providers/` namespace, or keep the readers in
   `InventoryService`/`ResultsService` and document them as the contract? *(Leaning: the latter —
   less churn, same guarantee, no speculative structure.)*
2. **Enforcement.** Is direct `db.models.*` access from another module's service a lint rule, a
   review convention, or unenforced? Without some enforcement the contract erodes on the next
   deadline.
3. **Precondition storage.** Static declaration in code vs a column on `Module`. Static is cheaper
   and versioned with the code; a column lets third-party/POC modules declare preconditions too.
4. **Third-party modules.** POC modules today are external URLs (`type: "POC"` — NBS Project
   Builder, Rooftop Solar, Flourish). If they eventually need CityCatalyst data, that is an
   **OAuth + public API** question, not this in-process contract. Worth stating the boundary
   explicitly so the two don't get conflated.
5. **Versioning.** If GHGI's provider contract changes shape, how do consumers pin or migrate?
