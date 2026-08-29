# UOW-02 Functional Design — Domain Entities and Data Classification

## Modeling principles

These entities model Climate Advisor's request-time consumer boundary. They do
not require new database tables, durable catalog storage, storage credentials,
or a shared runtime package. NativeInputCatalog, authorization evidence,
module source data, and bounded result shaping remain Core/module-owned. The
classification distinguishes values that may cross the Core–Climate Advisor
boundary from internal values that must stay inside Core or runtime memory.

## Entity catalog

### 1. ActiveRequestContext

The authenticated, current context used for one message/agent request.

| Field | Meaning | Classification |
|---|---|---|
| `userId` | Canonical authenticated user subject | Internal input; safe caller reference only in approved telemetry |
| `threadId` | Current conversation correlation identity | Runtime correlation; not a source selector |
| `organizationId` | Active organization context when applicable | Sensitive scope; bound internally and not model-selectable |
| `projectId` | Active project context when applicable | Sensitive scope; bound internally and not model-selectable |
| `cityId` | Active city context when applicable | Sensitive scope; bound internally and not model-selectable |
| `inventoryId` | Active inventory context when applicable | Sensitive scope; bound internally and not model-selectable |
| `workflowMode` | General, Stationary Energy, Concept Note, or other existing mode | Safe routing state; preserves current workflow conditions |
| `correlationId` | Request/trace reference | Safe operational value |
| `bearerToken` | User-scoped token propagated to Core | Secret runtime value; never serialized, logged, prompted, or persisted as selection data |

The context is resolved from the existing request/session/streaming path. A
persisted thread value cannot override a changed active context, and an absent
context does not create a broader authorization.

### 2. CoreDiscoveryRequest

The bounded request sent by Climate Advisor to Core for the current context.

| Field | Meaning | Classification |
|---|---|---|
| authenticated user/session | Bearer-bound identity consumed by Core | Secret/auth input; never exposed in response |
| service identity | Existing Climate Advisor service headers | Secret/runtime auth input; never exposed |
| request context | Applicable user/resource context | Sensitive internal authorization input |
| bounded filters | Optional approved discovery constraints | Validated input; no arbitrary route/source/storage fields |
| correlation reference | Request tracing value | Safe operational value |

Climate Advisor does not include raw catalog rows, source IDs, storage
locations, permission explanations, or model-generated routing values.

### 3. CoreDiscoveryResponse

The point-in-time safe response from Core. It is not a durable authorization
grant.

| Field/component | Meaning | Classification |
|---|---|---|
| eligible entries | Only active, authorized, mapped, ready, readable projections | Safe only as returned by Core |
| empty result | No eligible entries for this evaluated request | Safe; no count/reason for hidden entries |
| safe envelope metadata | Approved bounded response metadata | Safe only if explicitly allowlisted |
| omission reason/state | Why a candidate was absent | Forbidden; must not be reconstructed |
| raw scope/source/storage fields | Internal Core data | Forbidden to Climate Advisor |

Climate Advisor validates the envelope and treats unknown or malformed required
fields as unavailable without passing the upstream body through.

### 4. SafeCatalogEntry

One eligible discovery projection that can be considered for the active
request.

| Field | Meaning | Classification |
|---|---|---|
| `catalogId` | Stable selection handle issued by Core | Safe for an eligible current entry |
| safe kind/module/source labels | Selection context approved by Core | Safe only after Core filtering; not used to derive routes |
| `capabilityIds` | Core-issued operations valid for this entry | Opaque safe contract values |
| safe capability metadata | Bounded input/output hints if included | Safe only when explicitly projected |
| source ID | Module's internal source identity | Forbidden |
| raw scope identifiers | User/org/project/city/inventory IDs from the catalog | Forbidden except as internal request context where Core requires them |
| lifecycle/readiness reason | Active/withdrawn/deleted/unavailable explanation | Forbidden; omitted entries have no consumer-visible reason |
| storage/credential fields | Object keys, URLs, tokens, credentials | Forbidden |

