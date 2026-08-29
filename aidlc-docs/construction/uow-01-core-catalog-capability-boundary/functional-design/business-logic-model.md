# UOW-01 Functional Design — Business Logic Model

## Purpose and scope

UOW-01 establishes the CityCatalyst Core business behavior for exposing selected `NativeInputCatalog` entries as bounded Climate Advisor capabilities. It covers discovery, capability eligibility, selected-read authorization, source-state validation, bounded result shaping, safe operational outcomes, and Core-side verification.

This is a technology-agnostic functional model. It does not choose route filenames, persistence migrations, framework classes, test-file locations, or new deployment units. NativeInputCatalog remains Core-owned, and the module that owns a source remains the source system of record.

The model implements Linear CC-737 and the approved requirements FR-01 through FR-11, NFR-01 through NFR-08, and assigned stories US-01, US-02, US-04, US-05, US-06, and US-08.

## Actors and authority

| Actor or boundary | Functional responsibility | Authority it does not have |
|---|---|---|
| City Climate User (P-01) | Initiates a request in an active CityCatalyst context and receives source-backed assistance. | Cannot select or read a source outside the authorized context. |
| Climate Advisor service (P-02 system role) | Requests discovery, binds a user selection to the active request, and invokes Core-issued capabilities. | Cannot authorize a user, infer routes, access catalog storage directly, or receive raw source/storage data. |
| CityCatalyst Core | Authenticates the service request, binds the user token, evaluates scope, owns catalog discovery, resolves the allowlist, validates source state, and shapes results. | Does not become the owner of module source content. |
| NativeInputCatalog | Provides Core's durable pointer and catalog lifecycle state. | A catalog row is not itself an authorization grant. |
| Module-owned source boundary | Verifies/executes the approved bounded source operation for its owned data. | Does not delegate its source ownership or expose unrestricted storage access. |
| Security/operations governance (P-04) | Reviews non-disclosure, auditability, failure isolation, and evidence. | Is not an end-user or an alternate authorization path. |

## Functional concepts

1. **Request context** is the authenticated user plus the explicitly supplied applicable organization, project, city, inventory, and correlation context. It is evaluated by Core, not trusted from Climate Advisor alone.
2. **Catalog entry** is an internal pointer with catalog identity, source identity, scope fields, lifecycle state, and producer metadata.
3. **Safe discovery entry** is the filtered projection of an eligible catalog entry. It contains only the selection metadata and Core-issued capability IDs needed by Climate Advisor.
4. **Capability definition** is a Core-owned, statically allowlisted description of an operation, its accepted input, its typed output, its required scope, its bounds, and its module transport.
5. **Selection** identifies a catalog entry and a Core-issued capability for the current request. It is a request to revalidate, not proof that access remains valid.
6. **Authorized execution context** is an internal result of all read-time checks. It may contain source routing context needed by the module adapter, but it is never serialized to Climate Advisor.
7. **Bounded result** is the minimum typed, field-filtered, finite result that satisfies the selected capability's contract.
8. **Safe capability error** is the stable caller-visible outcome for source-selection resolution failures. It does not reveal which check failed.

## Discovery flow

Discovery is a filtering operation, not a source search oracle and not an access grant.

```text
Authenticated CA request
        |
        v
Validate service + user-bound session + request context
        |
        v
Enumerate candidate catalog rows within Core's query boundary
        |
        v
For each candidate: state -> scope -> allowlist -> source readiness
        |
   eligible / ineligible
      |          |
      v          v
Safe projection   Omit with no reason
      |
      v
Bounded discovery response + safe outcome telemetry
```

### Discovery decision sequence

For each candidate row, Core shall:

1. Require the existing Climate Advisor service authentication and the existing user-scoped bearer-session pattern. Service identity alone is insufficient.
2. Validate the request shape and establish the effective request context. Invalid transport/authentication handling follows existing service conventions and must not include catalog/source metadata.
3. Consider only a catalog entry whose lifecycle state is `active`.
4. Evaluate every populated applicable scope dimension. The user, organization, project, city, and inventory relationships must all be resolvable and authorized. A mismatch, missing required context, or uncertain relationship makes the candidate ineligible.
5. Resolve the exact `(owningModule, kind, sourceType)` tuple through the Core-owned capability allowlist. A missing, unknown, or not-ready mapping makes the candidate ineligible.
6. Verify that the underlying module source exists, is available, and is readable through its approved bounded boundary. A source that is missing, deleted, unavailable, or unreadable makes the candidate ineligible.
7. Project only safe metadata and Core-issued capability IDs. Source IDs, raw scope identifiers, storage locations, credentials, signed URLs, and content are not projected.
8. Omit every ineligible candidate without a reason, state, label, or substitute metadata. The response must not let Climate Advisor distinguish unauthorized, unavailable, withdrawn, superseded, missing, or deleted entries.
9. Emit only safe operational telemetry: correlation reference, safe caller reference, approved identity where permitted, coarse outcome, bounded duration, and dependency/timeout category.

