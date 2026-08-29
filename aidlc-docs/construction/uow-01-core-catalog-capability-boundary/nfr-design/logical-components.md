# UOW-01 NFR Design — Logical Components

## Component boundary

UOW-01 is implemented as logical responsibilities within existing CityCatalyst Core and module boundaries. The components below are not new deployable services. They may map to existing services/classes/functions or small implementation units during Code Generation, but their authority and data boundaries are fixed here.

```text
Climate Advisor internal request
              |
              v
       [Core capability boundary]
              |
   +----------+-----------+
   |                      |
   v                      v
[Request/Auth]      [Catalog Discovery]
   |                      |
   +----------+-----------+
              v
       [Capability Registry]
              |
              v
     [Selection Validator]
              |
              v
   [Selected Module Source Adapter]
              |
              v
      [Bounded Result Shaper]
              |
      +-------+--------+
      v                v
[Safe Error Mapper] [Safe Telemetry]
      |
      v
  Core response to Climate Advisor
```

The Climate Advisor client/tool/agent components are downstream consumers in UOW-02. They are shown only as the external contract consumer; they do not own any Core component's authority.

## Component definitions

### LC-01 — Request and Authentication Context

**Responsibility**: Establish the authenticated Climate Advisor service request, bind the user-scoped bearer/session identity, validate the active request context, and carry a safe correlation reference.

**Inputs**: Existing service-auth headers, user-scoped session/token, bounded user/resource context, feature/integration state, correlation reference.

**Outputs**: Internal `AuthenticatedCaller` and bounded `RequestContext`, or existing authentication/request-validation failure.

**Authority**: Core authentication/session and existing permission conventions.

**Must not**: Accept service identity alone as user authorization; log or return raw tokens/claims; infer missing scope; expose authentication details as source metadata.

**NFR controls**: NFR-UOW01-04, NFR-UOW01-10 through NFR-UOW01-16, NFR-UOW01-18.

### LC-02 — Catalog Candidate Filter and Safe Projector

**Responsibility**: Evaluate candidate NativeInputCatalog rows for active state, all applicable scope dimensions, exact mapping eligibility, lightweight module/source readiness, and safe discovery projection. Discovery readiness is a bounded non-content probe only.

**Inputs**: Internal catalog entries, `RequestContext`, `AuthenticatedCaller`, capability registry metadata, permission/context services, and lightweight source-readiness assessments.

**Outputs**: `SafeDiscoveryEntry` for eligible candidates only; otherwise no public value/omission.

**Authority**: Core NativeInputCatalog and Core authorization.

**Must not**: Return omission reasons/placeholders; expose raw source/scope/storage data; treat catalog presence as access; authorize using a broader scope; load Climate Advisor tools; initialize executable source capabilities; invoke full capability operations; fetch source content; or execute full reads for all candidates.

**NFR controls**: NFR-UOW01-01, NFR-UOW01-02, NFR-UOW01-08, NFR-UOW01-10 through NFR-UOW01-14, NFR-UOW01-17, NFR-UOW01-18.

### LC-03 — Capability Registry and Allowlist Resolver

**Responsibility**: Resolve an exact `(owningModule, kind, sourceType)` tuple to Core-owned capability metadata and a Core-issued capability ID, including input/output schemas, required scope, bounds, redaction, and approved transport. During discovery, this is metadata/eligibility resolution only; it does not load or execute the capability.

**Inputs**: Validated catalog identity dimensions and readiness context.

**Outputs**: Internal `CapabilityDefinition` or unavailable/no-match.

**Authority**: Core capability registry and approved module boundary registrations.

**Must not**: Construct routes from untrusted values; accept model-generated capability IDs; match source type alone; advertise incomplete/not-ready definitions; load or execute capabilities during discovery; or load capabilities for unselected entries.

**NFR controls**: NFR-UOW01-02, NFR-UOW01-11, NFR-UOW01-15 through NFR-UOW01-17, NFR-UOW01-19.

