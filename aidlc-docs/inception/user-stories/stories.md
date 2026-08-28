# User Stories — CC-737

## Epic

**CC-737 — Connect NativeInputCatalog to Climate Advisor capabilities**

The stories use the approved hybrid approach: user-journey order with feature/domain labels, explicit persona mapping, first-class security/failure slices, and traceability to approved requirements and Linear acceptance criteria.

## Story Quality Rules

- Each story describes one independently reviewable outcome.
- Each story is written to satisfy INVEST: Independent, Negotiable, Valuable, Estimable, Small, and Testable.
- Primary journeys use Given/When/Then acceptance criteria.
- Cross-cutting constraints use concise bullets.
- Exact route names, class names, test-file placement, and deployment units are deferred to later design stages.

## Journey 1 — Discover eligible native inputs

### US-01 — Show only authorized native inputs

- **As a** City Climate User (P-01),
- **I want** Climate Advisor to discover the native inputs I am authorized to use in my active CityCatalyst context,
- **So that** I can ask source-backed questions without seeing another user's or workspace's data.
- **Labels**: discovery, authorization, user journey.
- **Personas**: P-01, P-02, P-03.
- **Requirements**: FR-01, FR-02, FR-06, NFR-01, NFR-02.
- **Linear traceability**: Only authorized catalog entries are discoverable.

**Acceptance criteria**:

```gherkin
Given an authenticated user with access to selected city, project, organization, or inventory resources
When Climate Advisor requests native-input discovery for the active context
Then the result contains only active entries whose applicable scope and underlying source are authorized
And the result contains only safe metadata needed for selection
And withdrawn or superseded entries are not returned as usable entries
```

**Constraints**:

- A catalog row is not an access grant.
- Service authentication alone cannot authorize a resource.
- The result must not expose credentials, storage locations, raw source content, or unnecessary sensitive scope data.

**INVEST check**: Independent discovery outcome; negotiable presentation; valuable for safe source selection; estimable within the discovery boundary; small enough for one contract; testable with authorized and filtered fixtures.

### US-02 — Understand which source capabilities are eligible

- **As a** Climate Advisor Orchestrator (P-02),
- **I want** each discovered entry to identify only its allowlisted eligible capability options,
- **So that** I can present or select a valid source operation without deriving routes from untrusted source data.
- **Labels**: discovery, capability eligibility, domain contract.
- **Personas**: P-02, P-03, P-04.
- **Requirements**: FR-02, FR-03, FR-04, NFR-07.
- **Linear traceability**: Source reads are limited to the exact authorized entry and underlying source.

**Acceptance criteria**:

```gherkin
Given an authorized active catalog entry with a supported owning module, kind, and source type
When discovery evaluates the entry for the active request
Then it returns only capability IDs from the approved allowlist
And an unsupported or unknown mapping is treated as unavailable
And no route or capability is derived from arbitrary labels or model-generated strings
```

**Constraints**:

- Capability definitions must have explicit input/output contracts and source bounds.
- Capability eligibility must reflect the existing module-owned capability boundary.

**INVEST check**: Independent mapping outcome; valuable for correct tool selection; estimable as a capability-eligibility slice; small and testable with supported/unsupported mappings.

## Journey 2 — Select and use bounded source context

### US-03 — Load only a selected source capability

- **As a** Climate Advisor Orchestrator (P-02),
- **I want** source-specific tools to load only after an authorized catalog entry is selected,
- **So that** the assistant has the smallest relevant tool surface for the active request.
- **Labels**: selection, request-time loading, orchestration.
- **Personas**: P-01, P-02, P-03.
- **Requirements**: FR-03, FR-04, FR-08, NFR-05, NFR-07.
- **Linear traceability**: Source-specific capabilities load only for catalog entries selected for the active request.

**Acceptance criteria**:

