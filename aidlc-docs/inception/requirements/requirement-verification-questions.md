# Requirements Clarification Questions

Please answer every question by filling the corresponding `[Answer]:` tag. Use the letter choice that best matches the intended requirement. If none fits, choose `X` and describe the decision after the tag. These answers will be used to produce the requirements artifact and determine whether User Stories, Application Design, and Units Generation execute.

## Question 1
Which catalog entries are in the first CC-737 implementation slice?

A) All currently registered active entries whose owning modules already have a bounded Climate Advisor capability contract, beginning with GHGI and HIAP and extending to CNB only where an existing read boundary is ready.

B) GHGI inventory entries only; defer HIAP, CNB, and other producers to follow-up work.

C) All active catalog entries, including new source-specific capability contracts for every current producer.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 2
What should the catalog discovery operation return to Climate Advisor?

A) Only non-sensitive capability-selection metadata: catalog ID, kind, owning module, source type, safe labels/readiness, scope-match context, and the capability IDs that are eligible after authorization.

B) The full catalog row including all scope identifiers and source IDs, leaving presentation filtering to Climate Advisor.

C) Catalog IDs only; Climate Advisor resolves all other metadata through follow-up calls.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 3
What request context is authoritative for discovery and source reads?

A) The authenticated user identity from the user-scoped bearer token, combined with explicit request/thread scope for organization, project, city, and inventory when present; Core remains the final authority.

B) The catalog row's stored scope fields; the user token is used only for service authentication.

C) A user-selected scope supplied by the model/tool call, validated only after the source read.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 4
How should Core authorize catalog discovery when a caller has mixed access across scope levels?

A) Return only entries whose underlying scope is authorized by the authenticated user and whose source remains readable; apply least privilege and do not infer access from a broader unrelated scope.

B) Return all entries in the requested city or organization and rely on source reads to reject unauthorized entries.

C) Return entries matching any one scope field, even when another populated scope field is outside the caller's access.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 5
How should Climate Advisor select entries for source-specific tool loading?

A) Discovery returns eligible entries; a later request-time tool call accepts only catalog IDs from that discovery result, and Core revalidates each selected ID before reading.

B) Climate Advisor loads tools for every entry returned by discovery before the user selects a source.

C) The model may provide any catalog/source ID and Core performs only a normal source permission check.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 6
Which source-specific capability mapping should be used?

A) A typed allowlisted registry maps each supported `(owning_module, kind, source_type)` to one or more bounded capability IDs and transport routes; unknown mappings are unavailable.

B) Climate Advisor derives a route from `source_type` and `source_id` at runtime.

C) Core returns arbitrary capability names from catalog labels and Climate Advisor invokes them dynamically.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 7
What is the required behavior for unauthorized, cross-scope, unavailable, withdrawn, superseded, or deleted sources?

A) Use a non-disclosing result: no catalog metadata or source content; normalize indistinguishable not-found/forbidden/unavailable outcomes where practical and log only safe operational detail.

B) Return the catalog entry but omit the source content and include the reason for denial.

C) Return a distinct error for each condition so the model can explain whether the source exists but is inaccessible.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 8
What does “bounded read” mean for CC-737 source capabilities?

A) Each capability defines an explicit input schema, output schema, maximum result size/field set, and source-specific limits; no raw storage object, credential, signed URL, or unrestricted source payload is returned.

B) Bound only request payload size; response fields may follow the underlying source API.

C) Return the complete source when the caller is authorized, because Climate Advisor will trim it before model use.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 9
Where should authorization and catalog-state validation occur for a selected source read?

A) In Core on every read, immediately before resolving the module-owned source; Climate Advisor validation is advisory and cannot replace Core checks.

B) In Climate Advisor after discovery; Core trusts the selected catalog ID and service identity.

C) Only during discovery; subsequent reads reuse the discovery decision for the request lifetime.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 10
How should request-time loading behave when a selected source capability is unavailable or fails?