### LC-04 — Selection Validator and Authorized Execution Context

**Responsibility**: Revalidate each selected read in the fixed order and create a short-lived internal execution context only when all checks pass.

**Validation order**:

1. service authentication and user binding;
2. request/selection/input shape;
3. catalog identity resolution;
4. active/current lifecycle state;
5. exact capability mapping and catalog/capability match;
6. every populated user/organization/project/city/inventory scope dimension;
7. current source existence/availability/readability; and
8. bounded execution authorization.

**Inputs**: `Selection`, `RequestContext`, `AuthenticatedCaller`, catalog, registry, permission services, source-readiness adapter.

**Outputs**: Short-lived `AuthorizedExecutionContext` or a failure signal consumed only by LC-07 Safe Error Mapper.

**Authority**: Core authorization and current catalog/source state.

**Must not**: Trust discovery as current authorization; return denial reasons; substitute a replacement source; read source content before checks complete; persist execution authority.

**NFR controls**: NFR-UOW01-06, NFR-UOW01-08, NFR-UOW01-10 through NFR-UOW01-14, NFR-UOW01-16, NFR-UOW01-20.

### LC-05A — Lightweight Source Readiness Probe

**Responsibility**: Perform the discovery-time, bounded, non-content check that the exact mapped module boundary is configured/ready and that the source can be considered available/readable for later selection. This probe supports eligibility filtering; it is not a source read.

**Inputs**: Eligible-scope candidate, capability metadata, and the module boundary's safe readiness signal.

**Outputs**: Internal ready/not-ready outcome used by LC-02; no source content or executable capability result.

**Authority**: Module boundary for readiness signal; Core for candidate eligibility and non-disclosure.

**Must not**: Load Climate Advisor tools; initialize executable source capabilities; invoke full capability operations; fetch source content; execute full reads for all candidates; expose raw storage, S3 credentials, signed URLs, direct database access, or unrestricted payloads; or create a generic adapter for an unready CNB boundary.

**NFR controls**: NFR-UOW01-01, NFR-UOW01-02, NFR-UOW01-04, NFR-UOW01-08, NFR-UOW01-10 through NFR-UOW01-13, NFR-UOW01-16.

### LC-05B — Selected Bounded Source Adapter

**Responsibility**: After one authorized selection passes LC-04's full revalidation, load and execute only that selection's exact Core-approved, module-owned bounded capability.

**Inputs**: Short-lived `AuthorizedExecutionContext` from LC-04 and bounded capability input for one selected capability.

**Outputs**: One approved module result or internal dependency/availability/shape failure for that selected operation.

**Authority**: Module source boundary for source behavior; Core for caller authorization, selection, capability identity, bounds, and response shaping.

**Must not**: Load or execute capabilities for unselected entries; trust discovery without revalidation; expose raw storage, S3 credentials, signed URLs, direct database access, unrestricted payloads, or an alternate unapproved source; or substitute a different source.

**NFR controls**: NFR-UOW01-02, NFR-UOW01-04 through NFR-UOW01-09, NFR-UOW01-11, NFR-UOW01-13, NFR-UOW01-16, NFR-UOW01-19.

### LC-06 — Bounded Result Shaper

**Responsibility**: Enforce the capability's typed output schema, field allowlist, finite limits, source-specific redaction, and common safe response envelope.

**Inputs**: Capability definition and module result.

**Outputs**: `BoundedCapabilityResult` or safe internal failure.

**Authority**: Core boundary contract; module supplies source semantics but not cross-boundary policy.

**Must not**: Pass through raw responses, unknown fields, unrestricted arrays/objects, credentials, storage details, direct database data, or raw upstream errors.

**NFR controls**: NFR-UOW01-02, NFR-UOW01-04, NFR-UOW01-05, NFR-UOW01-10 through NFR-UOW01-13, NFR-UOW01-19.

