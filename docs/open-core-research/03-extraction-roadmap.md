# Extraction roadmap

A proposal, 1 October 2026. Strangler pattern: new interfaces are introduced beside the old code, callers move over, old code is removed. Nothing breaks for the GCoM Digital Service build, which runs on its own branch and takes upstream changes only when C40 chooses. All effort figures are estimates, ±50 percent, assuming one senior engineer per engineer-month; they are for comparison, not pricing.

## Phase 0: before the 23 October 2026 specification gate

| Step | What | Effort | Why now |
|---|---|---|---|
| 0.1 | Publish the package boundary: which directories become `core/*` packages, which stay apps, and the app integration rules (login, record format, design tokens, events) as a document | 1 | The gate needs the rules; the benchmark's first condition for the evolve strategy |
| 0.2 | Fix the SDK pipeline trigger and publish TypeScript and Python SDKs on tagged releases | 0.5 | A one-line fix unlocks the primary contract |
| 0.3 | Add licence metadata to every service; reconcile the component README | 0.25 | Nothing can be published without it |
| 0.4 | Open the tickets from the inventory: admin gating on OAuth clients, in-memory replay protection, service authentication to the prioritisation services, the test-step pipe, the area projection | 0.25 | Known defects should not ship into the branch |
| 0.5 | Decide the identity server: harden in-house or place Keycloak or Ory behind the existing screens | decision | Everything in phase 1 depends on it |

## Phase 1: Q4 2026, the foundations the GCoM build needs anyway

The recommendation deck's foundations for October to December already list the record schema, the app integration rules, identity and tokens. The five primitives are the generic form of those.

| Step | What | Effort | Dependency |
|---|---|---|---|
| 1.1 | Record envelope and schema registry beside the inventory tables: identifier, version, supersedes, entity, schema, period, issuer, hash, proofs, status; inventories get an envelope row on publish | 3 to 4 | The GCoM record schema, versioned not frozen, lands around January 2027 |
| 1.2 | Place and jurisdiction entity, edge table and crosswalk table beside City; back-fill from existing cities and Overture Divisions; PostGIS-typed geometry; cell sets | 3 to 4 | None; the City remains until phase 2 |
| 1.3 | Principal, identity, mandate and session records; a conformant OpenID Connect provider (in-house or component); enterprise single sign-on per organisation; passkeys; assurance recorded | 4 to 6 | Step 0.5 |
| 1.4 | Agent record, tenant-scoped scopes with audience binding, hash-chained audit log; the MCP server aligned to the 2026-07-28 revision; a gateway if chosen | 3 to 4 | None |
| 1.5 | Per-tenant export bundle, access log including agent reads, per-organisation key, residency as instance configuration, consent records in the ISO 27560 shape | 3 to 4 | The GDPR module is the base |
| 1.6 | Tests and conformance checks for every new interface; no new interface without tests | 2 to 3 | Across all steps |

Phase 1 total: 18 to 25 engineer-months, in parallel across two to three engineers plus the GCoM squads where the work overlaps.

## Phase 2: Q1 to Q2 2027, swap and generalise behind the interfaces

| Step | What | Effort |
|---|---|---|
| 2.1 | Membership facts into a relationship store (OpenFGA) and entitlement rules into a policy engine (Cedar or OPA) behind one AuthZEN-shaped call; server-side enforcement on every module route | 4 to 6 |
| 2.2 | Events as module-registered, namespaced CloudEvents; webhook delivery through Svix or Standard Webhooks signatures; a NATS stream from the outbox | 3 to 4 |
| 2.3 | The app registry replaces the module seed: login through the identity layer, record access under a mandate, event subscriptions; token hand-off to external apps | 3 to 4 |
| 2.4 | Durable jobs on Temporal (OCR, bulk import, webhook delivery); the cron-calls-API pattern retired | 3 to 4 |
| 2.5 | OGC API Features over the place registry (pygeoapi); a DCAT catalogue endpoint; the data service catalogue keyed on place identifiers | 3 to 4 |
| 2.6 | The climate vocabulary moved: sector tables, formatters, dashboards and MCP tools into the climate domain package; City retired in favour of Member plus Place | 5 to 8 |

Phase 2 total: 21 to 30 engineer-months. The GCoM MVP in July 2027 does not depend on phase 2; the branch takes these changes when C40 chooses.

## Phase 3: after the MVP, the second network as proof

| Step | What | Effort |
|---|---|---|
| 3.1 | The domain configuration package template, documented with the climate package as the worked example | 3 to 4 |
| 3.2 | Federation: entity configuration published, instance registry, signed export bundle importable by another instance | 3 to 4 |
| 3.3 | Verifiable records: signing on publish, status lists, verifier endpoint, receipts, badges in the Open Badges shape | 3 to 5 |
| 3.4 | Policy objects on places with a small ODRL profile; residency as policy | 3 to 4 |
| 3.5 | Conformance test suite a third party can run; DPG and GovStack evidence | 3 to 4 |
| 3.6 | A second network (health, biodiversity or a national programme) onboarded with configuration and one domain app, no core changes | 4 to 6 plus the domain app |

Phase 3 total: 19 to 27 engineer-months. Whole programme: 58 to 82 engineer-months, consistent with the benchmark's 60 to 90 for the evolve strategy.

## Dependencies on the GCoM build

- The record schema for GCoM reporting is the first consumer of the envelope and schema registry; its question lists land around January 2027, so the schema is versioned, not frozen, at the gate.
- The GCoM identity work (roles, invitation-based onboarding, delegated helpdesks) is the first consumer of principals and mandates.
- The organisations' desk and the recognition engine are the first consumers of receipts and badges; their wording is a question for C40 and GCoM ([05-open-questions.md](05-open-questions.md)).
- Data localisation for China and the Philippines is the first consumer of residency as instance configuration.
- Cities opting out of AI or bringing their own model key is the first consumer of the agent record's retention mode and model route.

## Risks

| Risk | Where it bites | Mitigation |
|---|---|---|
| Test coverage: no tests on the MCP server or tokens; the data service's test step may not fail the build | Phases 1 and 2 | No new interface without tests; fix the pipe in phase 0 |
| The Next.js application is both front end and API, with 216 routes and in-memory state | Phases 1 and 2 | Extract packages, not services, first; move state to the database or a store before adding replicas |
| Shared database schema across tenants and modules | Phase 2 | Row-level security on the organisation column; per-tenant keys; the domain package owns its tables |
| Climate vocabulary in 145 files | Phase 2 | Crosswalk first, rename last; the Place entity lives beside City for two phases |
| Stale documentation (`docs/Components.md`, the tech deep-dive's SDK claim, the agents guide's framework version) | All | Replace with the inventory and architecture documents; delete `Components.md` |
| Fork drift between the GCoM branch and the trunk | From phase 1 | The package boundary and the app integration rules published in phase 0; generic fixes flow back; the technical board reviews what moves |
| Team culture: the no-rebuild rule | Phase 2 | Pablo and Milan pressure-test the component list before phase 2 starts |
| Key custody for small municipalities | Phase 3 | Custodial keys with a city-held recovery quorum; identifiers under the city's own domain |
