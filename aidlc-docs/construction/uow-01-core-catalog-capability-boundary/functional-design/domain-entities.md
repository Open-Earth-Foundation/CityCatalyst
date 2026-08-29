# UOW-01 Functional Design — Domain Entities and Data Classification

## Modeling principles

These are conceptual entities and value objects for the Core catalog/capability boundary. They do not require new database tables or services. Existing NativeInputCatalog persistence and module-owned source models remain authoritative. The model distinguishes internal authorization data from the safe projections and telemetry permitted to cross service boundaries.

## Entity catalog

### 1. RequestContext

Represents the active request under which discovery or a read is evaluated.

| Field | Meaning | Classification |
|---|---|---|
| `userId` | Authenticated user subject bound by Core | Internal; safe caller reference only in telemetry |
| `organizationId` | Explicit organization context, when applicable | Internal sensitive scope |
| `projectId` | Explicit project context, when applicable | Internal sensitive scope |
| `cityId` | Explicit city context, when applicable | Internal sensitive scope |
| `inventoryId` | Explicit inventory context, when applicable | Internal sensitive scope |
| `correlationId` | Request/thread correlation reference | Safe to log; may cross as an operational correlation value |
| bounded filters | Optional discovery constraints | Validated request data; only safe effects cross boundary |

The effective user is taken from the authenticated user-scoped session. The context is not complete merely because Climate Advisor supplied identifiers; Core must resolve and authorize each applicable relationship.

### 2. AuthenticatedCaller

Represents the authenticated service and user relationship established before catalog evaluation.

| Field | Meaning | Classification |
|---|---|---|
| service identity | Climate Advisor service identity from the existing service-auth mechanism | Internal authorization input |
| user subject | User identity from the bearer/session validation | Internal; safe reference only |
| session validity | Authentication/session status and claims needed by Core permission checks | Internal; never serialized |
| feature/integration eligibility | Existing Core feature boundary result | Internal control |

The bearer token, service key, claims not needed for the contract, and authentication failure details are never returned or logged as raw values.

### 3. CatalogEntry

The internal NativeInputCatalog pointer and lifecycle record.

| Field | Meaning | Classification |
|---|---|---|
| `catalogId` | Stable catalog identity | Internal; safe to return only when the entry is eligible and selection requires it |
| `kind` | Catalog kind | Internal; safe label only after eligibility |
| `owningModule` | Module owning source behavior | Internal; safe label only after eligibility |
| `sourceType` | Source category used by exact mapping | Internal; safe label only after eligibility |
| `sourceId` | Module/source-system identity | Sensitive internal routing data; forbidden to Climate Advisor |
| scope fields | User, organization, project, city, and inventory relationships | Sensitive internal authorization data; forbidden to Climate Advisor |
| `availability` | Active, withdrawn, or superseded lifecycle state | Internal; never disclose for an ineligible entry |
| `supersededById` | Replacement relationship | Internal; never disclose as a read fallback or error detail |
| producer metadata | Content digest, markdown readiness, labels, timestamps | Internal; only explicitly approved safe projections may cross |

The entity is a pointer, not a permission. A row's presence, source identity, and lifecycle state must not be disclosed when it is not eligible.

### 4. ScopeConstraint and ScopeEvaluation

`ScopeConstraint` is the set of populated scope dimensions on a catalog entry. `ScopeEvaluation` is Core's internal result for comparing those constraints with the authenticated request.

| Concept | Meaning |
|---|---|
| populated dimension | A user, organization, project, city, or inventory relationship stored on the entry |
| applicable context | The corresponding request context and Core permission relationship required to evaluate it |
| match | The authenticated caller is authorized for the exact populated relationship |
| uncertain | Required context or permission cannot be resolved; always fails closed |
| overall result | `authorized` only when every populated applicable dimension matches |

`ScopeEvaluation` must not be returned as a reason-bearing response. It may be converted to a coarse safe outcome category for telemetry.

### 5. CapabilityKey

The exact identity used to resolve the Core allowlist:

```text
(owningModule, kind, sourceType)
```

The key is assembled from validated catalog data inside Core. Climate Advisor, model output, labels, and arbitrary route strings cannot create or alter it.

### 6. CapabilityDefinition

The Core-owned definition of one bounded source operation.

| Field | Meaning | Classification |
|---|---|---|
| `capabilityId` | Core-issued stable operation identifier | Safe only when attached to an eligible discovery entry or approved telemetry |
| operation type | Query/read operation supported by the boundary | Safe contract metadata |
| owning module | Module boundary to invoke | Safe label after eligibility; route internals remain internal |
| required resource scope | Scope dimensions needed for the operation | Internal contract metadata; do not expose unnecessary identifiers |
| input schema | Accepted fields, types, and limits | Safe contract metadata after selection |
| output schema | Typed fields permitted in the result | Safe contract metadata; actual data remains bounded |
| result bounds | Finite count, field, size, or equivalent limits | Safe contract metadata if useful; exact operational details may remain internal |
| redaction policy | Source-specific forbidden/filtered fields | Internal enforcement policy |
| transport binding | Approved module-owned bounded boundary | Internal; never derived from untrusted input |
| readiness | Whether this definition can be advertised/executed | Internal; ineligible entries are omitted |