The discovery result is a point-in-time set. Climate Advisor may use it to choose a tool, but Core must not treat it as durable authorization for a later read.

## Capability eligibility model

Capability eligibility requires all of the following predicates:

```text
eligible(entry, request) =
  authenticated(request)
  AND entry.availability == active
  AND everyPopulatedScopeIsAuthorized(entry, request)
  AND exactAllowlistMapping(entry) exists
  AND mappedBoundaryIsReady(entry)
  AND underlyingSourceIsAvailable(entry)
```

The mapping is exact and closed. Routes, capability identifiers, source identities, and module boundaries are not derived from catalog labels, arbitrary source types, model output, or Climate Advisor-provided route strings. GHGI and HIAP adapters are candidates only where their existing bounded boundaries are approved and ready. CNB remains conditional on the same readiness and acceptance requirement; no generic fallback is introduced.

## Selected-read flow

Selected reads are authorization-sensitive operations and are independently revalidated.

```text
Selection + bounded input
        |
        v
Authenticate service and bind request user
        |
        v
Validate request shape/context
        |
        v
Resolve catalog identity and capability identity
        |
        v
Recheck active/current state and exact allowlist mapping
        |
        v
Recheck every applicable scope relationship
        |
        v
Verify current module source availability/readability
        |
   valid / invalid
      |        |
      v        v
Bounded module read  Safe 404 capability_unavailable
      |
      v
Schema + field + size shaping, redaction, telemetry, response
```

### Selected-read decision sequence

1. Authenticate the Climate Advisor service request and bind the requested user to the authenticated user-scoped session using existing Core behavior.
2. Validate JSON shape, required selection fields, request context, and bounded capability input. A validly transported but stale, forged, malformed, unknown, mismatched, unauthorized, or unavailable selection enters the non-disclosing selection-failure path.
3. Resolve the catalog identity internally. Do not return source identity or resolution details.
4. Confirm the catalog entry is currently active and the selection refers to the current entry, not a withdrawn or superseded entry.
5. Resolve the exact capability allowlist mapping and confirm that the requested Core-issued capability belongs to the resolved entry.
6. Re-evaluate every populated applicable user, organization, project, city, and inventory relationship.
7. Verify the underlying source is present, available, readable, and reachable through the module-owned bounded boundary.
8. If any selection-resolution check fails, return the same caller-visible safe error: HTTP 404, code `capability_unavailable`, message `Requested capability is unavailable.` The error contains no source/catalog identity, state, labels, scope, storage detail, or content.
9. If all checks pass, invoke only the mapped bounded operation with the validated input and authorized internal context.
10. Validate and shape the module result using the capability's output schema, field allowlist, source-specific redaction, and finite result/size bounds. Invalid upstream data is rejected or normalized without being exposed.
11. Emit safe outcome telemetry and return the common bounded response envelope.

Authentication failures that occur before selection resolution continue to use the existing service/authentication contract. They must not become a source-existence channel. The exact route and transport envelope remain implementation concerns for the later code-generation stage; the functional selection-failure behavior above is fixed by this design.

## Source lifecycle and caller-visible behavior

| Internal state or condition | Discovery | Selected read |
|---|---|---|
| Active, authorized, mapped, ready, readable | Return safe entry. | Execute mapped bounded read after all rechecks. |
| Active but unauthorized or uncertain scope | Omit. | Safe `capability_unavailable`. |
| Active but unknown/not-ready mapping | Omit. | Safe `capability_unavailable`. |
| Active catalog row but missing/deleted/unavailable/unreadable source | Omit. | Safe `capability_unavailable`. |
| Withdrawn | Omit. | Safe `capability_unavailable`. |
| Superseded | Omit; the prior entry is not a usable alias. | Safe `capability_unavailable`; no automatic substitution. |
| Stale selection after a state change | Not applicable to the already-completed response. | Revalidate and return safe `capability_unavailable`; never return a stale result. |
| Forged, unknown, capability-mismatched, or malformed selection | Not applicable. | Safe `capability_unavailable`; no resolution detail. |