```gherkin
Given discovery returned an authorized catalog entry and an eligible capability
When the active request selects that catalog entry
Then Climate Advisor registers only the selected entry's allowlisted source tool
And it does not pre-register tools for unrelated catalog entries
And Core revalidates the selected catalog identity and caller before the read
```

**Constraints**:

- A selection not present in the authorized discovery result must fail closed.
- Existing general, Stationary Energy, Concept Note, and legacy tool behavior remains compatible.

**INVEST check**: Independent request-time loading outcome; valuable for least privilege; estimable at the orchestration boundary; small and testable by inspecting registered tools.

### US-04 — Receive bounded source-backed context

- **As a** City Climate User (P-01),
- **I want** Climate Advisor to receive only the bounded context needed from my selected source,
- **So that** I get useful assistance without exposing raw storage or unrestricted source data.
- **Labels**: bounded read, source capability, privacy.
- **Personas**: P-01, P-02, P-03, P-04.
- **Requirements**: FR-05, FR-06, FR-09, NFR-01, NFR-02, NFR-03.
- **Linear traceability**: Bounded contract and no raw storage access.

**Acceptance criteria**:

```gherkin
Given a selected catalog entry that is still active, available, and authorized
When Climate Advisor invokes its mapped source capability
Then Core validates the caller, catalog state, underlying source, and capability scope
And the response conforms to the source capability's declared input/output and size bounds
And the response contains only the fields needed by the active request
```

**Constraints**:

- Climate Advisor must not receive S3 credentials, signed URLs, raw storage objects, or unrestricted source payloads.
- The module system of record remains authoritative.
- External calls use explicit timeouts and clean up resources on failure.

**INVEST check**: Independent user value; negotiable response presentation; estimable by contract; small at one source-read boundary; testable with bounded fixtures and forbidden-field assertions.

## Journey 3 — Handle denied and unavailable context safely

### US-05 — Omit unauthorized or removed entries during discovery

- **As a** Security and Operations Reviewer (P-04),
- **I want** discovery to omit unauthorized, unavailable, withdrawn, superseded, or deleted entries without revealing metadata,
- **So that** catalog discovery cannot become an object-level authorization bypass or an existence oracle.
- **Labels**: security, non-disclosure, scope enforcement.
- **Personas**: P-01, P-02, P-03, P-04.
- **Requirements**: FR-01, FR-02, FR-06, FR-07, NFR-01, NFR-06.
- **Linear traceability**: Only authorized catalog entries are discoverable; unauthorized, unavailable, and removed entries disclose no metadata.

**Acceptance criteria**:

```gherkin
Given a catalog entry is outside the authenticated user's applicable scope
Or the entry's source is unavailable, withdrawn, superseded, missing, or deleted
When Climate Advisor requests native-input discovery
Then Core omits the entry from the discovery result
And the result does not reveal whether the entry or source exists
And the result does not reveal its labels, scope, source identity, content, credentials, or storage details
And the discovery operation applies least-privilege filtering across every populated scope dimension
```

**Constraints**:

- This story covers discovery omission only; it does not define stale or forged read behavior.
- Core authorization and source-state evaluation are authoritative.
- Exact discovery response and error semantics, if needed for transport failures, are deferred to Application Design.
- Safe telemetry may record an outcome category and correlation reference, but not secrets, raw content, or sensitive scope data.

**INVEST check**: Independent security outcome; valuable to every user; estimable as a scope-validation slice; small and testable across each scope dimension.

### US-06 — Reject stale, forged, or invalid source selections

- **As a** City Climate User (P-01),
- **I want** reads using stale, forged, or invalid catalog selections to return a stable non-disclosing error,
- **So that** a previously known or fabricated selection cannot bypass current authorization or expose source state.
- **Labels**: selection validation, availability, failure handling, non-disclosure.
- **Personas**: P-01, P-02, P-03, P-04.
- **Requirements**: FR-04, FR-06, FR-07, FR-10, NFR-01, NFR-04.
- **Linear traceability**: Source reads are limited to the exact authorized entry/underlying source; unavailable and deleted sources disclose no metadata/content.