A capability definition without a complete input/output/bounds/transport contract is not eligible.

### 7. SafeDiscoveryEntry

The minimal response projection for an eligible `CatalogEntry`.

| Field | Meaning | Classification |
|---|---|---|
| `catalogId` | Selection handle | Safe for an eligible entry |
| safe kind/module/source labels | Human/system selection context | Safe only after eligibility and allowlist approval |
| Core-issued `capabilityIds` | Operations Climate Advisor may select | Safe only for the eligible entry |
| safe labels/readiness | Explicitly approved non-sensitive selection hints | Optional; filter from raw labels |
| minimum request context | Non-sensitive context needed by the active request | Only the minimum; no raw scope identifiers by default |

It must not contain `sourceId`, raw scope IDs, lifecycle reason, storage metadata, credentials, signed URLs, or source content. An empty result is not a reason-bearing denial response; it simply contains no eligible entries.

### 8. Selection

The bounded request object used to ask Core to read a source capability.

| Field | Meaning | Classification |
|---|---|---|
| selected `catalogId` | Entry the active request intends to use | Request input; must be resolved and revalidated |
| selected `capabilityId` | Core-issued capability requested for that entry | Request input; must match the allowlist and discovery result |
| request context | Active user/resource context | Request input; Core remains authoritative |
| capability input | Typed source operation arguments | Bounded request input; no raw storage arguments |
| correlation reference | Request tracing value | Safe operational value |

The selection is not proof of discovery, ownership, or current authorization. A selection that is absent from the current authorized result, stale, forged, malformed, mismatched, or otherwise invalid is handled by the safe selection-error rule.

### 9. AuthorizedExecutionContext

An internal, short-lived context produced only after all selected-read checks pass.

It binds the authenticated caller, request scope, current catalog entry, exact capability definition, and module-owned source execution context. It may contain internal source routing data and permission evidence, but none of those fields may be serialized to Climate Advisor or placed in unsafe logs. It must not outlive the read operation or become a new persistence record.

### 10. BoundedCapabilityResult

The common safe response shape after module execution and Core shaping.

| Field or component | Meaning | Classification |
|---|---|---|
| action/capability identity | Safe operation identity when required by the approved contract | Safe contract field |
| success indicator | Whether the bounded operation completed | Safe contract field |
| typed data | Minimum fields permitted by the output schema | Safe only after shaping/redaction/bounds |
| bounded metadata | Optional safe context needed by the active request | Explicit allowlist only |
| correlation reference | Trace value if part of the existing contract | Safe operational field |

The result cannot contain raw module responses, unrestricted arrays/objects, storage objects, credentials, signed URLs, direct storage paths as access mechanisms, or internal permission/source-state details.

### 11. SafeCapabilityError

The caller-visible error for selection-resolution failures.

| Field | Value/constraint | Classification |
|---|---|---|
| HTTP status | `404` for selection-resolution failures | Safe contract field |
| code | `capability_unavailable` | Safe contract field |
| message | `Requested capability is unavailable.` | Safe contract field |
| source/catalog identity | Absent | Forbidden |
| failure reason/state | Absent | Forbidden |
| scope/permission details | Absent | Forbidden |
| storage/content details | Absent | Forbidden |
| correlation reference | Optional only if allowed by the existing safe error contract | Safe operational field |

This error covers stale, forged, malformed, invalid, unknown, mismatched, unauthorized, withdrawn, superseded, missing, deleted, unavailable, and unreadable selections. Missing/invalid service authentication and transport-level invalid JSON remain governed by existing authentication/request-validation contracts, with no catalog/source disclosure.

### 12. SourceAvailabilityAssessment

An internal assessment of whether the module-owned source can support the exact operation now. It is not a public lifecycle API.

Possible internal outcomes include available/readable, missing, deleted, unavailable, unreadable, timeout, or unknown. All source-selection outcomes other than successful readiness collapse to the safe selection error for a selected read and omission for discovery. Detailed dependency categories may be used in safe telemetry.

### 13. OperationalOutcome

The safe telemetry value emitted for discovery/read processing.

| Field | Constraint |
|---|---|
| correlation reference | Required where the existing telemetry pattern supports it |
| safe caller reference | No raw bearer/service credential |
| approved catalog/capability identity | Only where permitted and not an unauthorized existence channel |
| coarse outcome | Authorized, omitted, unavailable, validation, timeout, dependency, or equivalent coarse category |
| bounded duration | Numeric duration within existing telemetry conventions |
| dependency category | Coarse module/permission/transport/timeout category |