### 5. CapabilityDescriptor

The consumer's typed view of one Core-issued capability attached to a safe
catalog entry.

| Field | Meaning | Classification |
|---|---|---|
| `catalogId` | Exact entry to which the capability belongs | Runtime selection value |
| `capabilityId` | Opaque Core-issued operation identifier | Runtime selection value; never derived |
| operation type | Approved bounded read/query operation | Safe contract metadata |
| input schema | Allowed fields, types, and limits | Safe tool-contract metadata |
| output schema | Fields and shape Core may return | Safe tool-contract metadata |
| result bounds | Finite item/field/byte or equivalent limits | Safe contract metadata where useful |
| required context | Context dimensions bound by the active request | Internal binding requirements |
| transport binding | Core endpoint/route implementation | Internal client concern; not exposed or model-derived |

No descriptor exists for an unselected entry. A descriptor is never an
authorization substitute.

### 6. CatalogCapabilitySelection

The immutable request-time pair and input binding used to construct a selected
tool.

| Field | Meaning | Classification |
|---|---|---|
| `catalogId` | Selected current safe entry | Runtime value from current discovery |
| `capabilityId` | Matching Core-issued capability | Runtime opaque value from current discovery |
| active request binding | User/workflow/context association | Sensitive runtime value; not model-editable |
| typed capability input | Bounded operation arguments | Validated model/tool input; no raw storage args |
| correlation reference | Request trace value | Safe operational value |

The pair is valid for construction only when it matches the current discovery
response. Core must independently revalidate it at read time.

### 7. RequestScopedCapabilityTool

The short-lived tool wrapper exposed to the agent for one selected capability.

| Field/component | Meaning | Classification |
|---|---|---|
| tool identity | Safe capability-specific name/description | Safe model-facing contract; must not reveal hidden source state |
| selection binding | Exact catalog/capability pair | Runtime closure; not arbitrary tool input |
| request context binding | Active user/workflow/resource context | Runtime sensitive value; not model-editable |
| typed input validator | Enforces capability fields and bounds | Consumer validation boundary |
| Core client operation | Narrow discovery/read client method | Internal behavior; no direct module/storage call |
| lifecycle state | Open during request, closed after completion | Runtime-only |

The tool wrapper must not retain a durable client, bearer token, raw source
handle, S3 credential, signed URL, or unrestricted source response.

### 8. BoundedCapabilityInput

The validated arguments accepted by one selected tool.

It contains only fields declared by the selected Core capability, with explicit
types, finite collection limits, and bounded string/number ranges. User,
organization, project, city, inventory, catalog, capability, route, source,
storage, credential, and arbitrary filter arguments are excluded unless a
separately approved capability schema explicitly represents them and Core
remains authoritative. The model cannot replace the active request context.

### 9. BoundedToolResult

The safe result made available to the Climate Advisor agent after Core's
bounded response has been validated.

| Field/component | Meaning | Classification |
|---|---|---|
| success/action identity | Safe result contract identity | Safe allowlisted field |
| typed data | Minimum fields declared by the capability | Safe only after Core shaping and consumer validation |
| bounded metadata | Optional safe context required by the request | Explicit allowlist only |
| correlation reference | Optional approved trace reference | Safe operational value |
| raw upstream response | Unshaped module/Core payload | Forbidden |
| storage/credential/source-state data | Internal access or lifecycle details | Forbidden |

### 10. SafeToolError

The model/tool-visible error for selected capability resolution failures.

| Field | Constraint | Classification |
|---|---|---|
| status/code/message | Preserve approved Core `404` / `capability_unavailable` / `Requested capability is unavailable.` contract at the tool boundary | Safe contract |
| catalog/capability/source identity | Absent from failure output | Forbidden |
| failure reason/lifecycle state | Absent | Forbidden |
| scope/permission details | Absent | Forbidden |
| upstream/storage/error text | Absent | Forbidden |
| safe correlation | Optional only where existing error conventions permit | Safe operational value |