The replacement of a superseded entry is not implicitly disclosed or selected. A new discovery operation may return a replacement only if it independently satisfies the same scope, mapping, and source-readiness rules.

## Scope evaluation model

Scope is conjunctive across populated dimensions:

```text
authorized(entry, request) =
  for each dimension in {user, organization, project, city, inventory}:
    if entry.dimension is populated:
      request context for dimension is present and resolvable
      AND Core authorization for that relationship succeeds
      AND request dimension matches entry dimension
```

An absent catalog dimension does not create an authorization grant for another dimension. A populated catalog dimension cannot be ignored because a broader organization, city, or user relationship is authorized. If Core cannot resolve the required relationship, it fails closed. The catalog's scope fields are never sent to Climate Advisor as an explanation for an omission or denial.

## Bounded result model

Each capability definition declares:

- accepted input fields and validation constraints;
- operation type and required resource scope;
- output fields permitted to cross the Core boundary;
- source-specific redaction rules;
- finite item, field, byte, or equivalent size limits; and
- a common safe response envelope.

The module remains the source of truth, but Core is the final boundary shaper. Neither Climate Advisor nor a model decides which source fields are safe. No result may contain S3 credentials, bearer tokens, signed URLs, storage keys/paths as access mechanisms, raw storage objects, direct database data, or an unrestricted source payload.

## Failure isolation and concurrency

- A dependency timeout, source failure, or state transition during one selected read produces a safe failure for that selection. It does not widen access, trigger a raw-storage fallback, or change authorization for unrelated tools.
- Revalidation occurs as close as practical to execution. A source withdrawn or superseded between discovery and read cannot produce a stale result.
- If a module call returns invalid shape, over-limit content, or forbidden fields, Core rejects or safely normalizes it and does not pass the invalid payload onward.
- Cleanup is required on both success and failure for database, HTTP, and module-boundary resources according to existing conventions.
- Climate Advisor may continue with independently authorized tools only under its existing orchestration contract; Core does not authorize or coordinate unrelated tool behavior.

## Verification model

Core evidence must prove both positive behavior and invariants:

| Evidence area | Required scenarios |
|---|---|
| Discovery | Authorized active entries; each populated scope denial; missing context; unsupported mapping; unavailable/readability failure; withdrawn/superseded/missing/deleted omission; safe metadata projection. |
| Selected read | Authorized exact entry; catalog/capability mismatch; stale, forged, unknown, malformed, and invalid selections; every scope denial; state transitions; source failure; safe 404 contract. |
| Boundaries | Service auth and user binding; module adapter selection; no route derivation from untrusted values; no storage access crossing the boundary. |
| Result safety | Typed shape, field allowlist, finite bounds, redaction, forbidden-field absence, invalid-upstream normalization. |
| Resiliency/cleanup | Timeout, dependency failure, cleanup on both paths, isolated failure, no stale result. |
| Operations | Safe correlation/outcome telemetry with no credentials, tokens, content, storage details, or unnecessary scope data. |

Partial property-based testing applies to pure scope, allowlist, selection, safe-projection, bounded-result, and safe-error invariants. Generators must cover populated/absent scope dimensions, lifecycle states, mapping combinations, malformed selection values, forbidden fields, and boundary-sized results; failures must be reproducible with recorded seeds and shrinking.

## Traceability and handoff

| Model area | Requirements | Stories | Downstream handoff |
|---|---|---|---|
| Authorized discovery and omission | FR-01, FR-02, FR-06, FR-07, NFR-01, NFR-02 | US-01, US-05 | UOW-02 consumes safe entries; UOW-03 verifies omission/non-disclosure. |
| Allowlisted capability eligibility | FR-03, FR-04, NFR-07 | US-02 | UOW-02 binds only Core-issued IDs; UOW-03 checks unknown/mismatch cases. |
| Bounded selected read | FR-05, FR-06, FR-09, FR-10, NFR-01, NFR-03, NFR-06 | US-04, US-06 | UOW-02 consumes typed safe results/errors; UOW-03 verifies bounds and forbidden data. |
| Core verification | FR-11, NFR-08 | US-08 | UOW-03 consumes deterministic fixtures and cross-service evidence. |

## Explicit non-goals

This model does not introduce a new catalog owner, source database, shared storage layer, deployment topology, UI, model-driven authorization, raw datasource fallback, generic adapter framework, or automatic superseded-source substitution. Any such change requires a separately approved scope decision.