**Acceptance criteria**:

```gherkin
Given a catalog selection is stale because the entry or source changed state
Or the selection is forged, malformed, invalid, or absent from the authorized discovery result
When Climate Advisor attempts the source read
Then Core revalidates the catalog entry, caller scope, capability mapping, and underlying source
And the read returns a stable non-disclosing error
And the error does not reveal whether the entry or source exists, its state, metadata, content, credentials, or storage details
And unrelated eligible tools remain governed independently
```

**Constraints**:

- Discovery omission for unauthorized, unavailable, and removed entries is specified by US-05.
- The exact error status, code, envelope, and normalization contract is intentionally deferred to Application Design and must be explicitly approved there.
- One invalid selection must not widen access to another source.
- The behavior must use existing timeout and error-handling conventions.

**INVEST check**: Independent failure outcome; valuable for continuity and privacy; estimable as source-state handling; small and testable with state transitions.

## Journey 4 — Preserve and verify the platform experience

### US-07 — Preserve existing Climate Advisor workflows

- **As a** CityCatalyst Core and Module Owner (P-03),
- **I want** catalog-driven capabilities to coexist with current Climate Advisor workflows,
- **So that** the integration can be introduced without breaking existing assistance or workflow-specific tool packs.
- **Labels**: compatibility, rollout, regression safety.
- **Personas**: P-01, P-02, P-03, P-04.
- **Requirements**: FR-08, FR-10, NFR-04, NFR-05.
- **Linear traceability**: Preserve existing architectural boundaries and patterns.

**Acceptance criteria**:

```gherkin
Given a request that does not satisfy the catalog-driven scope/context contract
When Climate Advisor creates the agent
Then existing general, Stationary Energy, Concept Note, inventory, and legacy behavior remains governed by its current rules
And catalog-driven tools are omitted or safely disabled
And no new storage owner or parallel catalog service is introduced
```

**Constraints**:

- Use existing feature flags, service authentication, token handling, CI/CD, and deployment conventions.
- Do not widen legacy raw datasource access as a side effect.

**INVEST check**: Independent compatibility outcome; valuable for safe rollout; estimable through regression boundaries; small and testable by existing-mode fixtures.

### US-08 — Verify CityCatalyst Core evidence

- **As a** CityCatalyst Core and Module Owner (P-03),
- **I want** Core-side contract and security evidence for catalog discovery and source reads,
- **So that** authorization, source-state validation, bounded responses, and non-disclosure are protected at the ownership boundary.
- **Labels**: Core verification, contract tests, security tests.
- **Personas**: P-03, P-04.
- **Requirements**: FR-01, FR-02, FR-03, FR-05, FR-06, FR-07, FR-09, FR-11, NFR-01, NFR-06, NFR-08.
- **Linear traceability**: Authorized discovery/read, denied cross-scope access, unavailable/deleted-source protection, bounded contract, and no raw storage access at CityCatalyst Core.

**Acceptance criteria**:

```gherkin
Given the approved catalog discovery and source-read contracts
When the CityCatalyst Core contract and security tests execute
Then they cover authorized discovery and authorized exact-source reads
And they cover cross-scope, service-auth, stale-selection, forged-selection, unavailable, withdrawn, superseded, missing, and deleted-source denial
And they assert discovery omission and stable non-disclosure without metadata leakage
And they assert bounded response fields and absence of storage credentials, signed URLs, and raw storage access
And failures provide safe, reproducible evidence without logging secrets or raw source content
```

**Constraints**:

- Core example-based tests cover critical authorization, state, and contract scenarios.
- Partial PBT covers applicable Core serialization round-trips, scope/allowlist/result invariants, domain generators, shrinking, and reproducible seeds.
- Failover and disaster-recovery execution remains an Operations responsibility under the inherited CityCatalyst process.