### LC-07 — Safe Error Mapper

**Responsibility**: Collapse selection-resolution failures into the stable non-disclosing contract while preserving existing safe authentication/transport behavior where applicable.

**Inputs**: Internal validation, lifecycle, scope, mapping, readiness, dependency, timeout, and shaping outcomes.

**Outputs**: For selection-resolution failures, HTTP 404 with code `capability_unavailable` and message `Requested capability is unavailable.` No source/catalog identity, state, scope, storage, or content.

**Authority**: Core caller-facing contract.

**Must not**: Distinguish forbidden/not-found/unavailable/removed selection state; echo upstream error text; provide raw fallback; alter unrelated tool authorization.

**NFR controls**: NFR-UOW01-08, NFR-UOW01-10 through NFR-UOW01-14, NFR-UOW01-18 through NFR-UOW01-20.

### LC-08 — Safe Operational Telemetry

**Responsibility**: Produce safe, coarse operational outcomes after redaction and before emission for discovery/read, dependency, timeout, boundedness, cleanup, and rollout evidence.

**Inputs**: Correlation reference, safe caller reference, approved identity where allowed, coarse outcome, duration, dependency category.

**Outputs**: Existing structured logs/metrics/traces/dashboards/alerts according to current operations policy.

**Authority**: Existing observability/operations policy; Core owns which boundary facts are safe.

**Must not**: Record tokens, credentials, raw content, raw requests/responses, source/storage details, unnecessary scope IDs, signed URLs, or hidden-source reasons.

**NFR controls**: NFR-UOW01-05, NFR-UOW01-08, NFR-UOW01-10, NFR-UOW01-14, NFR-UOW01-17, NFR-UOW01-18.

### LC-09 — Contract Fixture and Verification Seam

**Responsibility**: Provide deterministic representations of Core-owned discovery entries, mappings, scope outcomes, lifecycle states, source failures, bounded results, and safe errors for service-local and cross-service tests.

**Inputs**: Approved Core contract and domain generators.

**Outputs**: Fixtures, doubles, reproducible property-based inputs, and safe evidence.

**Authority**: Core contract owners; UOW-02/UOW-03 consume but do not redefine authorization truth.

**Must not**: Require production storage, contain real credentials/content, replace critical example-based security tests, or encode a second authorization implementation.

**NFR controls**: NFR-UOW01-10, NFR-UOW01-17, NFR-UOW01-22, NFR-UOW01-23.

## Dependency and data-flow model

### Discovery

```text
LC-01 Request/Auth Context
  -> LC-02 Catalog Filter/Projector
       -> LC-03 Capability Registry
       -> LC-05A Lightweight Source Readiness Probe
       -> LC-08 Safe Telemetry
  -> safe discovery response
```

LC-02 may evaluate candidates independently within bounded existing access controls, but an eligible response requires all applicable checks. LC-05A may issue only a lightweight non-content readiness probe per candidate. No capability is loaded or executed, and no source content is read during discovery. No internal failure reason is returned to the caller.

### Selected read

```text
request selection/input
  -> LC-01 Request/Auth Context
  -> LC-04 Selection Validator
       -> LC-03 Capability Registry
       -> permission/context authority
       -> LC-05B Selected Bounded Source Adapter
       -> LC-06 Bounded Result Shaper
       -> LC-08 Safe Telemetry
       -> safe response
  -> LC-07 Safe Error Mapper on selection-resolution failure
```

LC-04 must complete current checks before LC-05B reads source content. LC-05A is discovery-only and cannot satisfy selected-read authorization by itself. LC-05B loads and executes exactly one selected capability after LC-04 succeeds. LC-06 is the only component that may produce the serialized success result. LC-07 is the only component that maps selection-resolution failure details to the caller-visible error.

## Explicit two-phase boundary