Transport/authentication failures outside selection resolution use existing
generic Climate Advisor handling and still omit source metadata and secrets.

### 11. TokenReference

The existing mutable request token reference shared by tools that participate in
the established refresh flow.

| Field | Meaning | Classification |
|---|---|---|
| current token value | Latest user-scoped bearer for Core calls | Secret runtime value only |
| refresh eligibility | Existing one-time refresh state | Internal runtime state |
| user binding | User identity used for refresh | Sensitive internal state |
| persistence outcome | Existing token-handler result | Safe coarse telemetry only |

The reference may be updated after a successful refresh and persisted through
the existing thread/token handler. It is never included in a tool result,
prompt, log, telemetry payload, or selection entity crossing a service
boundary.

### 12. WorkflowToolPack

The existing mode-specific collection of Climate Advisor tools.

| Component | Rule |
|---|---|
| General/inventory/vector pack | Retains current registration conditions and legacy behavior. |
| Stationary Energy pack | Retains current draft/surface scope and persisted-run checks. |
| Concept Note pack | Retains current persisted context and allowed workflow-step checks. |
| Catalog-backed pack | Additive, request-time, and selected-only; never global or raw-source. |
| Disabled/empty/unavailable catalog pack | Contains no catalog-backed tools; existing packs remain unchanged. |

### 13. ClientResourceLifetime

The bounded lifecycle of HTTP clients, responses, streams, and tool resources
used for discovery/read calls.

| State | Meaning |
|---|---|
| `not_started` | No catalog call or capability has been loaded. |
| `discovery_active` | One request-time discovery call and lightweight Core processing are underway. |
| `selection_bound` | Current safe entry and Core-issued capability are captured. |
| `read_active` | Only the selected bounded read is executing. |
| `completed` | Result/error transformed and resources eligible for closure. |
| `closed` | Resources released on success, failure, cancellation, timeout, or refresh failure. |

No resource state is persisted as catalog authorization.

### 14. SafeOperationalOutcome

The consumer telemetry projection for a discovery/read attempt.

| Field | Meaning | Classification |
|---|---|---|
| correlation reference | Request/trace correlation | Safe |
| safe caller reference | Non-secret user/service reference | Safe only under existing telemetry policy |
| approved catalog/capability ID | Selected identity where allowed | Safe only where it cannot disclose unauthorized existence |
| coarse outcome | Registered, omitted, success, unavailable, timeout, dependency, validation, or equivalent | Safe coarse category |
| bounded duration | Operation duration | Safe |
| error/body/content/token/scope detail | Diagnostic raw data | Forbidden |

## Relationships and lifecycle

```text
ActiveRequestContext
        |
        +--> CoreDiscoveryRequest --> CoreDiscoveryResponse
                                           |
                                           +--> SafeCatalogEntry
                                                   |
                                                   +--> CapabilityDescriptor
                                                            |
                                                            v
                                                   CatalogCapabilitySelection
                                                            |
                                                            v
                                                   RequestScopedCapabilityTool
                                                            |
                                                            +--> BoundedCapabilityInput
                                                            |
                                                            v
                                                   Core selected bounded read
                                                            |
                                                            +--> BoundedToolResult
                                                            +--> SafeToolError
                                                            +--> SafeOperationalOutcome
```

### Discovery lifecycle

1. Resolve `ActiveRequestContext` through the existing Climate Advisor flow.
2. Call Core once using `CoreDiscoveryRequest`.
3. Validate and retain only safe `SafeCatalogEntry` projections.
4. Treat Core readiness as non-content eligibility; no Climate Advisor source
   tool is loaded or executed during discovery.
5. Discard the response with no reason when empty, disabled, malformed, or
   unavailable.

### Selection/read lifecycle

1. Match a selection to the current safe discovery response.
2. Build one `RequestScopedCapabilityTool` for the selected descriptor.
3. Validate `BoundedCapabilityInput` and bind active context internally.
4. Call only the Core selected-read boundary for that selection.
5. Let Core reauthorize/revalidate and shape the result.
6. Transform to `BoundedToolResult` or `SafeToolError`.
7. Release all `ClientResourceLifetime` resources.