Raw requests/responses, tokens, credentials, source content, storage details, signed URLs, and unnecessary scope identifiers are forbidden.

## Relationships and lifecycle

```text
AuthenticatedCaller
        |
        +--> RequestContext
                    |
                    +--> evaluates --> CatalogEntry --has--> ScopeConstraint
                    |                         |
                    |                         +--> resolves by CapabilityKey
                    |                                      |
                    |                                      v
                    |                              CapabilityDefinition
                    |                                      |
                    |                                      v
                    |                              module-owned source boundary
                    |
                    +--> projects --> SafeDiscoveryEntry
                    |
                    +--> accepts --> Selection
                                      |
                                      +--> validates --> AuthorizedExecutionContext
                                                              |
                                                              v
                                                     BoundedCapabilityResult
                                                              |
                                                              +--> OperationalOutcome
```

### Discovery projection lifecycle

1. Internal catalog and permission data are loaded within Core.
2. Ineligible rows are discarded without a public reason.
3. Eligible rows are projected into `SafeDiscoveryEntry`.
4. The projection is returned only for the current request and does not persist an authorization grant.

### Selected-read lifecycle

1. `Selection` arrives from a request-scoped consumer.
2. Core resolves and rechecks `CatalogEntry`, `ScopeConstraint`, `CapabilityDefinition`, and `SourceAvailabilityAssessment`.
3. On failure, only `SafeCapabilityError` crosses the selection boundary.
4. On success, a short-lived `AuthorizedExecutionContext` drives one bounded module read.
5. Core creates `BoundedCapabilityResult`, emits safe `OperationalOutcome`, and releases resources.

### Lifecycle state transitions

```text
active --withdraw--> withdrawn
active --supersede--> superseded
active --source unavailable/deleted--> not eligible for discovery/read
```

Source availability is evaluated in addition to catalog lifecycle. A source becoming unavailable does not mutate catalog ownership or authorize a replacement. A successor after supersession is independently evaluated.

## Data crossing the Core–Climate Advisor boundary

| Data category | Discovery | Selected read | Telemetry |
|---|---|---|---|
| Safe catalog identity | Eligible entries only | Request input; never echoed on failure | Only where approved |
| Core-issued capability ID | Eligible entries only | Request input; safe contract identity | Where approved |
| Safe labels | Eligible entries only | Not needed for execution | Usually omitted |
| Raw source ID | Never | Never | Never |
| Raw scope identifiers | Never | Never | Never/unnecessary |
| Credentials/tokens/signed URLs | Never | Never | Never |
| Storage locations/objects | Never | Never | Never |
| Source content | Never in discovery | Typed bounded fields only | Never |
| Error reason/state | Never | Never; stable generic error only | Coarse category only |

## Invariants

1. No unauthorized or unavailable entry is present in the safe discovery result.
2. Every returned capability ID is produced by Core's allowlist for the returned entry.
3. Every selected read rechecks the authenticated user, each applicable scope dimension, current catalog state, exact mapping, and source readiness.
4. Any failed selection-resolution check produces the same safe error and no source metadata.
5. Successful results satisfy the declared schema, field allowlist, redaction, and finite bounds.
6. No credential, signed URL, raw storage access, raw source payload, or unnecessary scope data crosses the boundary.
7. A failed or stale selection cannot widen access or authorize an unrelated capability.
8. Resource cleanup occurs on all success and failure paths.
9. The model introduces no new storage owner, persistence entity, or authorization authority.

## Traceability

| Entity/model area | Requirements | Stories |
|---|---|---|
| RequestContext, AuthenticatedCaller, ScopeConstraint | FR-01, FR-06, FR-07; NFR-01 | US-01, US-03, US-05, US-06, US-08 |
| CatalogEntry, SafeDiscoveryEntry | FR-01, FR-02, FR-04; NFR-02, NFR-06 | US-01, US-02, US-05 |
| CapabilityKey, CapabilityDefinition | FR-03, FR-04, FR-05; NFR-07 | US-02, US-04, US-08 |
| Selection, AuthorizedExecutionContext | FR-04, FR-06, FR-07, FR-10; NFR-01, NFR-04 | US-04, US-06, US-08 |
| BoundedCapabilityResult, SafeCapabilityError | FR-05, FR-07, FR-10, FR-11; NFR-01, NFR-03, NFR-08 | US-04, US-06, US-08 |
| SourceAvailabilityAssessment, OperationalOutcome | FR-07, FR-09, FR-10, FR-11; NFR-04, NFR-06 | US-05, US-06, US-08 |

## Deferred implementation choices

The following remain for later approved stages: exact route names and HTTP envelope serialization beyond the fixed safe selection-error values; concrete schema-library types; module adapter class/function layout; query/index strategy; numeric bound values based on existing conventions; telemetry sink/event naming; and test-file placement. These choices must preserve every entity classification, relationship, invariant, and business rule above.