| Phase | Components and allowed work | Components/work explicitly excluded |
|---|---|---|
| Discovery-time readiness | LC-01 authenticates/binds the caller; LC-02 filters candidates; LC-03 resolves allowlist metadata; LC-05A performs a bounded non-content readiness probe; eligible rows become safe discovery entries. | No Climate Advisor tool loading, executable capability initialization, full capability invocation, source-content fetch, or full read for all catalog entries. |
| Selected-read execution | Climate Advisor selects one returned entry; LC-01 and LC-04 revalidate the current caller/context/selection; LC-05B loads and executes only that exact bounded capability; LC-06 shapes the result; LC-07/LC-08 handle safe failure/telemetry. | No loading/execution for unselected entries, no trust in discovery without revalidation, no alternate source, and no raw-storage fallback. |

LC-05A's readiness-positive result only permits the entry to remain eligible for discovery. It does not authorize content access. LC-05B is the only source-execution component and is reachable only after the selected-read validation succeeds.

## Cross-component data classification

| Data | Internal Core components | Climate Advisor boundary | Telemetry |
|---|---|---|---|
| Authenticated user/session evidence | LC-01/LC-04 only | Never raw | Safe caller reference only |
| Raw scope IDs and permission reasons | LC-01/LC-02/LC-04 | Never | Never/unnecessary |
| Catalog/source identity | LC-02/LC-03/LC-04/LC-05A/LC-05B | Eligible catalog handle only; source ID never | Approved identity only where safe |
| Capability ID | LC-03/LC-04/LC-06 | Core-issued ID only | Approved identity where safe |
| Source content | LC-05B/LC-06 | Typed, bounded, redacted fields only | Never |
| Storage credentials/URLs/paths | Never required at consumer boundary | Never | Never |
| Lifecycle/source failure reason | Internal only | Never; generic error | Coarse category only |
| Correlation reference | All relevant components | Existing safe contract where allowed | Safe |

## Placement of NFR controls

| Control | Primary component | Supporting component | Evidence |
|---|---|---|---|
| Service/user authentication | LC-01 | LC-04 | Auth/user-binding tests |
| All populated scope checks | LC-02 discovery, LC-04 read | Permission authority | Per-dimension denial tests |
| Active/current lifecycle | LC-02, LC-04 | Catalog owner | State-transition tests |
| Exact capability allowlist | LC-03 | LC-02/LC-04 | Unknown/mismatch/injection tests |
| Lightweight discovery readiness | LC-05A | LC-02/LC-03 | Probe-only/no-content discovery tests |
| Selected source execution/ownership | LC-05B | LC-04 | Exact-selected capability and module-double tests |
| Input/output bounds | LC-01/LC-04, LC-06 | LC-05B | Over-limit/forbidden-field tests |
| Non-disclosure | LC-02, LC-07, LC-08 | All components | Omission/error/log assertions |
| Secret/storage isolation | LC-05A/LC-05B/LC-06/LC-08 | Contract tests | Forbidden-data assertions |
| Timeout/retry/cleanup | LC-01/LC-04/LC-05A/LC-05B | Existing clients/runtime | Timeout/cleanup tests |
| Observability | LC-08 | All outcome producers | Redaction/telemetry tests |
| Rollout/rollback | Existing feature/deployment controls | LC-01/LC-02 | Core-first release evidence |

## Failure behavior by component

| Failure | Component outcome | Caller outcome |
|---|---|---|
| Missing/invalid service auth | LC-01 existing auth failure | Existing safe auth response |
| Invalid transport JSON | LC-01 existing request validation | Existing safe validation response |
| Missing/uncertain scope relationship | LC-02/LC-04 internal ineligible | Omit discovery / safe 404 read |
| Unknown or not-ready mapping | LC-03 unavailable | Omit discovery / safe 404 read |
| Withdrawn/superseded catalog row | LC-02/LC-04 ineligible | Omit discovery / safe 404 read |
| Missing/deleted/unavailable source | LC-05A/LC-05B unavailable | Omit discovery / safe 404 read |
| Timeout/dependency failure | LC-05A/LC-05B/LC-08 coarse failure | Omit/fail closed; safe 404 when selection resolution applies |
| Invalid/oversized upstream result | LC-06 reject/normalize | Safe failure; no raw data |
| Telemetry redaction failure | LC-08 suppress unsafe event | Never emit sensitive event or alter authorization |