A) Do not register or expose the unavailable tool; return a stable non-disclosing capability error for an attempted read and preserve other eligible tools.

B) Register the tool and allow the model to retry indefinitely.

C) Fail the entire Climate Advisor request whenever one source capability is unavailable.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 11
What compatibility behavior is required for existing Climate Advisor tools?

A) Preserve current general, Stationary Energy, and Concept Note behavior; add catalog-driven tools behind the existing CA integration/feature-flag and authentication patterns without widening legacy raw datasource access.

B) Replace the current inventory and legacy datasource tools immediately with catalog-driven tools.

C) Run both systems permanently and allow the model to choose between legacy and catalog paths without routing constraints.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 12
What audit and observability is required for discovery and selected reads?

A) Record request/thread correlation, caller identity reference, selected catalog ID, capability ID, outcome category, and latency without logging credentials, raw source content, or sensitive scope data.

B) Log complete request/response payloads for troubleshooting.

C) Record only aggregate service metrics; no per-request catalog or capability event is needed.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 13
What security-test scope is required before implementation can be considered complete?

A) Core and Climate Advisor contract tests for authorized discovery/read, cross-user and cross-scope denial, unavailable/withdrawn/deleted sources, service-auth failures, bounded responses, no-storage-credential exposure, and request-time tool registration.

B) Unit tests for each new function only; cross-service authorization remains covered by existing tests.

C) End-to-end happy-path coverage only; denial and disclosure behavior is out of scope.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 14
What performance boundary should discovery and request-time source loading target?

A) Discovery and capability selection must be bounded by existing internal API/client timeouts, avoid unbounded catalog or source reads, and load only selected source tools; exact latency thresholds remain service-default unless a measured regression appears.

B) Define explicit p95 latency and maximum catalog/source counts now as release-blocking requirements.

C) Performance is not a requirement for this change.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 15
Which delivery and rollout strategy should the implementation use?

A) Add compatible internal contracts and tests first, use existing feature-flag/service-auth boundaries, and enable catalog-driven behavior only for requests that satisfy the new scope/context contract.

B) Make catalog-driven discovery the default for every Climate Advisor request immediately.

C) Introduce a separate deployment/service for catalog discovery.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 16
Should User Stories execute for CC-737?

A) Yes — this is a cross-service customer-facing capability with multiple authorization and failure scenarios; stories will clarify user value and acceptance criteria.

B) No — treat it as an internal implementation-only change and rely on the Linear acceptance criteria.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 17
Should Application Design execute for CC-737?

A) Yes — new Core capability/discovery components, cross-service contracts, and request-time orchestration need explicit component and dependency design.

B) No — keep the change entirely within existing component methods with no new interfaces or orchestration.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 18
Should Units Generation execute for CC-737?

A) Yes — the change spans Core and Climate Advisor, adds API contracts, and requires independently reviewable atomic units and cross-service test checkpoints.

B) No — implement as one small change within an existing service boundary.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 19
Should security extension rules be enforced for this project?

A) Yes — enforce all SECURITY rules as blocking constraints (recommended for production-grade applications).

B) No — skip all SECURITY rules (suitable for PoCs, prototypes, and experimental projects).

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 20
Should the resiliency baseline be applied to this project?

A) Yes — apply the resiliency baseline as directional best practices and design-time guidance (recommended for business-critical workloads, as an informed starting point that must still be validated before go-live).

B) No — skip the resiliency baseline (suitable for PoCs, prototypes, and experimental projects where rapid iteration matters more than reliability).

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 21
Should property-based testing rules be enforced for this project?

A) Yes — enforce all PBT rules as blocking constraints for business logic, data transformations, serialization, and stateful components.

B) Partial — enforce PBT rules only for pure functions and serialization round-trips.

C) No — skip all PBT rules.

X) Other (please describe after [Answer]: tag below)

[Answer]: B