**INVEST check**: Independent Core evidence outcome; valuable to maintainers and reviewers; estimable at the ownership boundary; small and testable with deterministic service doubles.

### US-09 — Verify Climate Advisor evidence

- **As a** Climate Advisor Orchestrator (P-02),
- **I want** Climate Advisor-side contract and registration evidence for catalog selection and source tools,
- **So that** only selected authorized capabilities are loaded and failures remain bounded and non-disclosing at the agent boundary.
- **Labels**: Climate Advisor verification, request-time loading, contract tests.
- **Personas**: P-02, P-04.
- **Requirements**: FR-03, FR-04, FR-05, FR-07, FR-08, FR-09, FR-10, FR-11, NFR-04, NFR-05, NFR-06, NFR-08.
- **Linear traceability**: Request-time tool loading, bounded source reads, unavailable/stale-selection handling, compatibility, and Climate Advisor contract/security evidence.

**Acceptance criteria**:

```gherkin
Given the approved catalog discovery and source-read contracts
When the Climate Advisor client, tool, and agent-registration tests execute
Then they cover authorized discovery and selected-source tool registration
And they verify unrelated catalog entries do not register tools
And they cover stale, forged, invalid, unavailable, withdrawn, superseded, missing, and deleted selections using the stable non-disclosing error contract
And they assert bounded result handling and absence of storage credentials, signed URLs, and raw storage access
And they verify existing general, Stationary Energy, Concept Note, inventory, and legacy behavior remains compatible
And failures provide safe, reproducible evidence without logging secrets or raw source content
```

**Constraints**:

- Climate Advisor tests must not treat service authentication as a substitute for Core authorization.
- Example-based tests cover critical request-time and compatibility scenarios.
- Partial PBT covers applicable Climate Advisor serialization round-trips, result/error invariants, domain generators, shrinking, and reproducible seeds.

**INVEST check**: Independent Climate Advisor evidence outcome; valuable for safe agent behavior; estimable at the client/tool/registration boundary; small and testable with deterministic service doubles.

## Story-to-Requirement Traceability

| Story | Primary requirements | Linear concern |
|---|---|---|
| US-01 | FR-01, FR-02, FR-06 | Authorized discovery |
| US-02 | FR-02, FR-03, FR-04 | Allowlisted capability eligibility |
| US-03 | FR-03, FR-04, FR-08 | Request-time selected loading |
| US-04 | FR-05, FR-06, FR-09 | Bounded source read/no raw storage |
| US-05 | FR-01, FR-02, FR-06, FR-07 | Discovery omission and no metadata disclosure |
| US-06 | FR-04, FR-06, FR-07, FR-10 | Stable non-disclosing errors for stale/forged/invalid reads |
| US-07 | FR-08, FR-10 | Boundary and compatibility preservation |
| US-08 | FR-01, FR-02, FR-03, FR-05, FR-06, FR-07, FR-09, FR-11 | CityCatalyst Core contract/security evidence |
| US-09 | FR-03, FR-04, FR-05, FR-07, FR-08, FR-09, FR-10, FR-11 | Climate Advisor contract/security evidence |

## Cross-Cutting Quality Constraints

- **Security**: Service authentication never substitutes for user authorization; every resource read is object-level and fail-closed; no storage credentials or raw access cross into Climate Advisor.
- **Resiliency**: Existing CityCatalyst recovery, deployment, rollback, topology, change-management, and incident processes are inherited; explicit timeout/Core-unavailability scenarios are documented for Operations.
- **Privacy**: Discovery and read errors must be non-disclosing and logs must omit credentials, raw source content, signed URLs, and unnecessary sensitive scope data.
- **Testability**: Core and Climate Advisor contracts are independently testable with deterministic doubles and the selected Partial PBT rules.

## Story Generation Status

**Stories generated**: 9

**Personas generated**: 4

**Generation status**: Revised per change request; awaiting explicit user approval.