## Scaling and performance placement

- LC-01 and LC-04 enforce bounded request and input work before source execution.
- LC-02 uses existing filtered/indexed catalog access and does not materialize raw source content for discovery.
- LC-03 uses a closed in-process/approved registry pattern; no dynamic route discovery is introduced.
- LC-05A performs only lightweight non-content readiness probes during discovery.
- LC-05B invokes one exact bounded module operation per selected capability and respects existing timeout/concurrency controls.
- LC-06 rejects or normalizes over-limit results before serialization.
- LC-08 records bounded duration and dependency categories without collecting payloads.
- No component may introduce a new authorization cache, raw-result cache, unbounded fan-out, queue, worker pool, or shared state store.

## Verification mapping

| Component | Required evidence |
|---|---|
| LC-01 | Service auth, user binding, feature gate, bounded context, timeout, token redaction |
| LC-02 | Authorized discovery; each scope denial; lifecycle/source omission; safe metadata only |
| LC-03 | Exact tuple mappings; Core-issued IDs; unknown/not-ready/injection rejection |
| LC-04 | Per-read revalidation; stale/forged/malformed/mismatched selections; no stale result |
| LC-05A | Discovery readiness probe only; no tool/capability loading; no full read/content access; omission on failure |
| LC-05B | Exact selected capability loading/execution; module ownership; timeout; dependency failure; no raw storage/credential access |
| LC-06 | Typed fields; finite bounds; redaction; invalid upstream shape; forbidden-data absence |
| LC-07 | Uniform HTTP 404/code/message; no state/reason/source disclosure |
| LC-08 | Safe fields; pre-emission redaction; coarse outcomes; no content/secrets/scope leakage |
| LC-09 | Deterministic doubles; cross-service contract fixtures; partial PBT seeds/shrinking |

## Ownership and handoff

- Core maintainers own LC-01 through LC-08 and the authoritative contract/fixtures.
- Module owners remain authoritative for LC-05A readiness signals and LC-05B source semantics/execution.
- Climate Advisor maintainers consume the contract in UOW-02 and must not recreate LC-02/LC-03/LC-04 authorization.
- UOW-03 verifies the assembled contract and security evidence without taking ownership from UOW-01.
- Any proposal to add a deployable component, persistence owner, cache, queue, topology, or alternate authorization path requires a separately approved NFR/scope change.

## Traceability

| Logical component group | NFR Requirements | Stories |
|---|---|---|
| LC-01/LC-02/LC-04 authorization and discovery | NFR-UOW01-10 through NFR-UOW01-14, NFR-UOW01-16, NFR-UOW01-20 | US-01, US-05, US-06, US-08 |
| LC-03 allowlist and contracts | NFR-UOW01-02, NFR-UOW01-11, NFR-UOW01-15, NFR-UOW01-17, NFR-UOW01-19 | US-02, US-08 |
| LC-05A lightweight readiness and LC-05B/LC-06 selected bounded execution | NFR-UOW01-01, NFR-UOW01-02, NFR-UOW01-04 through NFR-UOW01-09, NFR-UOW01-13, NFR-UOW01-16 | US-04, US-05, US-06, US-08 |
| LC-07/LC-08 non-disclosure and observability | NFR-UOW01-08, NFR-UOW01-12 through NFR-UOW01-14, NFR-UOW01-18 | US-05, US-06, US-08 |
| LC-09 verification seam | NFR-UOW01-10, NFR-UOW01-17, NFR-UOW01-22, NFR-UOW01-23 | US-08 |