## Data crossing the Core–Climate Advisor boundary

| Data category | Discovery | Selected read | Tool/model | Telemetry |
|---|---|---|---|---|
| Safe catalog ID | Eligible entries only | Exact request input | Hidden/bound where possible | Only approved |
| Core capability ID | Eligible entries only | Exact request input | Hidden/bound where possible | Only approved |
| Safe labels/schema hints | Eligible entries only | Not needed for routing | Minimal contract text | Usually omitted |
| Request scope IDs | Only as required by Core transport; never as catalog metadata | Bound from active context | Never model-selected | Avoid unless approved |
| Raw source ID | Never | Never | Never | Never |
| Lifecycle/permission reason | Never | Never | Never | Coarse category only |
| Bearer/service/storage credentials | Never | Transport only, never payload | Never | Never |
| Storage locations/signed URLs | Never | Never | Never | Never |
| Source content | Never | Core-shaped bounded fields only | Minimum typed result | Never |
| Upstream response/error body | Never | Never | Never | Never |

## Invariants

1. A `SafeCatalogEntry` exists only because Core returned it for the current
   authenticated request.
2. Discovery readiness never invokes a full source read or loads unselected
   Climate Advisor capability code.
3. A `RequestScopedCapabilityTool` has exactly one current matching catalog and
   Core capability pair.
4. Only the selected capability executes; unselected entries remain unloaded
   and unread.
5. Core remains the authorization and source-state authority on every read.
6. `BoundedCapabilityInput` cannot broaden identity/scope or provide routing or
   storage arguments.
7. Every selected-resolution failure maps to `SafeToolError` without source
   existence, state, metadata, scope, storage, or upstream disclosure.
8. Every success is a finite, typed, Core-shaped `BoundedToolResult`.
9. Tokens, credentials, raw content, signed URLs, and raw storage access never
   cross into Climate Advisor tool/model output or telemetry.
10. Existing `WorkflowToolPack` behavior remains compatible and independent.
11. `ClientResourceLifetime` reaches `closed` on every terminal path.

## Traceability

| Entity/model area | Requirements / NFRs | Stories | Linear CC-737 concern |
|---|---|---|---|
| ActiveRequestContext, CoreDiscoveryRequest/Response | FR-01, FR-02, FR-04, FR-06, FR-07, NFR-01, NFR-03 | US-03, US-07, US-09 | Request-time discovery in the caller's authorized context. |
| SafeCatalogEntry, CapabilityDescriptor, Selection | FR-03, FR-04, FR-08, NFR-05, NFR-07 | US-03, US-09 | Core-issued exact selection and selected-only loading. |
| RequestScopedCapabilityTool, BoundedCapabilityInput | FR-04, FR-05, FR-08, NFR-01, NFR-02, NFR-07 | US-03, US-07, US-09 | Typed bounded tools with no arbitrary routing/storage access. |
| BoundedToolResult, SafeToolError | FR-05, FR-07, FR-10, NFR-01, NFR-03, NFR-06 | US-03, US-09 | Bounded reads and stable non-disclosing errors. |
| TokenReference, ClientResourceLifetime | FR-09, FR-10, NFR-04, NFR-05, NFR-06 | US-07, US-09 | Existing refresh, timeout, cancellation, and cleanup behavior. |
| WorkflowToolPack, SafeOperationalOutcome | FR-08, FR-09, FR-11, NFR-05, NFR-06, NFR-08 | US-07, US-09 | Compatibility, safe telemetry, and consumer evidence. |

## Deferred implementation choices

Later approved stages decide concrete Python models/typing, client method
names, tool factory layout, route serialization, exact numeric bounds based on
the Core contract, telemetry event names, and test-file placement. Those
choices must preserve the classifications, relationships, invariants, and
approved UOW-01 error/bounded-read contract above.
